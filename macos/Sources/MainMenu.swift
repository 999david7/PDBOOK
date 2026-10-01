import AppKit

enum MainMenu {
    static func build() -> NSMenu {
        let main = NSMenu()

        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let menu = NSMenu(title: title)
            item.submenu = menu
            main.addItem(item)
            return menu
        }

        func arrow(_ key: Int) -> String {
            String(utf16CodeUnits: [unichar(key)], count: 1)
        }

        // PDBOOK
        let appMenu = submenu("PDBOOK")
        appMenu.addItem(withTitle: "About PDBOOK",
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        let check = appMenu.addItem(withTitle: "Check for Updates…",
                                    action: #selector(Updater.checkForUpdates(_:)), keyEquivalent: "")
        check.target = Updater.shared
        let auto = appMenu.addItem(withTitle: "Check for Updates Automatically",
                                   action: #selector(Updater.toggleAutomaticChecks(_:)), keyEquivalent: "")
        auto.target = Updater.shared
        appMenu.addItem(.separator())
        let services = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        services.submenu = NSMenu(title: "Services")
        NSApp.servicesMenu = services.submenu
        appMenu.addItem(services)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide PDBOOK", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Hide Others",
                        action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
            .keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All",
                        action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit PDBOOK", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        // File
        let file = submenu("File")
        file.addItem(withTitle: "New Window", action: #selector(AppDelegate.newWindowAction(_:)), keyEquivalent: "n")
        file.addItem(withTitle: "Open…", action: #selector(NSDocumentController.openDocument(_:)), keyEquivalent: "o")
        // AppKit fills this menu because it contains a clearRecentDocuments: item.
        let recent = NSMenuItem(title: "Open Recent", action: nil, keyEquivalent: "")
        let recentMenu = NSMenu(title: "Open Recent")
        recentMenu.addItem(withTitle: "Clear Menu",
                           action: #selector(NSDocumentController.clearRecentDocuments(_:)), keyEquivalent: "")
        recent.submenu = recentMenu
        file.addItem(recent)
        file.addItem(.separator())
        file.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        // Edit (keeps standard shortcuts working inside the web view)
        let edit = submenu("Edit")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        // View
        let view = submenu("View")
        view.addItem(withTitle: "Previous Page",
                     action: #selector(BookWindowController.previousPage(_:)),
                     keyEquivalent: arrow(NSLeftArrowFunctionKey)).keyEquivalentModifierMask = []
        view.addItem(withTitle: "Next Page",
                     action: #selector(BookWindowController.nextPage(_:)),
                     keyEquivalent: arrow(NSRightArrowFunctionKey)).keyEquivalentModifierMask = []
        view.addItem(withTitle: "First Page",
                     action: #selector(BookWindowController.firstPage(_:)),
                     keyEquivalent: arrow(NSUpArrowFunctionKey)).keyEquivalentModifierMask = [.command]
        view.addItem(withTitle: "Last Page",
                     action: #selector(BookWindowController.lastPage(_:)),
                     keyEquivalent: arrow(NSDownArrowFunctionKey)).keyEquivalentModifierMask = [.command]
        view.addItem(.separator())
        view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
            .keyEquivalentModifierMask = [.command, .control]

        // Window
        let window = submenu("Window")
        window.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        window.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        window.addItem(.separator())
        window.addItem(withTitle: "Bring All to Front",
                       action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = window

        // Help (macOS adds the menu search field)
        NSApp.helpMenu = submenu("Help")

        return main
    }
}
