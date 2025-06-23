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
    
    IntelligentContext.shared.preparePresent() {
      button.stopProgress()
      let controller = IntelligentsController()
      self.present(controller, animated: true)
    }
  }
}
