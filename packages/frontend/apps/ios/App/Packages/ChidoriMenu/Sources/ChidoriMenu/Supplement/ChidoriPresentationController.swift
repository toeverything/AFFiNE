//
//  ChidoriPresentationController.swift
//  Chidori
//
//  Created by Christian Selig on 2021-02-15.
//

import UIKit

class ChidoriPresentationController: UIPresentationController {
  let dimmView: UIView = .init()
  var minimalEdgeInset: CGFloat = 10

  protocol Delegate: AnyObject {
    func didTapOverlayView(_ chidoriPresentationController: ChidoriPresentationController)
  }

  weak var transitionDelegate: Delegate?

  override func presentationTransitionWillBegin() {
    super.presentationTransitionWillBegin()

    guard let containerView else { return }

    dimmView.translatesAutoresizingMaskIntoConstraints = false
    dimmView.isUserInteractionEnabled = true
    dimmView.isAccessibilityElement = true
    dimmView.accessibilityTraits = .button
    dimmView.accessibilityHint = NSLocalizedString("Close Menu", comment: "")
    dimmView.backgroundColor = ChidoriMenu.dimmingBackgroundColor
    dimmView.alpha = 0.0

    presentingViewController.view.tintAdjustmentMode = .dimmed
    containerView.addSubview(dimmView)

    NSLayoutConstraint.activate([
      containerView.leadingAnchor.constraint(equalTo: dimmView.leadingAnchor),
      containerView.trailingAnchor.constraint(equalTo: dimmView.trailingAnchor),
      containerView.topAnchor.constraint(equalTo: dimmView.topAnchor),
      containerView.bottomAnchor.constraint(equalTo: dimmView.bottomAnchor),
    ])

    let tapGesture = UITapGestureRecognizer(target: nil, action: nil)
    tapGesture.addTarget(self, action: #selector(dimmViewTapped))
    dimmView.addGestureRecognizer(tapGesture)

    if let transitionCoordinator = presentingViewController.transitionCoordinator {
      transitionCoordinator.animate { _ in self.dimmView.alpha = 1.0 }
    }
  }

  override func dismissalTransitionWillBegin() {
    super.dismissalTransitionWillBegin()
    presentingViewController.view.tintAdjustmentMode = .automatic

    if let transitionCoordinator = presentingViewController.transitionCoordinator {
      transitionCoordinator.animate { _ in self.dimmView.alpha = 0.0 }
    }
  }

  override func dismissalTransitionDidEnd(_ completed: Bool) {
    super.dismissalTransitionDidEnd(completed)

    if completed { dimmView.removeFromSuperview() }
  }

  override var frameOfPresentedViewInContainerView: CGRect {
    guard let menu = presentedViewController as? ChidoriMenu else {
      return .zero
    }
    var height = menu.height
    if let heightLimit = containerView?.bounds.height {
      height = min(height, heightLimit * 0.75)
    }
    let menuSize = CGSize(width: ChidoriMenu.width, height: height)
    let originatingPoint = calculateOriginatingPoint(
      anchorPoint: menu.anchorPoint,
      menuSize: menuSize
    )
    return CGRect(origin: originatingPoint, size: menuSize)
  }

  private func calculateOriginatingPoint(
    anchorPoint: CGPoint,
    menuSize: CGSize
  ) -> CGPoint {
    guard let containerView else { return .zero }

    let x: CGFloat = {
      let requiredMinX = anchorPoint.x - ChidoriMenu.width / 2
      let maxPossibleX = minimalEdgeInset
        + containerView.safeAreaInsets.left
      let rightMostPermissableXPosition = containerView.bounds.width
        - minimalEdgeInset
        - containerView.safeAreaInsets.right
        - menuSize.width
      return min(
        rightMostPermissableXPosition,
        max(requiredMinX, maxPossibleX)
      )
    }()

    let y: CGFloat = {
      let maxY = anchorPoint.y + menuSize.height + minimalEdgeInset + ChidoriMenu.offsetY
      let allowedY = containerView.bounds.height - containerView.safeAreaInsets.bottom
      if maxY < allowedY { return anchorPoint.y + ChidoriMenu.offsetY /* move below a little bit */ }
      // if not, iOS tries to keep as much in the bottom half of the screen as possible
      // to be closer to where the thumb normally is, presumably
      return containerView.bounds.height
        - minimalEdgeInset
        - containerView.safeAreaInsets.bottom
        - menuSize.height
    }()

    return CGPoint(x: x, y: y)
  }

  @objc func dimmViewTapped() {
    transitionDelegate?.didTapOverlayView(self)
  }
}
