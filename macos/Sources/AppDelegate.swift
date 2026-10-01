import AppKit
import UniformTypeIdentifiers

/// Routes File ▸ Open… and File ▸ Open Recent to our windows. PDBOOK is a
/// viewer, not an NSDocument app, so the default implementations would fail.
final class DocumentController: NSDocumentController {
    override func openDocument(_ sender: Any?) {
        AppDelegate.shared.showOpenPanel(for: nil)
    }

    override func openDocument(
        withContentsOf url: URL,
        display displayDocument: Bool,
        completionHandler: @escaping (NSDocument?, Bool, Error?) -> Void
    ) {
        AppDelegate.shared.open(url)
        completionHandler(nil, false, nil)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    static var shared: AppDelegate!

    private(set) var windows: [BookWindowController] = []

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Must be created before anything touches NSDocumentController.shared.
        _ = DocumentController()
        NSApp.mainMenu = MainMenu.build()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // When launched by opening a PDF, application(_:open:) already ran.
        if windows.isEmpty { newWindow().showWindow(nil) }
        NSApp.activate(ignoringOtherApps: true)
        Updater.shared.start()
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls { open(url) }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { newWindow().showWindow(nil) }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        true
    }

    // MARK: - Windows

    @discardableResult
    func newWindow() -> BookWindowController {
        let controller = BookWindowController()
        if let last = windows.last?.window, let window = controller.window {
            window.setFrameTopLeftPoint(window.cascadeTopLeft(from: NSPoint(x: last.frame.minX, y: last.frame.maxY)))
        }
        controller.onClose = { [weak self, weak controller] in
            self?.windows.removeAll { $0 === controller }
        }
        windows.append(controller)
        return controller
    }

    /// Opens a PDF: focuses it if already open, reuses an empty window, or
    /// creates a new one.
    func open(_ url: URL, preferring preferred: BookWindowController? = nil) {
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
        if let existing = windows.first(where: { $0.fileURL == url }) {
            existing.showWindow(nil)
            return
        }
        let target: BookWindowController
        if let preferred, preferred.isEmpty {
            target = preferred
        } else if let empty = windows.first(where: { $0.isEmpty }) {
            target = empty
        } else {
            target = newWindow()
        }
        target.load(url)
        target.showWindow(nil)
    }

    func showOpenPanel(for controller: BookWindowController?) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.pdf]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.message = "Choose a PDF to open as a book"
        let handle: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .OK else { return }
            for url in panel.urls { self.open(url, preferring: controller) }
        }
        if let window = controller?.window, window.isVisible {
            panel.beginSheetModal(for: window, completionHandler: handle)
        } else {
            handle(panel.runModal())
        }
    }

    @objc func newWindowAction(_ sender: Any?) {
        newWindow().showWindow(nil)
    }
}
