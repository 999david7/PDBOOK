import AppKit
import CryptoKit

/// Contents of the `update.json` manifest published with each release.
struct UpdateInfo: Decodable {
    let version: String
    let notes: String?
    let url: URL
    let size: Int?
    /// Base64 Ed25519 signature of the .dmg, made with the private key that
    /// matches `PDBookUpdatePublicKey` in Info.plist.
    let signature: String
    let minimumSystemVersion: String?
}

/// Checks a JSON feed for new versions, asks the user, then downloads,
/// verifies, installs and relaunches. No third-party dependencies.
final class Updater: NSObject, NSMenuItemValidation, URLSessionDownloadDelegate {
    static let shared = Updater()

    private enum Keys {
        static let automatic = "AutomaticallyCheckForUpdates"
        static let skipped = "SkippedUpdateVersion"
        static let lastCheck = "LastUpdateCheck"
        static let feedOverride = "UpdateFeedURL" // for testing a staging feed
    }

    private static let checkInterval: TimeInterval = 6 * 60 * 60

    private var checking = false
    private var timer: Timer?
    private var session: URLSession?
    private var pendingInfo: UpdateInfo?
    private var progress: ProgressPanel?

    // MARK: - Configuration

    private var feedURL: URL? {
        let raw = UserDefaults.standard.string(forKey: Keys.feedOverride)
            ?? Bundle.main.object(forInfoDictionaryKey: "PDBookUpdateFeedURL") as? String
        guard let raw, !raw.isEmpty else { return nil }
        return URL(string: raw)
    }

    private var publicKey: Curve25519.Signing.PublicKey? {
        guard let b64 = Bundle.main.object(forInfoDictionaryKey: "PDBookUpdatePublicKey") as? String,
              let data = Data(base64Encoded: b64) else { return nil }
        return try? Curve25519.Signing.PublicKey(rawRepresentation: data)
    }

