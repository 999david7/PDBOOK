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
        if !Library.shared.isConfigured {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                self.promptForLibrary(in: self.windows.first?.window)
            }
        }
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
        panel.message = tr("Choose a PDF to open as a book", "Wähle ein PDF, das als Buch geöffnet werden soll")
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

    // MARK: - Library

    private var keyController: BookWindowController? {
        NSApp.keyWindow?.windowController as? BookWindowController ?? windows.first
    }

    /// First run (or if the user dismissed it): choose where the library lives.
    func promptForLibrary(in window: NSWindow?) {
        let alert = NSAlert()
        alert.icon = NSApp.applicationIconImage
        alert.messageText = tr("Where should PDBOOK keep your books?", "Wo soll PDBOOK deine Bücher aufbewahren?")
        alert.informativeText = tr(
            "PDBOOK will create a “\(Library.folderName)” folder there. Books you add are copied into it, "
                + "and five free sample books are included to get you started — you can delete any of them.",
            "PDBOOK legt dort einen Ordner „\(Library.folderName)“ an. Bücher, die du hinzufügst, werden dorthin "
                + "kopiert, und fünf kostenlose Beispielbücher sind für den Anfang dabei – du kannst jedes davon löschen.")
        alert.addButton(withTitle: tr("Use Documents Folder", "Ordner „Dokumente“ verwenden"))
        alert.addButton(withTitle: tr("Choose Folder…", "Ordner wählen …"))
        let handle: (NSApplication.ModalResponse) -> Void = { response in
            if response == .alertFirstButtonReturn {
                let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                self.perform { try Library.shared.setUp(in: documents) }
            } else {
                self.chooseFolder(for: window, prompt: tr("Create Library Here", "Bibliothek hier anlegen")) { parent in
                    self.perform { try Library.shared.setUp(in: parent) }
                }
            }
        }
        if let window, window.isVisible, window.attachedSheet == nil {
            alert.beginSheetModal(for: window, completionHandler: handle)
        } else {
            handle(alert.runModal())
        }
    }

    private func chooseFolder(for window: NSWindow?, prompt: String, completion: @escaping (URL) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = prompt
        panel.message = tr("PDBOOK will create a “\(Library.folderName)” folder in the location you choose.",
                           "PDBOOK legt am gewählten Ort einen Ordner „\(Library.folderName)“ an.")
        panel.directoryURL = Library.shared.folder?.deletingLastPathComponent()
            ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        let handle: (NSApplication.ModalResponse) -> Void = { response in
            if response == .OK, let url = panel.url { completion(url) }
        }
        if let window, window.isVisible { panel.beginSheetModal(for: window, completionHandler: handle) }
        else { handle(panel.runModal()) }
    }

    private func perform(_ work: () throws -> Void) {
        do { try work() } catch { NSAlert(error: error).runModal() }
    }

    /// Lets the user pick PDFs and copies them into the library.
    func addBooks(for controller: BookWindowController?) {
        guard Library.shared.isConfigured else { return promptForLibrary(in: controller?.window) }
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.pdf]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.prompt = tr("Add to Library", "Zur Bibliothek hinzufügen")
        panel.message = tr("Choose PDFs to copy into your library", "Wähle PDFs, die in deine Bibliothek kopiert werden sollen")
        let handle: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .OK else { return }
            self.perform {
                let added = try Library.shared.add(panel.urls)
                controller?.toast(added.count == 1
                    ? tr("Added 1 book to your library", "1 Buch zur Bibliothek hinzugefügt")
                    : tr("Added \(added.count) books to your library", "\(added.count) Bücher zur Bibliothek hinzugefügt"))
            }
        }
        if let window = controller?.window, window.isVisible {
            panel.beginSheetModal(for: window, completionHandler: handle)
        } else {
            handle(panel.runModal())
        }
    }

    /// Lets the user pick pictures (or a folder of them) to make a new book from.
    func pickPictures(for controller: BookWindowController?) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = true
        panel.prompt = tr("Make Book", "Buch machen")
        panel.message = tr("Choose the pictures for your book, or a folder of pictures. PDBOOK puts them in order for you.",
                           "Wähle die Bilder für dein Buch oder einen Ordner mit Bildern. PDBOOK bringt sie für dich in die richtige Reihenfolge.")
        let handle: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .OK else { return }
            let target = controller ?? self.windows.first(where: { $0.isEmpty }) ?? self.newWindow()
            target.showWindow(nil)
            target.makeBook(from: panel.urls)
        }
        if let window = controller?.window, window.isVisible {
            panel.beginSheetModal(for: window, completionHandler: handle)
        } else {
            handle(panel.runModal())
        }
    }

    @objc func makeBookFromPictures(_ sender: Any?) {
        pickPictures(for: keyController)
    }

    @objc func addBooksToLibrary(_ sender: Any?) {
        addBooks(for: keyController)
    }

    @objc func changeLibraryLocation(_ sender: Any?) {
        guard Library.shared.isConfigured else { return promptForLibrary(in: keyController?.window) }
        chooseFolder(for: keyController?.window, prompt: tr("Move Library Here", "Bibliothek hierher bewegen")) { parent in
            self.perform { try Library.shared.move(to: parent) }
        }
    }

    @objc func showLibraryInFinder(_ sender: Any?) {
        guard let folder = Library.shared.folder else { return promptForLibrary(in: keyController?.window) }
        NSWorkspace.shared.activateFileViewerSelecting([folder])
    }

    @objc func restoreSampleBooks(_ sender: Any?) {
        guard Library.shared.isConfigured else { return promptForLibrary(in: keyController?.window) }
        let count = Library.shared.installSamples()
        keyController?.toast(count == 0 ? tr("All sample books are already in your library", "Alle Beispielbücher sind bereits in deiner Bibliothek")
                                        : count == 1 ? tr("Restored 1 sample book", "1 Beispielbuch wiederhergestellt")
                                        : tr("Restored \(count) sample books", "\(count) Beispielbücher wiederhergestellt"))
    }
}
