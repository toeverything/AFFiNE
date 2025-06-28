//
//  AffineViewController+AIButton.swift
//  App
//
//  Created by 秋星桥 on 2025/1/8.
//

import Intelligents
import UIKit

extension AFFiNEViewController: IntelligentsButtonDelegate {
  func onIntelligentsButtonTapped(_ button: IntelligentsButton) {
    IntelligentContext.shared.webView = webView!
    button.beginProgress()
    
    IntelligentContext.shared.preparePresent() { result in
      button.stopProgress()
      switch result {
      case .success(let success):
        let controller = IntelligentsController()
        self.present(controller, animated: true)
      case .failure(let failure):
        let alert = UIAlertController(
          title: "Error",
          message: failure.localizedDescription,
          preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        self.present(alert, animated: true)
      }
    }
  }
}
