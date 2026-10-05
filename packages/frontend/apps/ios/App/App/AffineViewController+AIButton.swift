//
//  AffineViewController+AIButton.swift
//  App
//
//  Created by 秋星桥 on 2025/1/8.
//

import Intelligents
import UIKit
import WebKit

extension AFFiNEViewController: IntelligentsButtonDelegate {
  private static let aiConsentKey = "com.affine.intelligents.userConsented"

  private var hasUserConsented: Bool {
    UserDefaults.standard.bool(forKey: Self.aiConsentKey)
  }

  func onIntelligentsButtonTapped(_ button: IntelligentsButton) {
    button.beginProgress()
    Task { @MainActor [weak self, weak button] in
      guard let self else {
        button?.stopProgress()
        return
      }
      await self.handleIntelligentsButtonTapped(tappedButton: button)
    }
  }

  @MainActor
  private func handleIntelligentsButtonTapped(tappedButton: IntelligentsButton?) async {
    guard let webView else {
      tappedButton?.stopProgress()
      return
    }

    do {
      let isSignedIn = try await PaywallAuthGuard.ensureSignedIn(using: webView)
      guard isSignedIn else {
        tappedButton?.stopProgress()
        dismissIntelligentsButton()
        return
      }

      if try await PaywallAuthGuard.hasAISubscription(in: webView) {
        tappedButton?.stopProgress()
        continueToIntelligentsController()
        return
      }

      tappedButton?.stopProgress()
      presentAIPaywall(bindWebView: webView)
    } catch {
      tappedButton?.stopProgress()
      showAIErrorAlert(error)
    }
  }

  @MainActor
  private func continueToIntelligentsController() {
    if hasUserConsented {
      prepareAndPresentIntelligentsController()
      return
    }
    showAIConsentAlert { [weak self] in
      self?.prepareAndPresentIntelligentsController()
    }
  }

  @MainActor
  private func prepareAndPresentIntelligentsController() {
    intelligentsButton?.beginProgress()
    IntelligentContext.shared.webView = webView
    IntelligentContext.shared.preparePresent { [weak self] result in
      DispatchQueue.main.async {
        guard let self else { return }
        self.intelligentsButton?.stopProgress()
        switch result {
        case .success:
          self.presentIntelligentsController()
        case let .failure(error):
          self.showAIErrorAlert(error)
        }
      }
    }
  }

  @MainActor
  private func presentIntelligentsController() {
    let controller = IntelligentsController()
    present(controller, animated: true)
  }

  @MainActor
  private func presentAIPaywall(bindWebView webView: WKWebView) {
    guard presentedViewController == nil else { return }

    let paywallController = AppPaywallViewController()
    paywallController.initialPlan = .ai
    paywallController.bindWebView = webView
    paywallController.modalPresentationStyle = .fullScreen
    paywallController.modalTransitionStyle = .coverVertical
    paywallController.onPurchaseCompleted = { [weak self] in
      Task { @MainActor in
        self?.continueToIntelligentsController()
      }
    }
    present(paywallController, animated: true)
  }

  @MainActor
  private func showAIConsentAlert(onContinue: @escaping () -> Void) {
    let alert = UIAlertController(
      title: "AI Feature Data Usage",
      message: "To provide AI-powered features, your input (such as document content and conversation messages) will be sent to our third-party AI service providers (Google, Anthropic, or OpenAI, based on your choice) for processing. This data is used solely to generate responses and is not used for any other purpose.\n\nBy continuing, you agree to share this data with these AI services.",
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    alert.addAction(UIAlertAction(title: "Agree & Continue", style: .default) { _ in
      UserDefaults.standard.set(true, forKey: Self.aiConsentKey)
      onContinue()
    })
    present(alert, animated: true)
  }

  @MainActor
  private func showAIErrorAlert(_ error: Error) {
    let alert = UIAlertController(
      title: "Unable to open AFFiNE AI",
      message: error.localizedDescription,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "OK", style: .cancel))
    present(alert, animated: true)
  }
}