    var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    var automaticallyChecks: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.automatic) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.automatic) }
    }

    // MARK: - Lifecycle

    func start() {
        UserDefaults.standard.register(defaults: [Keys.automatic: true])
        // Give launch a moment, then check; keep checking while the app runs.
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.checkIfDue() }
        timer = Timer.scheduledTimer(withTimeInterval: 30 * 60, repeats: true) { [weak self] _ in
            self?.checkIfDue()
        }
    }

    private func checkIfDue() {
        guard automaticallyChecks else { return }
        let last = UserDefaults.standard.object(forKey: Keys.lastCheck) as? Date ?? .distantPast
        if Date().timeIntervalSince(last) >= Self.checkInterval { check(userInitiated: false) }
    }

    // MARK: - Menu

    @objc func checkForUpdates(_ sender: Any?) {
        check(userInitiated: true)
    }

    @objc func toggleAutomaticChecks(_ sender: Any?) {
        automaticallyChecks.toggle()
    }

    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        if item.action == #selector(toggleAutomaticChecks(_:)) {
            item.state = automaticallyChecks ? .on : .off
            return feedURL != nil
        }
        if item.action == #selector(checkForUpdates(_:)) {
            return !checking && progress == nil
        }
        return true
    }

    // MARK: - Checking

    func check(userInitiated: Bool) {
        guard !checking, progress == nil else { return }
        guard let feedURL, publicKey != nil else {
            if userInitiated {
                inform("Updates aren’t set up for this copy of PDBOOK.",
                       "This build was made without an update feed or signing key.")
            }
            return
        }
        checking = true
        let request = URLRequest(url: feedURL, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 30)
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.checking = false
                self.handleFeed(data: data, response: response, error: error, userInitiated: userInitiated)
            }
        }.resume()
    }

    private func handleFeed(data: Data?, response: URLResponse?, error: Error?, userInitiated: Bool) {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard error == nil, status == 200, let data,
              let info = try? JSONDecoder().decode(UpdateInfo.self, from: data) else {
            if userInitiated {
                let reason = error?.localizedDescription
                    ?? (status == 404 ? "No release has been published yet." : "The update information couldn’t be read.")
                inform("Couldn’t check for updates.", reason)
            }
            return
        }
        UserDefaults.standard.set(Date(), forKey: Keys.lastCheck)

        guard Self.isVersion(info.version, newerThan: currentVersion) else {
            if userInitiated {
                inform("You’re up to date!", "PDBOOK \(currentVersion) is the newest version available.")
            }
            return
        }
        if let minimum = info.minimumSystemVersion, !Self.systemSatisfies(minimum) {
            if userInitiated {
                inform("PDBOOK \(info.version) is available, but it needs macOS \(minimum) or later.", "")
            }
            return
        }
        if !userInitiated, UserDefaults.standard.string(forKey: Keys.skipped) == info.version { return }
        ask(info)
    }

    // MARK: - Asking

    private func ask(_ info: UpdateInfo) {
        let alert = NSAlert()
        alert.icon = NSApp.applicationIconImage
        alert.messageText = "A new version of PDBOOK is available!"
        alert.informativeText =
            "PDBOOK \(info.version) is now available — you have \(currentVersion). Would you like to install it now?"
        if let notes = info.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty {
            alert.accessoryView = Self.notesView(notes)
        }
        alert.addButton(withTitle: "Install Update")
        alert.addButton(withTitle: "Not Now")
        alert.addButton(withTitle: "Skip This Version")

        NSApp.activate(ignoringOtherApps: true)
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            install(info)
        case .alertThirdButtonReturn:
            UserDefaults.standard.set(info.version, forKey: Keys.skipped)
        default:
            break
        }
    }

    private static func notesView(_ notes: String) -> NSView {
        let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 380, height: 150))
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        let text = NSTextView(frame: scroll.bounds)
        text.isEditable = false
        text.textContainerInset = NSSize(width: 6, height: 6)
        text.font = .systemFont(ofSize: NSFont.smallSystemFontSize)
        text.string = "What’s new:\n\n" + notes
        text.autoresizingMask = [.width]
        scroll.documentView = text
        return scroll
    }

    // MARK: - Installing

    private var appURL: URL { Bundle.main.bundleURL }

    /// Updating in place needs a normal, writable install location (not the
    /// disk image or a Gatekeeper-translocated copy).
    private var canInstallInPlace: Bool {
        let path = appURL.path
        return !path.contains("/AppTranslocation/") && !path.hasPrefix("/Volumes/")
            && FileManager.default.isWritableFile(atPath: appURL.deletingLastPathComponent().path)
    }

    private func install(_ info: UpdateInfo) {
        guard canInstallInPlace else {
            let alert = NSAlert()
            alert.messageText = "PDBOOK can’t update itself from this location."
            alert.informativeText = "Move PDBOOK to your Applications folder and try again, or download the new version manually."
            alert.addButton(withTitle: "Download Manually")
            alert.addButton(withTitle: "Cancel")
            if alert.runModal() == .alertFirstButtonReturn { NSWorkspace.shared.open(info.url) }
            return
        }
        pendingInfo = info
        let panel = ProgressPanel(title: "Updating PDBOOK", status: "Downloading PDBOOK \(info.version)…")
        panel.onCancel = { [weak self] in self?.cancel() }
        panel.show()
        progress = panel

        let session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: .main)
        self.session = session
        session.downloadTask(with: info.url).resume()
    }

    private func cancel() {
        session?.invalidateAndCancel()
        session = nil
        progress?.close()
        progress = nil
        pendingInfo = nil
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64,
                    totalBytesWritten written: Int64, totalBytesExpectedToWrite expected: Int64) {
        let total = expected > 0 ? expected : Int64(pendingInfo?.size ?? 0)
        progress?.setProgress(total > 0 ? Double(written) / Double(total) : nil)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // The file at `location` is deleted when this returns; move it now.
        let dmg = FileManager.default.temporaryDirectory.appendingPathComponent("PDBOOK-update-\(UUID().uuidString).dmg")
        do {
            let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 200
            guard status == 200 else { throw UpdateError("The download failed (HTTP \(status)).") }
            try FileManager.default.moveItem(at: location, to: dmg)
        } catch {
            return fail(error)
        }
        guard let info = pendingInfo, let key = publicKey else { return }
        progress?.setStatus("Verifying…")
        progress?.setProgress(nil)
        let target = appURL
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let staged = try Self.prepare(dmg: dmg, info: info, key: key, replacing: target)
                DispatchQueue.main.async { self.finish(staged: staged) }
            } catch {
                DispatchQueue.main.async { self.fail(error) }
            }
            try? FileManager.default.removeItem(at: dmg)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error, (error as NSError).code != NSURLErrorCancelled { fail(error) }
    }

    /// Verifies the signature, mounts the image and copies the new app next
    /// to the current one (same volume, so the final swap is atomic).
    private static func prepare(dmg: URL, info: UpdateInfo, key: Curve25519.Signing.PublicKey,
                                replacing target: URL) throws -> URL {
        let data = try Data(contentsOf: dmg, options: .mappedIfSafe)
        guard let signature = Data(base64Encoded: info.signature),
              key.isValidSignature(signature, for: data) else {
            throw UpdateError("The update’s signature is invalid, so it wasn’t installed.")
        }

        let mount = try attach(dmg)
        defer { detach(mount) }

        let contents = try FileManager.default.contentsOfDirectory(at: mount, includingPropertiesForKeys: nil)
        guard let newApp = contents.first(where: { $0.pathExtension == "app" }),
              let bundle = Bundle(url: newApp) else {
            throw UpdateError("The update doesn’t contain an app.")
        }
        guard bundle.bundleIdentifier == Bundle.main.bundleIdentifier else {
            throw UpdateError("The update is for a different app.")
        }
        guard (bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) == info.version else {
            throw UpdateError("The update’s version doesn’t match what was announced.")
        }

        let staging = try FileManager.default.url(for: .itemReplacementDirectory, in: .userDomainMask,
                                                  appropriateFor: target, create: true)
        let staged = staging.appendingPathComponent(target.lastPathComponent)
        try run("/usr/bin/ditto", [newApp.path, staged.path])
        _ = try? run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", staged.path])
        return staged
    }

    private func finish(staged: URL) {
        progress?.setStatus("Installing…")
        do {
            _ = try FileManager.default.replaceItemAt(appURL, withItemAt: staged)
            try? FileManager.default.removeItem(at: staged.deletingLastPathComponent())
        } catch {
            return fail(error)
        }
        // Relaunch once this process has exited.
        let pid = ProcessInfo.processInfo.processIdentifier
        let relauncher = Process()
        relauncher.executableURL = URL(fileURLWithPath: "/bin/sh")
        relauncher.arguments = ["-c", "while /bin/kill -0 \(pid) 2>/dev/null; do /bin/sleep 0.2; done; /usr/bin/open \"$0\"", appURL.path]
        try? relauncher.run()
        progress?.close()
        progress = nil
        NSApp.terminate(nil)
    }

    private func fail(_ error: Error) {
        guard progress != nil else { return }
        let info = pendingInfo
        cancel()
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "The update couldn’t be installed."
        alert.informativeText = (error as? UpdateError)?.message ?? error.localizedDescription
        alert.addButton(withTitle: "OK")
        if info != nil { alert.addButton(withTitle: "Download Manually") }
        if alert.runModal() == .alertSecondButtonReturn, let info { NSWorkspace.shared.open(info.url) }
    }

    // MARK: - Helpers

    private static func attach(_ dmg: URL) throws -> URL {
        let mountPoint = FileManager.default.temporaryDirectory.appendingPathComponent("PDBOOK-mount-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: mountPoint, withIntermediateDirectories: true)
        try run("/usr/bin/hdiutil", ["attach", dmg.path, "-nobrowse", "-readonly", "-noautoopen", "-quiet",
                                     "-mountpoint", mountPoint.path])
        return mountPoint
    }

    private static func detach(_ mountPoint: URL) {
        _ = try? run("/usr/bin/hdiutil", ["detach", mountPoint.path, "-force", "-quiet"])
        try? FileManager.default.removeItem(at: mountPoint)
    }

    @discardableResult
    private static func run(_ tool: String, _ args: [String]) throws -> Int32 {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: tool)
        p.arguments = args
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        try p.run()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else {
            throw UpdateError("\(URL(fileURLWithPath: tool).lastPathComponent) failed (\(p.terminationStatus)).")
        }
        return p.terminationStatus
    }

    static func isVersion(_ a: String, newerThan b: String) -> Bool {
        let parse = { (s: String) in s.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) } }
        let x = parse(a), y = parse(b)
        for i in 0..<max(x.count, y.count) {
            let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
            if l != r { return l > r }
        }
        return false
    }

    private static func systemSatisfies(_ minimum: String) -> Bool {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        let current = "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
        return !isVersion(minimum, newerThan: current)
    }

    private func inform(_ title: String, _ text: String) {
        let alert = NSAlert()
        alert.icon = NSApp.applicationIconImage
        alert.messageText = title
        alert.informativeText = text
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }
}

