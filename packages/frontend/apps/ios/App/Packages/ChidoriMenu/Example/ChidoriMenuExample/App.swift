//
//  App.swift
//  ChidoriMenuExample
//
//  Created by 秋星桥 on 1/19/25.
//

import ChidoriMenu
import SPIndicator
import SwiftUI

@main
struct ChidoriMenuExampleApp: App {
  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}

struct ContentView: View {
  var body: some View {
    NavigationView {
      Content()
        .ignoresSafeArea()
        .navigationTitle("Chidori Menu")
    }
    .navigationViewStyle(.stack)
  }
}

struct Content: UIViewControllerRepresentable {
  class ContentController: UIViewController, UITableViewDelegate, UITableViewDataSource {
    let tableView = UITableView(frame: .zero, style: .insetGrouped)
    override func viewDidLoad() {
      super.viewDidLoad()
      tableView.delegate = self
      tableView.dataSource = self
      tableView.tableFooterView = FooterButton()
      view.addSubview(tableView)
    }

    override func viewWillLayoutSubviews() {
      super.viewWillLayoutSubviews()
      tableView.frame = view.bounds
    }

    struct Menu {
      let title: String
      let menu: UIMenu
    }

    var firstMenu: Menu = .init(title: "Show Menu Set", menu: .init(children: [
      UIAction(
        title: "Copy",
        image: UIImage(systemName: "doc.on.doc"),
        state: .on
      ) { _ in
        SPIndicatorView(title: "Copied", preset: .done).present()
      },
      UIAction(
        title: "Paste",
        image: UIImage(systemName: "doc.on.doc"),
        attributes: .disabled,
        state: .off
      ) { _ in
        SPIndicatorView(title: "Pasted", preset: .done).present()
      },
      UIAction(
        title: "Delete",
        image: UIImage(systemName: "trash"),
        attributes: .destructive,
        state: .mixed
      ) { _ in
        SPIndicatorView(title: "Delete", preset: .done).present()
      },
    ]))

    var secondMenu: Menu = .init(title: "Show Nested Menu Set", menu: .init(title: "Root Menu", children: [
      UIAction(
        title: "Copy",
        image: UIImage(systemName: "doc.on.doc"),
        state: .on
      ) { _ in
        SPIndicatorView(title: "Copied", preset: .done).present()
      },
      UIMenu(
        title: "Child Menu",
        image: .init(systemName: "menucard"),
        children: [
          UIAction(
            title: "Copy",
            image: UIImage(systemName: "doc.on.doc")
          ) { _ in
            SPIndicatorView(title: "Copied", preset: .done).present()
          },
          UIMenu(
            title: "Child Menu",
            image: .init(systemName: "menucard"),
            children: [
              UIAction(
                title: "Copy",
                image: UIImage(systemName: "doc.on.doc")
              ) { _ in
                SPIndicatorView(title: "Copied", preset: .done).present()
              },
            ]
          ),
        ]
      ),
      UIMenu(
        title: "Inline Menu",
        image: UIImage(systemName: "arrow.right"),
        options: [.displayInline],
        children: [
          UIAction(
            title: "Copy",
            image: UIImage(systemName: "doc.on.doc")
          ) { _ in
            SPIndicatorView(title: "Copied", preset: .done).present()
          },
          UIAction(
            title: "Paste",
            image: UIImage(systemName: "doc.on.doc"),
            attributes: .disabled
          ) { _ in
            SPIndicatorView(title: "Pasted", preset: .done).present()
          },
          UIAction(
            title: "Delete",
            image: UIImage(systemName: "trash"),
            attributes: .destructive
          ) { _ in
            SPIndicatorView(title: "Delete", preset: .done).present()
          },
        ]
      ),
    ]))

