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
      let opened = await openMainAppIfPossible()
      if !opened {
        viewModel.infoMessage = "Saved. Open AFFiNE to finish import."
        try? await Task.sleep(nanoseconds: 1_200_000_000)
      }
      extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
  }

  @discardableResult
  private func openMainAppIfPossible() async -> Bool {
    let url = ShareInboxConstants.openInboxURL
    guard let extensionContext else { return false }
    let opened = await withCheckedContinuation { continuation in
      extensionContext.open(url) { success in
        continuation.resume(returning: success)
      }
    }
    #if DEBUG
      NSLog("[AFFiNE Share] extensionContext.open success=%@", opened ? "YES" : "NO")
    #endif
    return opened
  }
}
