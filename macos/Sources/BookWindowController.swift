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
    private var webView: WKWebView!
    private let scheme: SchemeHandler
    var onClose: (() -> Void)?

    /// True while the window shows the library rather than a book.
    var isEmpty: Bool { fileURL == nil && !hasDocument }

    private static let background = NSColor(srgbRed: 0.106, green: 0.094, blue: 0.082, alpha: 1)
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
        window.title = "Library"
        window.minSize = NSSize(width: 480, height: 420)
        window.appearance = NSAppearance(named: .darkAqua)
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
            source: "window.PDBOOK_NATIVE = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        config.userContentController = content

        let webView = BookWebView(frame: window.contentLayoutRect, configuration: config)
        webView.onDragHover = { [weak self] over in self?.run("window.pdbook.dragOverlay(\(over))") }
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
        run("window.pdbook.open(\(js(path)), \(js(url.lastPathComponent)), \(start))")
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
            window?.title = "Library"
            window?.subtitle = ""
            window?.representedURL = nil
        case "library.open":
            if let name = body["name"] as? String, let url = Library.shared.file(named: name) {
                AppDelegate.shared.open(url, preferring: self)
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

    private func confirmRemove(name: String, title: String) {
        guard let url = Library.shared.file(named: name), let window else { return }
        let alert = NSAlert()
        alert.messageText = "Move “\(title)” to the Trash?"
        alert.informativeText = "It will be removed from your library. You can restore it from the Trash."
        alert.addButton(withTitle: "Move to Trash")
        alert.addButton(withTitle: "Cancel")
        alert.buttons.first?.hasDestructiveAction = true
        alert.beginSheetModal(for: window) { response in
            guard response == .alertFirstButtonReturn else { return }
            Library.shared.moveToTrash(url) { error in
                if let error { NSAlert(error: error).runModal() }
            }
        }
    }

    /// PDFs dropped on the window are added to the library; a single one opens.
    private func dropped(_ urls: [URL]) {
        guard Library.shared.isConfigured else {
            if let first = urls.first { AppDelegate.shared.open(first, preferring: self) }
            return
        }
        do {
            let added = try Library.shared.add(urls)
            if added.count == 1 {
                AppDelegate.shared.open(added[0], preferring: self)
            } else {
                toast("Added \(added.count) books to your library")
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
            toast("Added to your library")
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
            item.label = "Open"
            item.toolTip = "Open a PDF (⌘O)"
            item.image = NSImage(systemSymbolName: "folder", accessibilityDescription: "Open")
            item.action = #selector(openFromToolbar(_:))
        case Self.libraryItem:
            item.label = "Library"
            item.toolTip = "Back to your library (⌘L)"
            item.image = NSImage(systemSymbolName: "books.vertical", accessibilityDescription: "Library")
            item.action = #selector(showLibrary(_:))
            item.isNavigational = true
        case Self.addItem:
            item.label = "Add Books"
            item.toolTip = "Add PDFs to your library (⇧⌘O)"
            item.image = NSImage(systemSymbolName: "plus", accessibilityDescription: "Add books")
            item.action = #selector(addBooksFromToolbar(_:))
        case Self.saveItem:
            item.label = "Add to Library"
            item.toolTip = "Save this book in your library (⌘D)"
            item.image = NSImage(systemSymbolName: "tray.and.arrow.down", accessibilityDescription: "Add to library")
            item.action = #selector(addCurrentToLibrary(_:))
        case Self.prevItem:
            item.label = "Previous"
            item.toolTip = "Previous page (←)"
            item.image = NSImage(systemSymbolName: "chevron.left", accessibilityDescription: "Previous page")
            item.action = #selector(previousPage(_:))
            item.isNavigational = true
        case Self.nextItem:
            item.label = "Next"
            item.toolTip = "Next page (→)"
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

/// Handles PDF file drops natively so they can be copied into the library
/// (the page only sees File objects, not paths).
private final class BookWebView: WKWebView {
    var onDrop: (([URL]) -> Void)?
    var onDragHover: ((Bool) -> Void)?
    private var handlingDrag = false

    private func pdfs(_ info: NSDraggingInfo) -> [URL] {
        let urls = info.draggingPasteboard.readObjects(
            forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        return urls.filter { $0.pathExtension.lowercased() == "pdf" }
    }

    override func draggingEntered(_ info: NSDraggingInfo) -> NSDragOperation {
        handlingDrag = !pdfs(info).isEmpty
        guard handlingDrag else { return super.draggingEntered(info) }
        onDragHover?(true)
        return .copy
    }

    override func draggingUpdated(_ info: NSDraggingInfo) -> NSDragOperation {
        handlingDrag ? .copy : super.draggingUpdated(info)
    }

    override func draggingExited(_ info: NSDraggingInfo?) {
        guard handlingDrag else { return super.draggingExited(info) }
        handlingDrag = false
        onDragHover?(false)
    }

    override func prepareForDragOperation(_ info: NSDraggingInfo) -> Bool {
        handlingDrag ? true : super.prepareForDragOperation(info)
    }

    override func performDragOperation(_ info: NSDraggingInfo) -> Bool {
        guard handlingDrag else { return super.performDragOperation(info) }
        handlingDrag = false
        onDragHover?(false)
        onDrop?(pdfs(info))
        return true
    }
}
