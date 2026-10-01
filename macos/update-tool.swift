// Ed25519 signing for PDBOOK updates.
//
//   swift update-tool.swift keygen                 create the signing key pair
//   swift update-tool.swift sign <file>            print a base64 signature
//   swift update-tool.swift verify <file> <sig>    check a signature
//
// The private key lives outside the repository, at $PDBOOK_UPDATE_KEY or
// ~/.config/pdbook/update_signing_key. The public key is written to
// macos/update-public-key.txt and embedded into the app at build time.
import CryptoKit
import Foundation

let fm = FileManager.default
let scriptDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
let publicKeyFile = scriptDir.appendingPathComponent("update-public-key.txt")
let privateKeyFile = URL(fileURLWithPath: ProcessInfo.processInfo.environment["PDBOOK_UPDATE_KEY"]
    ?? (NSHomeDirectory() + "/.config/pdbook/update_signing_key"))

func die(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

func loadPrivateKey() -> Curve25519.Signing.PrivateKey {
    guard let text = try? String(contentsOf: privateKeyFile, encoding: .utf8),
          let raw = Data(base64Encoded: text.trimmingCharacters(in: .whitespacesAndNewlines)),
          let key = try? Curve25519.Signing.PrivateKey(rawRepresentation: raw)
    else { die("No signing key at \(privateKeyFile.path). Run `npm run update-keys` first.") }
    return key
}

func loadPublicKey() -> Curve25519.Signing.PublicKey {
    guard let text = try? String(contentsOf: publicKeyFile, encoding: .utf8),
          let raw = Data(base64Encoded: text.trimmingCharacters(in: .whitespacesAndNewlines)),
          let key = try? Curve25519.Signing.PublicKey(rawRepresentation: raw)
    else { die("No public key at \(publicKeyFile.path).") }
    return key
}

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "keygen":
    if fm.fileExists(atPath: privateKeyFile.path) {
        die("A signing key already exists at \(privateKeyFile.path); refusing to overwrite it.\n" +
            "Replacing it would stop existing installs from accepting updates.")
    }
    let key = Curve25519.Signing.PrivateKey()
    try! fm.createDirectory(at: privateKeyFile.deletingLastPathComponent(), withIntermediateDirectories: true,
                            attributes: [.posixPermissions: 0o700])
    try! key.rawRepresentation.base64EncodedString().write(to: privateKeyFile, atomically: true, encoding: .utf8)
    try! fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: privateKeyFile.path)
    try! (key.publicKey.rawRepresentation.base64EncodedString() + "\n")
        .write(to: publicKeyFile, atomically: true, encoding: .utf8)
    print("Private key: \(privateKeyFile.path)  (keep it secret and back it up)")
    print("Public key:  \(publicKeyFile.path)  (commit this)")

case "sign":
    guard args.count == 2 else { die("usage: sign <file>") }
    let data = try! Data(contentsOf: URL(fileURLWithPath: args[1]), options: .mappedIfSafe)
    let key = loadPrivateKey()
    guard key.publicKey.rawRepresentation == loadPublicKey().rawRepresentation else {
        die("The private key doesn't match macos/update-public-key.txt.")
    }
    print(try! key.signature(for: data).base64EncodedString())

case "verify":
    guard args.count == 3, let sig = Data(base64Encoded: args[2]) else { die("usage: verify <file> <signature>") }
    let data = try! Data(contentsOf: URL(fileURLWithPath: args[1]), options: .mappedIfSafe)
    if loadPublicKey().isValidSignature(sig, for: data) {
        print("Signature OK")
    } else {
        die("Signature INVALID")
    }

default:
    die("usage: update-tool.swift keygen | sign <file> | verify <file> <signature>")
}
