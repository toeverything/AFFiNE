//
//  ShareViewController.swift
//  ShareExtension
//

import SwiftUI
import UIKit

final class ShareViewController: UIViewController {
  private let viewModel = ShareViewModel()
  private var hostingController: UIHostingController<ShareExtensionView>?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    let rootView = ShareExtensionView(
      viewModel: viewModel,
      onCancel: { [weak self] in
        self?.cancel()
      },
      onSave: { [weak self] in
        self?.save()
      }
    )
    let hosting = UIHostingController(rootView: rootView)
    hostingController = hosting
    addChild(hosting)
    view.addSubview(hosting.view)
    hosting.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
      hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    hosting.didMove(toParent: self)

    Task {
      await viewModel.load(from: extensionContext)
    }
  }

  private func cancel() {
    extensionContext?.completeRequest(returningItems: nil)
  }

  private func save() {
    Task {
      let success = await viewModel.save()
      guard success else { return }
      // Open host app before dismissing the share sheet.
      // Share extensions cannot use extensionContext.open(_:) — that API is a no-op here.
      openMainAppIfPossible()
      extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
  }

  /// Walk the responder chain to reach UIApplication and open the host app URL scheme.
  /// `UIApplication.shared` is unavailable in app extensions at compile time.
  @discardableResult
  private func openMainAppIfPossible() -> Bool {
    let url = ShareInboxConstants.openInboxURL
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        application.open(url, options: [:], completionHandler: nil)
        return true
      }
      responder = current.next
    }
    return false
  }
}
