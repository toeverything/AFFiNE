//
//  IntelligentsFocusApertureView.swift
//  Intelligents
//
//  Created by 秋星桥 on 2024/11/21.
//

import UIKit

public class IntelligentsFocusApertureView: UIView {
  public let backgroundView = UIView()
  public let snapshotImageView = UIImageView()
  let controlButtonsPanel = ControlButtonsPanel()

  public var animationDuration: TimeInterval = 0.75

  public internal(set) weak var targetView: UIView?
  public internal(set) weak var targetViewController: UIViewController?
  public internal(set) weak var capturedImage: UIImage? {
    get { snapshotImageView.image }
    set { snapshotImageView.image = newValue }
  }

  var frameConstraints: [NSLayoutConstraint] = []
  var contentBeginConstraints: [NSLayoutConstraint] = []
  var contentFinalConstraints: [NSLayoutConstraint] = []

  public weak var delegate: (any IntelligentsFocusApertureViewDelegate)?

  public init() {
    super.init(frame: .zero)

    backgroundView.backgroundColor = .black
    backgroundView.isUserInteractionEnabled = true
    let tap = UITapGestureRecognizer(
      target: self,
      action: #selector(dismissFocus)
    )
    tap.cancelsTouchesInView = true
    backgroundView.addGestureRecognizer(tap)

    snapshotImageView.setContentHuggingPriority(.defaultLow, for: .vertical)
    snapshotImageView.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
    snapshotImageView.layer.contentsGravity = .top
    snapshotImageView.layer.masksToBounds = true
    snapshotImageView.contentMode = .scaleAspectFill
    snapshotImageView.isUserInteractionEnabled = true
    snapshotImageView.addGestureRecognizer(UITapGestureRecognizer(
      target: self,
      action: #selector(dismissFocus)
    ))

    addSubview(backgroundView)
    addSubview(controlButtonsPanel)
    addSubview(snapshotImageView)
    bringSubviewToFront(snapshotImageView)

    controlButtonsPanel.translateButton.action = { [weak self] in
      guard let self else { return }
      delegate?.focusApertureRequestAction(from: self, actionType: .translateTo)
    }
    controlButtonsPanel.summaryButton.action = { [weak self] in
      guard let self else { return }
      delegate?.focusApertureRequestAction(from: self, actionType: .summary)
    }
    controlButtonsPanel.chatWithAIButton.action = { [weak self] in
      guard let self else { return }
      delegate?.focusApertureRequestAction(from: self, actionType: .chatWithAI)
    }
    removeEveryAutoResizingMasks()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  public func prepareAnimationWith(
    capturingTargetContentView targetContentView: UIView,
    coveringRootViewController viewController: UIViewController
  ) {
    captureImageBuffer(targetContentView)

    targetView = targetContentView
    targetViewController = viewController

    viewController.view.addSubview(self)

    prepareFrameLayout()
    prepareContentLayouts()
    activateLayoutForAnimation(.begin)
  }

  public func executeAnimationKickIn(_ completion: @escaping () -> Void = {}) {
    activateLayoutForAnimation(.begin)
    isUserInteractionEnabled = false
    UIView.animate(
      withDuration: animationDuration,
      delay: 0,
      usingSpringWithDamping: 1.0,
      initialSpringVelocity: 0.8
    ) {
      self.activateLayoutForAnimation(.complete)
    } completion: { _ in
      self.isUserInteractionEnabled = true
      completion()
    }
  }

  public func executeAnimationDismiss(_ completion: @escaping () -> Void = {}) {
    activateLayoutForAnimation(.complete)
    isUserInteractionEnabled = false
    UIView.animate(
      withDuration: animationDuration,
      delay: 0,
      usingSpringWithDamping: 1.0,
      initialSpringVelocity: 0.8
    ) {
      self.activateLayoutForAnimation(.begin)
    } completion: { _ in
      self.isUserInteractionEnabled = true
      completion()
    }
  }

  @objc func dismissFocus() {
    isUserInteractionEnabled = false
    executeAnimationDismiss {
      self.removeFromSuperview()
      self.delegate?.focusApertureRequestAction(from: self, actionType: .dismiss)
    }
  }
}
