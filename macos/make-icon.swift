// Renders the 1024×1024 app icon: an open book with a turning page on a
// warm dark squircle. Usage: swift make-icon.swift <out.png>
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
color(0x1b1815).setFill()
squircle.fill()
ctx.restoreGState()
NSGradient(colors: [color(0x3a3129), color(0x1d1915), color(0x141210)])!
    .draw(in: squircle, angle: -90)
NSGradient(colors: [color(0xd9a54f, 0.22), color(0xd9a54f, 0)])!
    .draw(in: squircle, relativeCenterPosition: NSPoint(x: 0, y: 0.1))

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
coverShadow.shadowColor = color(0x000000, 0.45)
coverShadow.shadowBlurRadius = 30
coverShadow.shadowOffset = NSSize(width: 0, height: -14)
coverShadow.set()
color(0xc8913d).setFill()
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

// Text lines
color(0x8a7f70, 0.55).setFill()
for i in 0..<7 {
    let y = 620 - CGFloat(i) * 38
    let w: CGFloat = i == 6 ? 120 : 200
    NSBezierPath(roundedRect: NSRect(x: 262, y: y, width: w, height: 12), xRadius: 6, yRadius: 6).fill()
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
curlShadow.shadowColor = color(0x000000, 0.28)
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
color(0xd9a54f).setFill()
ribbon.fill()

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("Wrote \(out)")
