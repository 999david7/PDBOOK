import AppKit
import WebKit

/// One window = the library or one book. Hosts the web app in a WKWebView and
/// bridges native menus, title bar, the library folder and file opening to it.
final class BookWindowController: NSWindowController, NSWindowDelegate, NSToolbarDelegate,
    NSMenuItemValidation, NSToolbarItemValidation, WKNavigationDelegate, WKScriptMessageHandler
{
    private(set) var fileURL: URL?
    private var hasDocument = false
    private var ready = false
    private var pending: URL?
    private var pendingScripts: [String] = []
    private var webView: WKWebView!
    private let scheme: SchemeHandler
    var onClose: (() -> Void)?

    /// True while the window shows the library rather than a book.
    var isEmpty: Bool { fileURL == nil && !hasDocument }

    /// Matches the top of the page's sky gradient (--sky-top) so the title bar blends in.
    private static let background = NSColor(srgbRed: 0.804, green: 0.933, blue: 1.0, alpha: 1)
    private static let positionsKey = "lastPagePerFile"

    init() {
        let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        scheme = SchemeHandler(root: webRoot)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = tr("Library", "Bibliothek")
        window.minSize = NSSize(width: 480, height: 420)
        window.appearance = NSAppearance(named: .aqua)
        window.backgroundColor = Self.background
        window.titlebarAppearsTransparent = true
        window.toolbarStyle = .unified
        window.isReleasedWhenClosed = false
        window.tabbingIdentifier = "PDBOOK"
        window.center()
        window.setFrameAutosaveName("PDBOOKWindow")

        super.init(window: window)
        window.delegate = self

        let toolbar = NSToolbar(identifier: "PDBOOKToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        window.toolbar = toolbar

        setUpWebView(in: window)
        NotificationCenter.default.addObserver(self, selector: #selector(libraryChanged),
                                               name: Library.didChange, object: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    private func setUpWebView(in window: NSWindow) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        let content = WKUserContentController()
        content.add(WeakMessageHandler(self), name: "pdbook")
        content.addUserScript(WKUserScript(
            source: "window.PDBOOK_NATIVE = true; window.PDBOOK_LANG = \(js(appLanguage));",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.userContentController = content

        let webView = BookWebView(frame: window.contentLayoutRect, configuration: config)
        webView.onDragHover = { [weak self] over, pictures in
            self?.run("window.pdbook.dragOverlay(\(over), \(pictures))")
        }
        webView.onDrop = { [weak self] urls in self?.dropped(urls) }
        webView.setValue(false, forKey: "drawsBackground") // no white flash
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        window.contentView = webView
        self.webView = webView

        webView.load(URLRequest(url: URL(string: "\(SchemeHandler.scheme)://app/index.html")!))
    }

    // MARK: - Opening

    func load(_ url: URL) {
        fileURL = url
        window?.title = url.deletingPathExtension().lastPathComponent
        window?.representedURL = url // proxy icon in the title bar
        window?.subtitle = ""
        if ready { send(url) } else { pending = url }
    }

    private func send(_ url: URL) {
        let path = scheme.register(url)
        let start = (UserDefaults.standard.dictionary(forKey: Self.positionsKey)?[url.path] as? Int) ?? 0
        let title = Library.title(of: url).map(js) ?? "null"
        run("window.pdbook.open(\(js(path)), \(js(url.lastPathComponent)), \(start), \(title))")
    }

    private func run(_ script: String) {
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func js(_ string: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: string, options: .fragmentsAllowed)
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
    }

    // MARK: - Messages from the page

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            ready = true
            pushLibrary()
            if let url = pending {
                pending = nil
                send(url)
            }
            pendingScripts.forEach(run)
            pendingScripts = []
        case "open":
            AppDelegate.shared.showOpenPanel(for: self)
        case "document":
            hasDocument = true
            if let title = body["title"] as? String, !title.isEmpty { window?.title = title }
        case "page":
            window?.subtitle = body["label"] as? String ?? ""
            if let url = fileURL, let index = body["index"] as? Int { savePosition(index, for: url) }
        case "fullscreen":
            window?.toggleFullScreen(nil)
        case "library.shown":
            fileURL = nil
            hasDocument = false
            window?.title = tr("Library", "Bibliothek")
            window?.subtitle = ""
            window?.representedURL = nil
        case "library.open":
            if let name = body["name"] as? String, let url = Library.shared.file(named: name) {
                AppDelegate.shared.open(url, preferring: self)
            }
        case "library.rename":
            if let name = body["name"] as? String, let title = body["title"] as? String {
                renameBook(name: name, title: title)
            }
        case "library.add":
            AppDelegate.shared.addBooks(for: self)
        case "library.remove":
            if let name = body["name"] as? String {
                confirmRemove(name: name, title: body["title"] as? String ?? name)
            }
        case "library.reveal":
            AppDelegate.shared.showLibraryInFinder(nil)
        case "library.change":
            AppDelegate.shared.changeLibraryLocation(nil)
        case "library.choose":
            AppDelegate.shared.promptForLibrary(in: window)
        case "library.restore":
            AppDelegate.shared.restoreSampleBooks(nil)
        case "pictures.pick":
            AppDelegate.shared.pickPictures(for: self)
        case "pictures.save":
            savePictureBook(title: body["title"] as? String ?? "", base64: body["data"] as? String ?? "")
        default:
            break
        }
    }

    // MARK: - Library

    @objc private func libraryChanged() {
        pushLibrary()
    }

    private func pushLibrary() {
        guard ready,
              let data = try? JSONSerialization.data(withJSONObject: Library.shared.payload()),
              let json = String(data: data, encoding: .utf8) else { return }
        run("window.pdbook.library(\(json))")
    }

    func toast(_ text: String) {
        run("window.pdbook.toast(\(js(text)))")
    }

    private func renameBook(name: String, title: String) {
        guard let url = Library.shared.file(named: name) else { return }
        do {
            let renamed = try Library.shared.rename(url, to: title)
            // Keep the reading position, which is remembered per file.
            var positions = UserDefaults.standard.dictionary(forKey: Self.positionsKey) ?? [:]
            if renamed != url, let index = positions.removeValue(forKey: url.path) {
                positions[renamed.path] = index
                UserDefaults.standard.set(positions, forKey: Self.positionsKey)
            }
        } catch {
            pushLibrary() // show the old name again
            if let window { NSAlert(error: error).beginSheetModal(for: window) }
        }
    }

    private func confirmRemove(name: String, title: String) {
        guard let url = Library.shared.file(named: name), let window else { return }
        let alert = NSAlert()
        alert.messageText = tr("Move “\(title)” to the Trash?", "„\(title)“ in den Papierkorb legen?")
        alert.informativeText = tr("It will be removed from your library. You can restore it from the Trash.", "Es wird aus deiner Bibliothek entfernt. Du kannst es aus dem Papierkorb wiederherstellen.")
        alert.addButton(withTitle: tr("Move to Trash", "In den Papierkorb legen"))
        alert.addButton(withTitle: tr("Cancel", "Abbrechen"))
        alert.buttons.first?.hasDestructiveAction = true
        alert.beginSheetModal(for: window) { response in
            guard response == .alertFirstButtonReturn else { return }
            Library.shared.moveToTrash(url) { error in
                if let error { NSAlert(error: error).runModal() }
            }
        }
    }

    // MARK: - Book from pictures

    /// Finds the pages in the photos and reads capture times and printed page
    /// numbers, then hands the pictures to the page, which sorts them and lets
    /// the user check the order.
    func makeBook(from urls: [URL]) {
        let files = Pictures.collect(urls)
        guard !files.isEmpty else {
            return toast(tr("No pictures found there", "Dort wurden keine Bilder gefunden"))
        }
        let total = files.count
        let reading = tr("Looking at your pictures…", "Deine Bilder werden angeschaut …")
        busy("\(reading) 0 / \(total)")
        Pictures.analyze(files, progress: { [weak self] done in
            self?.busy("\(reading) \(done) / \(total)")
        }) { [weak self] infos in
            guard let self else { return }
            self.busy(nil)
            guard !infos.isEmpty else {
                return self.toast(tr("None of the pictures could be read", "Keines der Bilder konnte gelesen werden"))
            }
            let ms = { (date: Date?) -> Any in date.map { Int($0.timeIntervalSince1970 * 1000) } ?? NSNull() }
            let list: [[String: Any]] = infos.map { info in [
                "url": self.scheme.registerPicture(info),
                "name": info.url.lastPathComponent,
                "taken": ms(info.taken),
                "modified": ms(info.modified),
                "pageNumber": info.pageNumber ?? NSNull(),
                "aspect": info.aspect,
            ] }
            let parents = Set(infos.map { $0.url.deletingLastPathComponent() })
            let folder = parents.count == 1 ? parents.first!.lastPathComponent : ""
            guard let data = try? JSONSerialization.data(withJSONObject: list),
                  let json = String(data: data, encoding: .utf8) else { return }
            let script = "window.pdbook.pictures(\(json), \(self.js(folder)))"
            if self.ready { self.run(script) } else { self.pendingScripts.append(script) }
        }
    }

    /// The page made a PDF from the pictures: keep it in the library and open it.
    private func savePictureBook(title: String, base64: String) {
        guard let data = Data(base64Encoded: base64) else { return busy(nil) }
        do {
            let url = try Library.shared.save(data, title: title)
            AppDelegate.shared.open(url, preferring: self)
        } catch {
            busy(nil)
            NSAlert(error: error).runModal()
        }
    }

    private func busy(_ text: String?) {
        let script = "window.pdbook.busy(\(text.map(js) ?? "null"))"
        if ready { run(script) } else if text == nil { pendingScripts.append(script) }
    }

    /// PDFs dropped on the window are added to the library; a single one opens.
    /// Pictures (or folders of them) dropped on their own become a new book.
    private func dropped(_ urls: [URL]) {
        let pdfs = urls.filter { $0.pathExtension.lowercased() == "pdf" }
        if pdfs.isEmpty { return makeBook(from: urls) }
        let urls = pdfs
        guard Library.shared.isConfigured else {
            if let first = urls.first { AppDelegate.shared.open(first, preferring: self) }
            return
        }
        do {
            let added = try Library.shared.add(urls)
            if added.count == 1 {
                AppDelegate.shared.open(added[0], preferring: self)
            } else {
                toast(tr("Added \(added.count) books to your library", "\(added.count) Bücher zur Bibliothek hinzugefügt"))
            }
        } catch {
            NSAlert(error: error).runModal()
        }
    }

    private var canAddCurrent: Bool {
        guard let fileURL else { return false }
        return Library.shared.isConfigured && !Library.shared.contains(fileURL)
    }

    private func savePosition(_ index: Int, for url: URL) {
        var positions = UserDefaults.standard.dictionary(forKey: Self.positionsKey) ?? [:]
        positions[url.path] = index
        if positions.count > 200 { positions.removeValue(forKey: positions.keys.first!) }
        UserDefaults.standard.set(positions, forKey: Self.positionsKey)
    }

    // MARK: - Menu actions (reached through the responder chain)

    @objc func nextPage(_ sender: Any?) { run("window.pdbook.next()") }
    @objc func previousPage(_ sender: Any?) { run("window.pdbook.prev()") }
    @objc func firstPage(_ sender: Any?) { run("window.pdbook.first()") }
    @objc func lastPage(_ sender: Any?) { run("window.pdbook.last()") }
    @objc func openFromToolbar(_ sender: Any?) { AppDelegate.shared.showOpenPanel(for: self) }
    @objc func addBooksFromToolbar(_ sender: Any?) { AppDelegate.shared.addBooks(for: self) }
    @objc func showLibrary(_ sender: Any?) { run("window.pdbook.showLibrary()") }

    @objc func addCurrentToLibrary(_ sender: Any?) {
        guard canAddCurrent, let current = fileURL else { return }
        do {
            guard let copy = try Library.shared.add([current]).first else { return }
            fileURL = copy
            window?.representedURL = copy
            toast(tr("Added to your library", "Zur Bibliothek hinzugefügt"))
        } catch {
            NSAlert(error: error).runModal()
        }
    }

    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        switch item.action {
        case #selector(nextPage(_:)), #selector(previousPage(_:)), #selector(firstPage(_:)), #selector(lastPage(_:)),
             #selector(showLibrary(_:)):
            return hasDocument
        case #selector(addCurrentToLibrary(_:)):
            return canAddCurrent
        default:
            return true
        }
    }

    func validateToolbarItem(_ item: NSToolbarItem) -> Bool {
        switch item.itemIdentifier {
        case Self.prevItem, Self.nextItem, Self.libraryItem: return hasDocument
        case Self.saveItem: return canAddCurrent
        default: return true
        }
    }

    // MARK: - Toolbar

    private static let openItem = NSToolbarItem.Identifier("open")
    private static let libraryItem = NSToolbarItem.Identifier("library")
    private static let addItem = NSToolbarItem.Identifier("add")
    private static let saveItem = NSToolbarItem.Identifier("save")
    private static let prevItem = NSToolbarItem.Identifier("prev")
    private static let nextItem = NSToolbarItem.Identifier("next")

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [Self.libraryItem, Self.prevItem, Self.nextItem, .flexibleSpace, Self.saveItem, Self.addItem, Self.openItem]
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        toolbarDefaultItemIdentifiers(toolbar)
    }

    func toolbar(
        _ toolbar: NSToolbar,
        itemForItemIdentifier id: NSToolbarItem.Identifier,
        willBeInsertedIntoToolbar flag: Bool
    ) -> NSToolbarItem? {
        let item = NSToolbarItem(itemIdentifier: id)
        item.isBordered = true
        switch id {
        case Self.openItem:
            item.label = tr("Open", "Öffnen")
            item.toolTip = tr("Open a PDF (⌘O)", "Ein PDF öffnen (⌘O)")
            item.image = NSImage(systemSymbolName: "folder", accessibilityDescription: tr("Open", "Öffnen"))
            item.action = #selector(openFromToolbar(_:))
        case Self.libraryItem:
            item.label = tr("Library", "Bibliothek")
            item.toolTip = tr("Back to your library (⌘L)", "Zurück zur Bibliothek (⌘L)")
            item.image = NSImage(systemSymbolName: "books.vertical", accessibilityDescription: tr("Library", "Bibliothek"))
            item.action = #selector(showLibrary(_:))
            item.isNavigational = true
        case Self.addItem:
            item.label = tr("Add Books", "Bücher hinzufügen")
            item.toolTip = tr("Add PDFs to your library (⇧⌘O)", "PDFs zur Bibliothek hinzufügen (⇧⌘O)")
            item.image = NSImage(systemSymbolName: "plus", accessibilityDescription: "Add books")
            item.action = #selector(addBooksFromToolbar(_:))
        case Self.saveItem:
            item.label = tr("Add to Library", "Zur Bibliothek hinzufügen")
            item.toolTip = tr("Save this book in your library (⌘D)", "Dieses Buch in der Bibliothek speichern (⌘D)")
            item.image = NSImage(systemSymbolName: "tray.and.arrow.down", accessibilityDescription: "Add to library")
            item.action = #selector(addCurrentToLibrary(_:))
        case Self.prevItem:
            item.label = tr("Previous", "Zurück")
            item.toolTip = tr("Previous page (←)", "Vorherige Seite (←)")
            item.image = NSImage(systemSymbolName: "chevron.left", accessibilityDescription: "Previous page")
            item.action = #selector(previousPage(_:))
            item.isNavigational = true
        case Self.nextItem:
            item.label = tr("Next", "Weiter")
            item.toolTip = tr("Next page (→)", "Nächste Seite (→)")
            item.image = NSImage(systemSymbolName: "chevron.right", accessibilityDescription: "Next page")
            item.action = #selector(nextPage(_:))
            item.isNavigational = true
        default:
            return nil
        }
        item.target = self
        return item
    }

    // MARK: - Navigation policy

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.scheme == SchemeHandler.scheme { return decisionHandler(.allow) }
        decisionHandler(.cancel)
        if url.isFileURL, url.pathExtension.lowercased() == "pdf" {
            AppDelegate.shared.open(url, preferring: self)
        } else if ["http", "https", "mailto"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // Reload and reopen the current book if WebKit's process crashed.
        ready = false
        pending = fileURL
        webView.reload()
    }

    // MARK: - Window

    func windowWillClose(_ notification: Notification) {
        NotificationCenter.default.removeObserver(self)
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "pdbook")
        onClose?()
    }
}

