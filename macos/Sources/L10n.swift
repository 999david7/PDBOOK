import Foundation

/// The UI language of this build ("en" or "de"), set per .dmg by build.sh
/// through the PDBookLanguage Info.plist key.
let appLanguage: String = (Bundle.main.object(forInfoDictionaryKey: "PDBookLanguage") as? String) ?? "en"

/// Picks the English or German text for this build.
func tr(_ english: String, _ german: String) -> String {
    appLanguage == "de" ? german : english
}
