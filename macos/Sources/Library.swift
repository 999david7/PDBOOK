import AppKit

/// The user's book collection: a "PDBOOK Library" folder in a location they
/// choose. Books added through the app are copied in; anything dropped into
/// the folder in Finder shows up too. The bundled sample books are copied in
/// once, and stay deleted if the user removes them.
final class Library {
    static let shared = Library()
    static let didChange = Notification.Name("PDBOOKLibraryDidChange")
    static let folderName = tr("PDBOOK Library", "PDBOOK Bibliothek")

    private enum Keys {
        static let path = "LibraryPath"
        static let samplesInstalled = "SampleBooksInstalled"
    }

    private let fm = FileManager.default
    private var watcher: DispatchSourceFileSystemObject?
    private var pendingNotify: DispatchWorkItem?

    private init() {
        if folder != nil { watch() }
    }

    // MARK: - Location

    /// The library folder, recreated if the user deleted it.
    var folder: URL? {
        guard let path = UserDefaults.standard.string(forKey: Keys.path) else { return nil }
        let url = URL(fileURLWithPath: path, isDirectory: true)
        if !fm.fileExists(atPath: url.path) {
            try? fm.createDirectory(at: url, withIntermediateDirectories: true)
        }
        return url
    }

    var isConfigured: Bool { folder != nil }

    /// Creates (or adopts) "PDBOOK Library" inside `parent`.
    func setUp(in parent: URL) throws {
        let dir = parent.appendingPathComponent(Self.folderName, isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        UserDefaults.standard.set(dir.path, forKey: Keys.path)
        if !UserDefaults.standard.bool(forKey: Keys.samplesInstalled) {
            installSamples()
            UserDefaults.standard.set(true, forKey: Keys.samplesInstalled)
        }
        watch()
        notify()
    }

    /// Moves the whole library into `parent`. If a library folder already
    /// exists there, the books are merged into it.
    func move(to parent: URL) throws {
        guard let old = folder else { return try setUp(in: parent) }
        let new = parent.appendingPathComponent(Self.folderName, isDirectory: true)
        guard new.standardizedFileURL != old.standardizedFileURL else { return }
        if fm.fileExists(atPath: new.path) {
            for file in pdfs(in: old) {
                let target = uniqueDestination(for: file.lastPathComponent, in: new)
                try fm.moveItem(at: file, to: target)
            }
            try? fm.removeItem(at: old) // only succeeds if now empty
        } else {
            try fm.moveItem(at: old, to: new)
        }
        UserDefaults.standard.set(new.path, forKey: Keys.path)
        watch()
        notify()
    }

    // MARK: - Books

    struct Book {
        let url: URL
        let size: Int
        let modified: Date
        let added: Date
    }

    func books() -> [Book] {
        guard let folder else { return [] }
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey, .creationDateKey]
        return pdfs(in: folder).compactMap { url in
            guard let v = try? url.resourceValues(forKeys: Set(keys)) else { return nil }
            return Book(url: url, size: v.fileSize ?? 0,
                        modified: v.contentModificationDate ?? .distantPast,
                        added: v.creationDate ?? .distantPast)
        }
        .sorted {
            // Newest first; books added together keep their name order.
            let a = $0.added.timeIntervalSince1970.rounded(), b = $1.added.timeIntervalSince1970.rounded()
            return a != b ? a > b : $0.url.lastPathComponent.localizedStandardCompare($1.url.lastPathComponent) == .orderedAscending
        }
    }

    func contains(_ url: URL) -> Bool {
        guard let folder else { return false }
        return url.deletingLastPathComponent().standardizedFileURL == folder.standardizedFileURL
    }

    /// Resolves a file name from the page to a book in the library.
    func file(named name: String) -> URL? {
        guard let folder, !name.isEmpty, !name.contains("/"), name != "..", name != "." else { return nil }
        let url = folder.appendingPathComponent(name)
        return fm.fileExists(atPath: url.path) ? url : nil
    }