struct UpdateError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// Small window with a progress bar and Cancel button.
private final class ProgressPanel {
    private let panel: NSPanel
    private let label = NSTextField(labelWithString: "")
    private let bar = NSProgressIndicator()
    var onCancel: (() -> Void)?

    init(title: String, status: String) {
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 380, height: 118),
                        styleMask: [.titled], backing: .buffered, defer: false)
        panel.title = title
        panel.isReleasedWhenClosed = false
        let view = panel.contentView!

        let icon = NSImageView(frame: NSRect(x: 20, y: 38, width: 56, height: 56))
        icon.image = NSApp.applicationIconImage
        view.addSubview(icon)

        label.frame = NSRect(x: 90, y: 74, width: 270, height: 20)
        label.stringValue = status
        label.font = .boldSystemFont(ofSize: NSFont.systemFontSize)
        view.addSubview(label)

        bar.frame = NSRect(x: 90, y: 50, width: 270, height: 20)
        bar.style = .bar
        bar.minValue = 0
        bar.maxValue = 1
        bar.isIndeterminate = true
        bar.startAnimation(nil)
        view.addSubview(bar)

        let cancel = NSButton(title: "Cancel", target: nil, action: nil)
        cancel.frame = NSRect(x: 270, y: 12, width: 96, height: 28)
        cancel.bezelStyle = .rounded
        cancel.keyEquivalent = "\u{1b}"
        cancel.target = self
        cancel.action = #selector(cancelPressed)
        view.addSubview(cancel)
    }

    func show() {
        panel.center()
        panel.makeKeyAndOrderFront(nil)
    }

    func close() { panel.close() }

    func setStatus(_ text: String) { label.stringValue = text }

    func setProgress(_ value: Double?) {
        if let value {
            if bar.isIndeterminate { bar.isIndeterminate = false }
            bar.doubleValue = value
        } else if !bar.isIndeterminate {
            bar.isIndeterminate = true
            bar.startAnimation(nil)
        }
    }

    @objc private func cancelPressed() { onCancel?() }
}
