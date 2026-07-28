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
    Task { [weak self] in
      guard let self else { return }
      let success = await viewModel.save()
      guard success else { return }
      await openMainAppIfPossible()
      extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
  }

  /// Walk the responder chain to reach UIApplication and open the host app URL scheme.
  /// `UIApplication.shared` is unavailable in app extensions at compile time.
  @discardableResult
  private func openMainAppIfPossible() async -> Bool {
    let url = ShareInboxConstants.openInboxURL
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        return await withCheckedContinuation { continuation in
          application.open(url, options: [:]) { success in
            continuation.resume(returning: success)
          }
        }
      }
      responder = current.next
    }
    return false
  }
}
