import AppKit
import ImageIO
import UniformTypeIdentifiers
import Vision

/// Pictures that are about to become a book. Finds the image files, reads
/// when each photo was taken and looks for a printed page number with Vision
/// text recognition, so the page can put them in the right order.
enum Pictures {
    struct Info {
        let url: URL
        let taken: Date?
        let modified: Date?
        let pageNumber: Int?
    }

    static func isImage(_ url: URL) -> Bool {
        guard let type = UTType(filenameExtension: url.pathExtension) else { return false }
        return type.conforms(to: .image)
    }

    /// The image files among `urls`; a folder contributes the images directly inside it.
    static func collect(_ urls: [URL]) -> [URL] {
        urls.flatMap { url -> [URL] in
            if (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true {
                let items = (try? FileManager.default.contentsOfDirectory(
                    at: url, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? []
                return items.filter(isImage)
            }
            return isImage(url) ? [url] : []
        }
    }

    /// Analyses the pictures in parallel off the main thread. `progress` and
    /// `completion` are called on the main queue; unreadable files are dropped.
    static func analyze(_ urls: [URL], progress: @escaping (Int) -> Void, completion: @escaping ([Info]) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            var results = [Info?](repeating: nil, count: urls.count)
            let lock = NSLock()
            var done = 0
            DispatchQueue.concurrentPerform(iterations: urls.count) { i in
                let info = Self.info(for: urls[i])
                lock.lock()
                results[i] = info
                done += 1
                let count = done
                lock.unlock()
                DispatchQueue.main.async { progress(count) }
            }
            let infos = results.compactMap { $0 }
            DispatchQueue.main.async { completion(infos) }
        }
    }

    private static func info(for url: URL) -> Info? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              CGImageSourceGetCount(source) > 0,
              let image = thumbnail(source, maxPixel: 1600) else { return nil }
        let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let exif = props?[kCGImagePropertyExifDictionary] as? [CFString: Any]
        let tiff = props?[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
        let stamp = (exif?[kCGImagePropertyExifDateTimeOriginal] ?? tiff?[kCGImagePropertyTIFFDateTime]) as? String
        let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        return Info(url: url, taken: stamp.flatMap { exifDate.date(from: $0) },
                    modified: modified, pageNumber: pageNumber(in: image))
    }

    private static let exifDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy:MM:dd HH:mm:ss"
        return f
    }()

    /// A downscaled, upright (EXIF orientation applied) copy of the image.
    private static func thumbnail(_ source: CGImageSource, maxPixel: Int) -> CGImage? {
        CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ] as CFDictionary)
    }

    // MARK: - Page numbers

    /// A page number printed near the top or bottom of the picture, if any.
    ///
    /// Only the top and bottom quarter are read. Vision tends to skip a lone
    /// digit when the same crop holds lines of text, so if the quick pass over
    /// the two bands finds nothing, the bands are scanned again in thin
    /// overlapping strips from the edge inwards, where a lone number stands out.
    static func pageNumber(in image: CGImage) -> Int? {
        let w = image.width, h = image.height
        let band = h / 4
        // CGImage crops use a top-left origin; the bottom band is tried first.
        let bottom = CGRect(x: 0, y: h - band, width: w, height: band)
        let top = CGRect(x: 0, y: 0, width: w, height: band)
        if let n = read(image, bottom, nearBottom: true) ?? read(image, top, nearBottom: false) { return n }

        let strip = max(h / 16, 24), step = strip / 2
        for offset in stride(from: 0, through: band - strip, by: step) {
            if let n = read(image, CGRect(x: 0, y: h - strip - offset, width: w, height: strip), nearBottom: true)
                ?? read(image, CGRect(x: 0, y: offset, width: w, height: strip), nearBottom: false) {
                return n
            }
        }
        return nil
    }

    /// The page number in one region of the image; the one nearest the
    /// picture's edge wins when there are several.
    private static func read(_ image: CGImage, _ rect: CGRect, nearBottom: Bool) -> Int? {
        guard let crop = image.cropping(to: rect) else { return nil }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        try? VNImageRequestHandler(cgImage: crop).perform([request])
        var best: (number: Int, edge: CGFloat)?
        for observation in request.results ?? [] {
            guard let text = observation.topCandidates(1).first?.string,
                  let number = number(in: text) else { continue }
            let box = observation.boundingBox // normalised to the crop, origin bottom-left
            let edge = nearBottom ? box.minY : 1 - box.maxY
            if best == nil || edge < best!.edge { best = (number, edge) }
        }
        return best?.number
    }

    /// "12", "- 12 -", "Page 12", "Seite 12", "S. 12", "12 / 40", "12 of 40".
    private static let pagePattern = try! NSRegularExpression(
        pattern: #"^(?:(?:page|seite|p\.|s\.)\s*)?[-–—·(\[]?\s*(\d{1,3})\s*[-–—·)\]]?(?:\s*(?:/|of|von)\s*\d{1,3})?$"#,
        options: [.caseInsensitive])

    static func number(in text: String) -> Int? {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = NSRange(text.startIndex..., in: text)
        guard let match = pagePattern.firstMatch(in: text, range: range),
              let digits = Range(match.range(at: 1), in: text),
              let n = Int(text[digits]), n > 0 else { return nil }
        return n
    }

    // MARK: - Serving

    /// The picture as an upright JPEG on white (no alpha), at most `maxPixel`
    /// on its long side, so the page can decode any format macOS can (HEIC…).
    static func jpegData(_ url: URL, maxPixel: Int = 2000) -> Data? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = thumbnail(source, maxPixel: maxPixel),
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
                                  bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        let rect = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        ctx.setFillColor(CGColor(gray: 1, alpha: 1))
        ctx.fill(rect)
        ctx.draw(image, in: rect)
        guard let flat = ctx.makeImage() else { return nil }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, flat, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
    }
}
