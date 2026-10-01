// Renders the 1024×1024 app icon: a colourful open book with a turning page
// on a sunny sky-blue squircle. Usage: swift make-icon.swift <out.png>
import AppKit

let size: CGFloat = 1024
let out = CommandLine.arguments.dropFirst().first ?? "icon.png"

let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

func color(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: a)
}

// Squircle background (macOS icon grid: 824pt body, 100pt margin).
let body = NSRect(x: 100, y: 100, width: 824, height: 824)
let squircle = NSBezierPath(roundedRect: body, xRadius: 186, yRadius: 186)
ctx.saveGState()
let drop = NSShadow()
drop.shadowColor = color(0x000000, 0.35)
drop.shadowBlurRadius = 24
drop.shadowOffset = NSSize(width: 0, height: -10)
drop.set()
color(0x3b9dff).setFill()
squircle.fill()
ctx.restoreGState()
NSGradient(colors: [color(0x7fd6ff), color(0x4aa8ff), color(0x2f7ff0)])!
    .draw(in: squircle, angle: -90)
// Sun peeking in the corner
ctx.saveGState()
squircle.addClip()
color(0xbfe6ff).setFill()
NSBezierPath(ovalIn: NSRect(x: 640, y: 640, width: 400, height: 400)).fill()
color(0xffc83d).setFill()
NSBezierPath(ovalIn: NSRect(x: 690, y: 690, width: 300, height: 300)).fill()
// Clouds
color(0xffffff, 0.9).setFill()
for (x, y, r) in [(170.0, 790.0, 46.0), (220.0, 810.0, 58.0), (282.0, 792.0, 44.0)] {
    NSBezierPath(ovalIn: NSRect(x: x - r, y: y - r, width: r * 2, height: r * 2)).fill()
}
NSBezierPath(roundedRect: NSRect(x: 128, y: 750, width: 196, height: 52), xRadius: 26, yRadius: 26).fill()
ctx.restoreGState()

// Book geometry
let spineTop = NSPoint(x: 512, y: 706)
let spineBottom = NSPoint(x: 512, y: 318)

func page(side: CGFloat, inset: CGFloat) -> NSBezierPath {
    let p = NSBezierPath()
    let outer = 512 + side * (300 + inset)
    p.move(to: NSPoint(x: 512, y: spineBottom.y - inset))
    p.curve(to: NSPoint(x: outer, y: 340 - inset),
            controlPoint1: NSPoint(x: 512 + side * 90, y: 368 - inset),
            controlPoint2: NSPoint(x: 512 + side * 210, y: 368 - inset))
    p.line(to: NSPoint(x: outer, y: 690 + inset))
    p.curve(to: NSPoint(x: 512, y: spineTop.y + inset),
            controlPoint1: NSPoint(x: 512 + side * 210, y: 724 + inset),
            controlPoint2: NSPoint(x: 512 + side * 90, y: 724 + inset))
    p.close()
    return p
}

// Gold cover peeking out behind the pages
ctx.saveGState()
let coverShadow = NSShadow()
coverShadow.shadowColor = color(0x0a3a7a, 0.45)
coverShadow.shadowBlurRadius = 30
coverShadow.shadowOffset = NSSize(width: 0, height: -14)
coverShadow.set()
color(0xff6b6b).setFill()
page(side: -1, inset: 18).fill()
page(side: 1, inset: 18).fill()
ctx.restoreGState()

// Page stack edges
for (i, shade) in [0xe2dacb, 0xece5d8].enumerated() {
    color(UInt32(shade)).setFill()
    page(side: -1, inset: CGFloat(10 - i * 5)).fill()
    page(side: 1, inset: CGFloat(10 - i * 5)).fill()
}

// Left page
let left = page(side: -1, inset: 0)
NSGradient(colors: [color(0xf3eee4), color(0xfdfbf6)])!.draw(in: left, angle: 0)

// Right page (underneath the turning page)
let right = page(side: 1, inset: 0)
NSGradient(colors: [color(0xfdfbf6), color(0xf1ebe0)])!.draw(in: right, angle: 0)

// Rainbow text lines
let lineColors: [UInt32] = [0xff6b6b, 0xffb43d, 0x5cbf4a, 0x1fb5a8, 0x4aa8ff, 0x8c6cf2, 0xff6b6b]
for i in 0..<7 {
    let y = 620 - CGFloat(i) * 38
    let w: CGFloat = i == 6 ? 120 : 200
    color(lineColors[i], 0.85).setFill()
    NSBezierPath(roundedRect: NSRect(x: 262, y: y, width: w, height: 16), xRadius: 8, yRadius: 8).fill()
}

// Spine shading
NSGradient(colors: [color(0x000000, 0), color(0x000000, 0.18), color(0x000000, 0)])!
    .draw(in: NSRect(x: 480, y: 300, width: 64, height: 420), angle: 0)

// Turning page curling up from the right
let curl = NSBezierPath()
curl.move(to: NSPoint(x: 512, y: spineBottom.y))
curl.curve(to: NSPoint(x: 742, y: 420),
           controlPoint1: NSPoint(x: 600, y: 352),
           controlPoint2: NSPoint(x: 700, y: 360))
curl.curve(to: NSPoint(x: 668, y: 738),
           controlPoint1: NSPoint(x: 760, y: 540),
           controlPoint2: NSPoint(x: 720, y: 660))
curl.curve(to: NSPoint(x: 512, y: spineTop.y),
           controlPoint1: NSPoint(x: 610, y: 742),
           controlPoint2: NSPoint(x: 560, y: 730))
curl.close()
ctx.saveGState()
let curlShadow = NSShadow()
curlShadow.shadowColor = color(0x0a3a7a, 0.3)
curlShadow.shadowBlurRadius = 26
curlShadow.shadowOffset = NSSize(width: 14, height: -8)
curlShadow.set()
color(0xfdfbf6).setFill()
curl.fill()
ctx.restoreGState()
NSGradient(colors: [color(0xfffdf8), color(0xf4eee3), color(0xd9d0c0)])!.draw(in: curl, angle: 20)

// Gold bookmark ribbon
let ribbon = NSBezierPath()
ribbon.move(to: NSPoint(x: 330, y: 330))
ribbon.line(to: NSPoint(x: 330, y: 230))
ribbon.line(to: NSPoint(x: 352, y: 252))
ribbon.line(to: NSPoint(x: 374, y: 230))
ribbon.line(to: NSPoint(x: 374, y: 336))
ribbon.close()
color(0xffc83d).setFill()
ribbon.fill()

// Sparkles
func star(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) {
    let p = NSBezierPath()
    for i in 0..<8 {
        let a = CGFloat(i) * .pi / 4 + .pi / 2
        let rr = i % 2 == 0 ? r : r * 0.32
        let pt = NSPoint(x: cx + cos(a) * rr, y: cy + sin(a) * rr)
        if i == 0 { p.move(to: pt) } else { p.line(to: pt) }
    }
    p.close()
    p.fill()
}
color(0xffffff).setFill()
star(812, 560, 38)
star(866, 470, 22)
star(176, 286, 26)

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("Wrote \(out)")
