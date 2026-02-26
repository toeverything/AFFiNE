//
//  AffineViewController+AIButton.swift
//  App
//
//  Created by 秋星桥 on 2025/1/8.
//

import Intelligents
import UIKit

extension AFFiNEViewController: IntelligentsButtonDelegate {
  private static let aiConsentKey = "com.affine.intelligents.userConsented"

  private var hasUserConsented: Bool {
    UserDefaults.standard.bool(forKey: Self.aiConsentKey)
  }

  func onIntelligentsButtonTapped(_: IntelligentsButton) {
    if hasUserConsented {
      presentIntelligentsController()
      return
    }
    showAIConsentAlert()
  }

  private func presentIntelligentsController() {
    let controller = IntelligentsController()
    present(controller, animated: true)
  }

  private func showAIConsentAlert() {
    let alert = UIAlertController(
      title: "AI Feature Data Usage",
      message: "o provide AI-powered features, your input (such as document content and conversation messages) will be sent to [OpenAI or Anthropic] for processing.\n\nThis data is used solely to generate responses for you and will not be used to train AI models.\n\nBy tapping \"Agree & Continue\", you consent to share this data with [OpenAI or Anthropic].",
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    alert.addAction(UIAlertAction(title: "Agree & Continue", style: .default) { [weak self] _ in
      UserDefaults.standard.set(true, forKey: Self.aiConsentKey)
      self?.presentIntelligentsController()
    })
    present(alert, animated: true)
  }
}
