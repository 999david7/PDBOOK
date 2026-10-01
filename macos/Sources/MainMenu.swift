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
        appMenu.addItem(withTitle: tr("About PDBOOK", "Über PDBOOK"),
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        let check = appMenu.addItem(withTitle: tr("Check for Updates…", "Nach Updates suchen …"),
                                    action: #selector(Updater.checkForUpdates(_:)), keyEquivalent: "")
        check.target = Updater.shared
        let auto = appMenu.addItem(withTitle: tr("Check for Updates Automatically", "Automatisch nach Updates suchen"),
                                   action: #selector(Updater.toggleAutomaticChecks(_:)), keyEquivalent: "")
        auto.target = Updater.shared
        appMenu.addItem(.separator())
        let services = NSMenuItem(title: tr("Services", "Dienste"), action: nil, keyEquivalent: "")
        services.submenu = NSMenu(title: tr("Services", "Dienste"))
        NSApp.servicesMenu = services.submenu
        appMenu.addItem(services)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: tr("Hide PDBOOK", "PDBOOK ausblenden"), action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: tr("Hide Others", "Andere ausblenden"),
                        action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
            .keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: tr("Show All", "Alle einblenden"),
                        action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: tr("Quit PDBOOK", "PDBOOK beenden"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        // File
        let file = submenu(tr("File", "Ablage"))
        file.addItem(withTitle: tr("New Window", "Neues Fenster"), action: #selector(AppDelegate.newWindowAction(_:)), keyEquivalent: "n")
        file.addItem(withTitle: tr("Open…", "Öffnen …"), action: #selector(NSDocumentController.openDocument(_:)), keyEquivalent: "o")
        file.addItem(withTitle: tr("Add Books to Library…", "Bücher zur Bibliothek hinzufügen …"),
                     action: #selector(AppDelegate.addBooksToLibrary(_:)), keyEquivalent: "O")
        file.addItem(withTitle: tr("Add Current Book to Library", "Aktuelles Buch zur Bibliothek hinzufügen"),
                     action: #selector(BookWindowController.addCurrentToLibrary(_:)), keyEquivalent: "d")
        // AppKit fills this menu because it contains a clearRecentDocuments: item.
        let recent = NSMenuItem(title: tr("Open Recent", "Benutzte Dokumente öffnen"), action: nil, keyEquivalent: "")
        let recentMenu = NSMenu(title: tr("Open Recent", "Benutzte Dokumente öffnen"))
        recentMenu.addItem(withTitle: tr("Clear Menu", "Einträge löschen"),
                           action: #selector(NSDocumentController.clearRecentDocuments(_:)), keyEquivalent: "")
        recent.submenu = recentMenu
        file.addItem(recent)
        file.addItem(.separator())
        file.addItem(withTitle: tr("Show Library in Finder", "Bibliothek im Finder zeigen"),
                     action: #selector(AppDelegate.showLibraryInFinder(_:)), keyEquivalent: "")
        file.addItem(withTitle: tr("Change Library Location…", "Speicherort der Bibliothek ändern …"),
                     action: #selector(AppDelegate.changeLibraryLocation(_:)), keyEquivalent: "")
        file.addItem(withTitle: tr("Restore Sample Books", "Beispielbücher wiederherstellen"),
                     action: #selector(AppDelegate.restoreSampleBooks(_:)), keyEquivalent: "")
        file.addItem(.separator())
        file.addItem(withTitle: tr("Close", "Schließen"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        // Edit (keeps standard shortcuts working inside the web view)
        let edit = submenu(tr("Edit", "Bearbeiten"))
        edit.addItem(withTitle: tr("Copy", "Kopieren"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: tr("Select All", "Alles auswählen"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        // View
        let view = submenu(tr("View", "Darstellung"))
        view.addItem(withTitle: tr("Show Library", "Bibliothek zeigen"), action: #selector(BookWindowController.showLibrary(_:)), keyEquivalent: "l")
        view.addItem(.separator())
        view.addItem(withTitle: tr("Previous Page", "Vorherige Seite"),
                     action: #selector(BookWindowController.previousPage(_:)),
                     keyEquivalent: arrow(NSLeftArrowFunctionKey)).keyEquivalentModifierMask = []
        view.addItem(withTitle: tr("Next Page", "Nächste Seite"),
                     action: #selector(BookWindowController.nextPage(_:)),
                     keyEquivalent: arrow(NSRightArrowFunctionKey)).keyEquivalentModifierMask = []
        view.addItem(withTitle: tr("First Page", "Erste Seite"),
                     action: #selector(BookWindowController.firstPage(_:)),
                     keyEquivalent: arrow(NSUpArrowFunctionKey)).keyEquivalentModifierMask = [.command]
        view.addItem(withTitle: tr("Last Page", "Letzte Seite"),
                     action: #selector(BookWindowController.lastPage(_:)),
                     keyEquivalent: arrow(NSDownArrowFunctionKey)).keyEquivalentModifierMask = [.command]
        view.addItem(.separator())
        view.addItem(withTitle: tr("Enter Full Screen", "Vollbildmodus aktivieren"), action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
            .keyEquivalentModifierMask = [.command, .control]

        // Window
        let window = submenu(tr("Window", "Fenster"))
        window.addItem(withTitle: tr("Minimize", "Im Dock ablegen"), action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        window.addItem(withTitle: tr("Zoom", "Zoomen"), action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        window.addItem(.separator())
        window.addItem(withTitle: tr("Bring All to Front", "Alle nach vorne bringen"),
                       action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = window

        // Help (macOS adds the menu search field)
        NSApp.helpMenu = submenu(tr("Help", "Hilfe"))

        return main
    }
}
