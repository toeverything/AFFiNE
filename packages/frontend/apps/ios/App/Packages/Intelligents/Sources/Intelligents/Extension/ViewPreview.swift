//
//  ViewPreview.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/24/25.
//

import Foundation
import UIKit

#if canImport(SwiftUI) && DEBUG
  import SwiftUI

  struct UIViewControllerPreview<ViewController: UIViewController>: UIViewControllerRepresentable {
    let viewController: ViewController

    init(_ builder: @escaping () -> ViewController) {
      viewController = builder()
    }

    func makeUIViewController(context _: Context) -> ViewController {
      viewController
    }

    func updateUIViewController(_: ViewController, context _: Context) {}
  }
#endif

#if canImport(SwiftUI) && DEBUG
  import SwiftUI

  struct UIViewPreview<View: UIView>: UIViewRepresentable {
    let view: View

    init(_ builder: @escaping () -> View) {
      view = builder()
    }

    // MARK: UIViewRepresentable

    func makeUIView(context _: Context) -> UIView {
      view
    }

    func updateUIView(_ view: UIView, context _: Context) {
      view.setContentCompressionResistancePriority(.fittingSizeLevel, for: .horizontal)
      view.setContentCompressionResistancePriority(.fittingSizeLevel, for: .vertical)
      view.setContentHuggingPriority(.defaultHigh, for: .horizontal)
      view.setContentHuggingPriority(.defaultHigh, for: .vertical)
    }
  }
#endif
