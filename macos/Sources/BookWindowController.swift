import AppKit
import WebKit

/// One window = one book. Hosts the web app in a WKWebView and bridges
/// native menus, title bar and file opening to it.
final class BookWindowController: NSWindowController, NSWindowDelegate, NSToolbarDelegate,
    NSMenuItemValidation, WKNavigationDelegate, WKScriptMessageHandler
{
    private(set) var fileURL: URL?
    private var hasDocument = false
    private var ready = false
    private var pending: URL?
    private var webView: WKWebView!
    private let scheme: SchemeHandler
    var onClose: (() -> Void)?

    /// True while the window still shows the welcome screen.
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
        window.title = "PDBOOK"
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

        let webView = WKWebView(frame: window.contentLayoutRect, configuration: config)
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
        default:
            break
        }
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

    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        switch item.action {
        case #selector(nextPage(_:)), #selector(previousPage(_:)), #selector(firstPage(_:)), #selector(lastPage(_:)):
            return hasDocument
        default:
            return true
        }
    }

    // MARK: - Toolbar

    private static let openItem = NSToolbarItem.Identifier("open")
    private static let prevItem = NSToolbarItem.Identifier("prev")
    private static let nextItem = NSToolbarItem.Identifier("next")

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [Self.prevItem, Self.nextItem, .flexibleSpace, Self.openItem]
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
