import AppKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import Vision

/// Pictures that are about to become a book. Finds the image files, reads
/// when each photo was taken, finds the book page in a photo (cropped from
/// the table it lies on, straightened and turned upright) and looks for a
/// printed page number with Vision text recognition, so the page can put
/// them in the right order and spot double pages.
enum Pictures {
    struct Info {
        let url: URL
        let taken: Date?
        let modified: Date?
        let pageNumber: Int?
        let page: Page
        /// Width / height of the page once cropped and turned upright.
        let aspect: Double
    }

    /// Where the book page is in a photo and which way up it is.
    struct Page {
        /// Corners (top left, top right, bottom right, bottom left) in
        /// normalised image coordinates with a bottom-left origin, or nil to
        /// keep the whole picture.
        var quad: [CGPoint]?
        /// How to turn the cropped page so its text reads upright.
        var turn: CGImagePropertyOrientation = .up
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
        let page = findPage(in: image)
        let upright = corrected(image, page) ?? image
        let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let exif = props?[kCGImagePropertyExifDictionary] as? [CFString: Any]
        let tiff = props?[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
        let stamp = (exif?[kCGImagePropertyExifDateTimeOriginal] ?? tiff?[kCGImagePropertyTIFFDateTime]) as? String
        let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        return Info(url: url, taken: stamp.flatMap { exifDate.date(from: $0) },
                    modified: modified, pageNumber: pageNumber(in: upright), page: page,
                    aspect: Double(upright.width) / Double(max(upright.height, 1)))
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

    // MARK: - Finding the page

    /// Finds the book page (or open double page) in a photo with document
    /// segmentation, and which way up it is from the direction its text runs.
    static func findPage(in image: CGImage) -> Page {
        let segmentation = VNDetectDocumentSegmentationRequest()
        let text = VNRecognizeTextRequest()
        text.recognitionLevel = .accurate
        text.usesLanguageCorrection = false
        try? VNImageRequestHandler(cgImage: image).perform([segmentation, text])

        var page = Page()
        if let doc = segmentation.results?.first, doc.confidence > 0.5 {
            let quad = [doc.topLeft, doc.topRight, doc.bottomRight, doc.bottomLeft]
            // A tiny find is probably a detail, a near-total one a scan that
            // needs no cropping.
            let area = Self.area(quad)
            if area > 0.2 && area < 0.97 { page.quad = inset(quad, by: 0.006) }
        }
        page.turn = uprightTurn(text.results ?? [], width: image.width, height: image.height)
        return page
    }

    /// Accurate text recognition reads text at any right angle; the way the
    /// lines run says how the photo is turned. Each line votes with its length.
    private static func uprightTurn(_ lines: [VNRecognizedTextObservation], width: Int, height: Int) -> CGImagePropertyOrientation {
        var votes: [CGImagePropertyOrientation: Double] = [:]
        for line in lines {
            guard let best = line.topCandidates(1).first, best.string.count >= 3 else { continue }
            let dx = (line.topRight.x - line.topLeft.x) * CGFloat(width)
            let dy = (line.topRight.y - line.topLeft.y) * CGFloat(height) // up is positive
            let turn: CGImagePropertyOrientation = abs(dx) >= abs(dy)
                ? (dx > 0 ? .up : .down)
                : (dy < 0 ? .left : .right) // running down the photo: turn it a quarter left
            votes[turn, default: 0] += Double(best.string.count) * Double(best.confidence)
        }
        let total = votes.values.reduce(0, +)
        guard total >= 12, let (turn, weight) = votes.max(by: { $0.value < $1.value }),
              weight >= total * 0.7 else { return .up }
        return turn
    }

    private static func area(_ quad: [CGPoint]) -> CGFloat {
        var sum: CGFloat = 0
        for i in quad.indices {
            let a = quad[i], b = quad[(i + 1) % quad.count]
            sum += a.x * b.y - b.x * a.y
        }
        return abs(sum) / 2
    }

    /// Pulls the corners towards the middle, so the page edge, the book's
    /// cover board and slivers of table don't show.
    private static func inset(_ quad: [CGPoint], by amount: CGFloat) -> [CGPoint] {
        let cx = quad.map(\.x).reduce(0, +) / 4, cy = quad.map(\.y).reduce(0, +) / 4
        return quad.map { CGPoint(x: $0.x + (cx - $0.x) * amount * 2, y: $0.y + (cy - $0.y) * amount * 2) }
    }

    private static let context = CIContext(options: [.useSoftwareRenderer: false])

    /// The page cut out of the photo, straightened and turned upright, or
    /// nil when there is nothing to change.
    static func corrected(_ image: CGImage, _ page: Page) -> CGImage? {
        guard page.quad != nil || page.turn != .up else { return nil }
        var ci = CIImage(cgImage: image)
        if let quad = page.quad, let filter = CIFilter(name: "CIPerspectiveCorrection") {
            let size = CGSize(width: image.width, height: image.height)
            let keys = ["inputTopLeft", "inputTopRight", "inputBottomRight", "inputBottomLeft"]
            filter.setValue(ci, forKey: kCIInputImageKey)
            for (key, p) in zip(keys, quad) {
                filter.setValue(CIVector(x: p.x * size.width, y: p.y * size.height), forKey: key)
            }
            if let output = filter.outputImage { ci = output }
        }
        ci = ci.oriented(page.turn)
        let extent = ci.extent.integral
        guard extent.width >= 1, extent.height >= 1 else { return nil }
        return context.createCGImage(ci, from: extent)
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

    /// The book page in the picture (see `corrected`) as an upright JPEG on
    /// white (no alpha), at most `maxPixel` on its long side, so the page can
    /// decode any format macOS can (HEIC…).
    static func jpegData(_ info: Info, maxPixel: Int = 3000) -> Data? {
        guard let source = CGImageSourceCreateWithURL(info.url as CFURL, nil),
              let image = thumbnail(source, maxPixel: maxPixel).map({ corrected($0, info.page) ?? $0 }),
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
