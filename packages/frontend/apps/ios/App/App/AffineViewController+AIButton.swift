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
      message: "To provide AI-powered features, your input (such as document content and conversation messages) will be sent to a third-party AI service for processing. This data is used solely to generate responses and is not used for any other purpose.\n\nBy continuing, you agree to share this data with the AI service.",
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
