import Foundation
import WebKit

/// Serves the bundled web app and opened PDFs over `pdbook://app/…`, so the
/// page gets a real origin (module workers, fetch, wasm) without a server.
///   pdbook://app/<path>            → Contents/Resources/web/<path>
///   pdbook://app/__doc/<id>/<name> → a PDF the user opened
///   pdbook://app/__lib/<name>      → a book in the library folder
///   pdbook://app/__img/<id>/<name> → a picture for a new book: the page in it, as an upright JPEG
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "pdbook"

    private let root: URL
    private var documents: [String: URL] = [:]
    private var pictures: [String: Pictures.Info] = [:]
    private var stopped = Set<ObjectIdentifier>()

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    /// Makes a file reachable from the page and returns its path.
    func register(_ file: URL) -> String {
        let id = UUID().uuidString
        documents[id] = file
        let name = file.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "document.pdf"
        return "/__doc/\(id)/\(name)"
    }

    /// Makes a picture reachable from the page (converted to JPEG) and returns its path.
    func registerPicture(_ info: Pictures.Info) -> String {
        let id = UUID().uuidString
        pictures[id] = info
        return "/__img/\(id)/picture.jpg"
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return fail(task, code: NSURLErrorBadURL) }
        let parts = url.path.split(separator: "/").map(String.init)
        let picture = parts.first == "__img" && parts.count >= 2 ? pictures[parts[1]] : nil
        guard let file = picture?.url ?? resolve(url) else {
            return fail(task, code: NSURLErrorFileDoesNotExist)
        }
        let key = ObjectIdentifier(task)
        DispatchQueue.global(qos: .userInitiated).async {
            let data = picture != nil
                ? Pictures.jpegData(picture!)
                : try? Data(contentsOf: file, options: .mappedIfSafe)
            DispatchQueue.main.async {
                guard !self.stopped.contains(key) else {
                    self.stopped.remove(key)
                    return
                }
                guard let data else { return self.fail(task, code: NSURLErrorCannotOpenFile) }
                let response = HTTPURLResponse(
                    url: url,
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: [
                        "Content-Type": picture != nil ? "image/jpeg" : Self.mimeType(for: file.pathExtension),
                        "Content-Length": String(data.count),
                        "Cache-Control": "no-cache",
                    ]
                )!
                task.didReceive(response)
                task.didReceive(data)
                task.didFinish()
            }
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    private func resolve(_ url: URL) -> URL? {
        let parts = url.path.split(separator: "/").map(String.init)
        if parts.first == "__doc", parts.count >= 2 {
            return documents[parts[1]]
        }
        if parts.first == "__lib", parts.count == 2 {
            return Library.shared.file(named: parts[1])
        }
        let relative = parts.isEmpty ? "index.html" : parts.joined(separator: "/")
        let file = root.appendingPathComponent(relative).standardizedFileURL
        // Never serve anything outside the bundled web folder.
        guard file.path.hasPrefix(root.path + "/") else { return nil }
        return file
    }

    private func fail(_ task: WKURLSchemeTask, code: Int) {
        task.didFailWithError(NSError(domain: NSURLErrorDomain, code: code))
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "map": return "application/json"
        case "wasm": return "application/wasm"
        case "pdf": return "application/pdf"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}