    /// Copies PDFs into the library; returns where each one ended up.
    @discardableResult
    func add(_ urls: [URL]) throws -> [URL] {
        guard let folder else { return [] }
        var result: [URL] = []
        for url in urls where url.pathExtension.lowercased() == "pdf" {
            if contains(url) {
                result.append(url)
                continue
            }
            // Same name and size already there: treat it as the same book.
            let existing = folder.appendingPathComponent(url.lastPathComponent)
            if let a = try? fm.attributesOfItem(atPath: existing.path)[.size] as? Int,
               let b = try? fm.attributesOfItem(atPath: url.path)[.size] as? Int, a == b {
                result.append(existing)
                continue
            }
            let target = uniqueDestination(for: url.lastPathComponent, in: folder)
            try fm.copyItem(at: url, to: target)
            result.append(target)
        }
        notify()
        return result
    }

    /// Writes a new book (one made from pictures) into the library, or into a
    /// temporary folder while there is no library yet. Returns its location.
    func save(_ data: Data, title: String) throws -> URL {
        var name = title.components(separatedBy: CharacterSet(charactersIn: "/:\\"))
            .joined(separator: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        while name.hasPrefix(".") { name.removeFirst() }
        if name.isEmpty { name = tr("Picture Book", "Bilderbuch") }
        let dir = folder ?? fm.temporaryDirectory
        let target = uniqueDestination(for: String(name.prefix(120)) + ".pdf", in: dir)
        try data.write(to: target, options: .atomic)
        notify()
        return target
    }

    func moveToTrash(_ url: URL, completion: @escaping (Error?) -> Void) {
        NSWorkspace.shared.recycle([url]) { _, error in
            DispatchQueue.main.async {
                self.notify()
                completion(error)
            }
        }
    }

    /// Copies back any bundled sample books that aren't in the library.
    @discardableResult
    func installSamples() -> Int {
        guard let folder,
              let samples = Bundle.main.resourceURL?.appendingPathComponent("web/samples/\(appLanguage)", isDirectory: true)
        else { return 0 }
        var count = 0
        for file in pdfs(in: samples) {
            let target = folder.appendingPathComponent(file.lastPathComponent)
            if fm.fileExists(atPath: target.path) { continue }
            if (try? fm.copyItem(at: file, to: target)) != nil { count += 1 }
        }
        notify()
        return count
    }

    // MARK: - Page payload

    /// What the library screen needs, as JSON-compatible values.
    func payload() -> [String: Any] {
        guard let folder else { return ["configured": false, "books": []] }
        let home = NSHomeDirectory()
        let display = folder.path.hasPrefix(home) ? "~" + folder.path.dropFirst(home.count) : folder.path
        let books: [[String: Any]] = books().map { book in
            let name = book.url.lastPathComponent
            let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
            return [
                "name": name,
                "size": book.size,
                "mtime": Int(book.modified.timeIntervalSince1970 * 1000),
                "url": "/__lib/\(encoded)",
            ]
        }
        return ["configured": true, "location": display, "books": books]
    }

    // MARK: - Helpers

    private func pdfs(in dir: URL) -> [URL] {
        let items = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil,
                                                 options: [.skipsHiddenFiles])) ?? []
        return items.filter { $0.pathExtension.lowercased() == "pdf" }
    }

    private func uniqueDestination(for name: String, in dir: URL) -> URL {
        let base = (name as NSString).deletingPathExtension
        let ext = (name as NSString).pathExtension
        var candidate = dir.appendingPathComponent(name)
        var n = 2
        while fm.fileExists(atPath: candidate.path) {
            candidate = dir.appendingPathComponent("\(base) \(n).\(ext)")
            n += 1
        }
        return candidate
    }

    /// Watches the folder so books added or removed in Finder show up live.
    private func watch() {
        watcher?.cancel()
        watcher = nil
        guard let folder else { return }
        let fd = open(folder.path, O_EVTONLY)
        guard fd >= 0 else { return }
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd, eventMask: [.write, .delete, .rename], queue: .main)
        source.setEventHandler { [weak self] in
            guard let self else { return }
            if source.data.contains(.delete) || source.data.contains(.rename) {
                self.watch() // folder itself moved or deleted
            }
            self.notify()
        }
        source.setCancelHandler { close(fd) }
        source.resume()
        watcher = source
    }

    private func notify() {
        pendingNotify?.cancel()
        let work = DispatchWorkItem { NotificationCenter.default.post(name: Self.didChange, object: nil) }
        pendingNotify = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
    }
}
