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
      _ = await openMainAppIfPossible()
      extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
  }

  @discardableResult
  private func openMainAppIfPossible() async -> Bool {
    let url = ShareInboxConstants.openInboxURL
    let openedByContext = await withCheckedContinuation { continuation in
      extensionContext?.open(url) { success in
        continuation.resume(returning: success)
      } ?? continuation.resume(returning: false)
    }
    let opened = openedByContext || openMainAppViaResponderChain(url)
    #if DEBUG
      NSLog(
        "[AFFiNE Share] open url=%@ extensionContext=%@ final=%@",
        url.absoluteString,
        openedByContext ? "YES" : "NO",
        opened ? "YES" : "NO"
      )
    #endif
    return opened
  }

  private func openMainAppViaResponderChain(_ url: URL) -> Bool {
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