/// Breaks the WKUserContentController → handler retain cycle.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

/// Handles PDF and picture drops natively so they can be copied into the
/// library or analysed (the page only sees File objects, not paths).
private final class BookWebView: WKWebView {
    var onDrop: (([URL]) -> Void)?
    var onDragHover: ((_ over: Bool, _ pictures: Bool) -> Void)?
    private var handlingDrag = false

    private func files(_ info: NSDraggingInfo) -> [URL] {
        info.draggingPasteboard.readObjects(
            forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
    }

    override func draggingEntered(_ info: NSDraggingInfo) -> NSDragOperation {
        let urls = files(info)
        let hasPDF = urls.contains { $0.pathExtension.lowercased() == "pdf" }
        handlingDrag = hasPDF || !Pictures.collect(urls).isEmpty
        guard handlingDrag else { return super.draggingEntered(info) }
        onDragHover?(true, !hasPDF)
        return .copy
    }

    override func draggingUpdated(_ info: NSDraggingInfo) -> NSDragOperation {
        handlingDrag ? .copy : super.draggingUpdated(info)
    }

    override func draggingExited(_ info: NSDraggingInfo?) {
        guard handlingDrag else { return super.draggingExited(info) }
        handlingDrag = false
        onDragHover?(false, false)
    }

    override func prepareForDragOperation(_ info: NSDraggingInfo) -> Bool {
        handlingDrag ? true : super.prepareForDragOperation(info)
    }

    override func performDragOperation(_ info: NSDraggingInfo) -> Bool {
        guard handlingDrag else { return super.performDragOperation(info) }
        handlingDrag = false
        onDragHover?(false, false)
        onDrop?(files(info))
        return true
    }
}
