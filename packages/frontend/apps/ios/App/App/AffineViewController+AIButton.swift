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
    // if it shows up then we are ready to go
    let controller = IntelligentsController()
    self.present(controller, animated: true)
    //    IntelligentContext.shared.webView = webView
    //    button.beginProgress()
    //    IntelligentContext.shared.preparePresent { result in
    //      DispatchQueue.main.async {
    //        button.stopProgress()
    //        switch result {
    //        case .success:
    //        case let .failure(failure):
    //          let alert = UIAlertController(
    //            title: "Error",
    //            message: failure.localizedDescription,
    //            preferredStyle: .alert
    //          )
    //          alert.addAction(UIAlertAction(title: "OK", style: .default))
    //          self.present(alert, animated: true)
    //        }
    //      }
    //    }
  }
}