    var veryLongMenu: Menu = .init(title: "Show Looong Menu Set", menu: .init(title: "Root Menu", children: [
      UIAction(
        title: "Copy 1",
        image: UIImage(systemName: "doc.on.doc")
      ) { _ in
        SPIndicatorView(title: "Copied", preset: .done).present()
      },
      UIAction(
        title: "Paste 1",
        image: UIImage(systemName: "doc.on.doc"),
        attributes: .disabled
      ) { _ in
        SPIndicatorView(title: "Pasted", preset: .done).present()
      },
      UIAction(
        title: "Delete 1",
        image: UIImage(systemName: "trash"),
        attributes: .destructive
      ) { _ in
        SPIndicatorView(title: "Delete", preset: .done).present()
      },
      UIMenu(
        options: [.displayInline],
        children: [
          UIAction(
            title: "Copy 2",
            image: UIImage(systemName: "doc.on.doc")
          ) { _ in
            SPIndicatorView(title: "Copied", preset: .done).present()
          },
          UIAction(
            title: "Paste 2",
            image: UIImage(systemName: "doc.on.doc"),
            attributes: .disabled
          ) { _ in
            SPIndicatorView(title: "Pasted", preset: .done).present()
          },
          UIAction(
            title: "Delete 2",
            image: UIImage(systemName: "trash"),
            attributes: .destructive
          ) { _ in
            SPIndicatorView(title: "Delete", preset: .done).present()
          },
        ]
      ),
      UIMenu(
        options: [.displayInline],
        children: [
          UIAction(
            title: "Copy 3",
            image: UIImage(systemName: "doc.on.doc")
          ) { _ in
            SPIndicatorView(title: "Copied", preset: .done).present()
          },
          UIAction(
            title: "Paste 3",
            image: UIImage(systemName: "doc.on.doc"),
            attributes: .disabled
          ) { _ in
            SPIndicatorView(title: "Pasted", preset: .done).present()
          },
          UIAction(
            title: "Delete 3",
            image: UIImage(systemName: "trash"),
            attributes: .destructive
          ) { _ in
            SPIndicatorView(title: "Delete", preset: .done).present()
          },
        ]
      ),
      UIMenu(
        title: "Submenu Here",
        children: [
          UIAction(
            title: "Copy 4",
            image: UIImage(systemName: "doc.on.doc")
          ) { _ in
            SPIndicatorView(title: "Copied", preset: .done).present()
          },
          UIAction(
            title: "Paste 4",
            image: UIImage(systemName: "doc.on.doc"),
            attributes: .disabled
          ) { _ in
            SPIndicatorView(title: "Pasted", preset: .done).present()
          },
          UIAction(
            title: "Delete 4",
            image: UIImage(systemName: "trash"),
            attributes: .destructive
          ) { _ in
            SPIndicatorView(title: "Delete", preset: .done).present()
          },
        ]
      ),
      UIMenu(
        title: "Hello World",
        options: [.displayInline],
        children: [
          UIAction(
            title: "Copy 5",
            image: UIImage(systemName: "doc.on.doc")
          ) { _ in
            SPIndicatorView(title: "Copied", preset: .done).present()
          },
          UIAction(
            title: "Paste 5",
            image: UIImage(systemName: "doc.on.doc"),
            attributes: .disabled
          ) { _ in
            SPIndicatorView(title: "Pasted", preset: .done).present()
          },
          UIAction(
            title: "Delete 5",
            image: UIImage(systemName: "trash"),
            attributes: .destructive
          ) { _ in
            SPIndicatorView(title: "Delete", preset: .done).present()
          },
        ]
      ),
      UIMenu(
        options: [.displayInline],
        children: [
          UIAction(
            title: "Copy 6",
            image: UIImage(systemName: "doc.on.doc")
          ) { _ in
            SPIndicatorView(title: "Copied", preset: .done).present()
          },
          UIAction(
            title: "Paste 6",
            image: UIImage(systemName: "doc.on.doc"),
            attributes: .disabled
          ) { _ in
            SPIndicatorView(title: "Pasted", preset: .done).present()
          },
          UIAction(
            title: "Delete 6",
            image: UIImage(systemName: "trash"),
            attributes: .destructive
          ) { _ in
            SPIndicatorView(title: "Delete", preset: .done).present()
          },
        ]
      ),
      UIMenu(
        options: [.displayInline],
        children: [
          UIAction(
            title: "Copy 7",
            image: UIImage(systemName: "doc.on.doc")
          ) { _ in
            SPIndicatorView(title: "Copied", preset: .done).present()
          },
          UIAction(
            title: "Paste 7",
            image: UIImage(systemName: "doc.on.doc"),
            attributes: .disabled
          ) { _ in
            SPIndicatorView(title: "Pasted", preset: .done).present()
          },
          UIAction(
            title: "Delete 7",
            image: UIImage(systemName: "trash"),
            attributes: .destructive
          ) { _ in
            SPIndicatorView(title: "Delete", preset: .done).present()
          },
        ]
      ),
    ]))

    var menuList: [Menu] { [
      firstMenu,
      secondMenu,
      veryLongMenu,
    ] }

    func numberOfSections(in _: UITableView) -> Int {
      1
    }

    func tableView(_: UITableView, numberOfRowsInSection _: Int) -> Int {
      menuList.count
    }

    func tableView(_: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
      let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
      let menu = menuList[indexPath.row]
      cell.textLabel?.text = menu.title
      cell.accessoryType = .disclosureIndicator
      return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
      tableView.deselectRow(at: indexPath, animated: true)
      guard let cell = tableView.cellForRow(at: indexPath) else { return }
      let anchorView = UIView()
      cell.addSubview(anchorView)
      anchorView.frame = .init(
        x: cell.bounds.midX,
        y: cell.bounds.midY,
        width: 0,
        height: 0
      )
      let menu = menuList[indexPath.row].menu
      anchorView.present(menu: menu)
      anchorView.removeFromSuperview()
    }

    func tableView(_ tableView: UITableView, viewForHeaderInSection _: Int) -> UIView? {
      let view = UIView()
      view.frame = .init(x: 0, y: 0, width: tableView.bounds.width, height: 20)
      return view
    }
  }

  func makeUIViewController(context _: Context) -> ContentController {
    ContentController()
  }

  func updateUIViewController(_: ContentController, context _: Context) {}
}

class FooterButton: UIButton {
  init() {
    super.init(frame: .init(x: 0, y: 0, width: 200, height: 44))
    setTitle("Test Menu", for: .normal)
    setTitleColor(.systemBlue, for: .normal)
    titleLabel?.font = .preferredFont(forTextStyle: .footnote)

    interactions = [UIContextMenuInteraction(delegate: self)]

    addTarget(self, action: #selector(buttonTapped), for: .touchUpInside)
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  @objc func buttonTapped() {
    presentMenu()
  }

  override func contextMenuInteraction(_: UIContextMenuInteraction, configurationForMenuAtLocation _: CGPoint) -> UIContextMenuConfiguration? {
    .init(identifier: nil, previewProvider: nil) { items in
      .init(title: "Hello World", children: items + [UIAction(title: "Action A") { _ in
        SPIndicator.present(title: "Action A", haptic: .success)
      }])
    }
  }
}
