//
//  ParticleView+Removal.swift
//  UIEffectKit
//
//  Created by 秋星桥 on 6/13/25.
//

import UIKit

public extension UIView {
  func removeFromSuperviewWithExplodeEffect() {
    guard let superview else { return }
    guard let window else {
      removeFromSuperview()
      return
    }
    guard MTLCreateSystemDefaultDevice() != nil else {
      removeFromSuperview()
      return
    }

    let image = createViewSnapshot()
    guard let cgImage = image.cgImage else {
      removeFromSuperview()
      return
    }

    let frameInWindow = superview.convert(frame, to: window)
    let particleView = ParticleView(frame: frameInWindow)

    window.addSubview(particleView)
    particleView.layer.zPosition = 1000
    particleView.frame = frameInWindow
    particleView.setNeedsLayout()
    particleView.layoutIfNeeded()

    particleView.beginWith(cgImage, targetFrame: frameInWindow, onComplete: {
      particleView.removeFromSuperview()
    }, onFirstFrameRendered: { [weak self] in
      DispatchQueue.main.async {
        self?.removeFromSuperview()
      }
    })
  }
}
