//
//  BlurTransition.swift
//  BlurTransition
//
//  Created by 秋星桥 on 6/16/23.
//

import UIKit

extension UIViewController {
  func presentWithFullScreenBlurTransition(_ viewController: UIViewController) {
    viewController.modalPresentationStyle = .custom
    viewController.transitioningDelegate = BlurTransitioningDelegate.shared
    present(viewController, animated: true)
  }
}

class BlurTransitioningDelegate: NSObject, UIViewControllerTransitioningDelegate {
  static let shared = BlurTransitioningDelegate()

  func animationController(
    forPresented _: UIViewController,
    presenting _: UIViewController,
    source _: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    BlurTransitionAnimator(presenting: true)
  }

  func animationController(
    forDismissed _: UIViewController
  ) -> UIViewControllerAnimatedTransitioning? {
    BlurTransitionAnimator(presenting: false)
  }
}

class BlurTransitionAnimator: NSObject, UIViewControllerAnimatedTransitioning {
  private let presenting: Bool

  private let snapshotViewTag = "snapshotView".hashValue
  private let blurViewTag = "blurView".hashValue

  init(presenting: Bool) {
    self.presenting = presenting
    super.init()
  }

  func transitionDuration(using _: UIViewControllerContextTransitioning?) -> TimeInterval {
    0.5
  }

  func animateTransition(using transitionContext: UIViewControllerContextTransitioning) {
    if presenting {
      animatePresentation(using: transitionContext)
    } else {
      animateDismissal(using: transitionContext)
    }
  }

  private func animatePresentation(using transitionContext: UIViewControllerContextTransitioning) {
    guard let toViewController = transitionContext.viewController(forKey: .to),
          let fromViewController = transitionContext.viewController(forKey: .from)
    else {
      transitionContext.completeTransition(false)
      assertionFailure()
      return
    }

    let toView = toViewController.view!
    let fromView = fromViewController.view!

    let containerView = transitionContext.containerView

    guard let fromViewSnapshot = fromView.snapshotView(afterScreenUpdates: false) else {
      transitionContext.completeTransition(false)
      assertionFailure()
      return
    }
    fromViewSnapshot.frame = fromView.frame
    fromViewSnapshot.tag = snapshotViewTag
    containerView.addSubview(fromViewSnapshot)
    fromView.isHidden = true

    let blurEffectView = UIVisualEffectView()
    blurEffectView.frame = containerView.bounds
    blurEffectView.tag = blurViewTag
    containerView.addSubview(blurEffectView)

    toView.frame = containerView.bounds
    toView.alpha = 0
    toView.transform = CGAffineTransform(scaleX: 1.05, y: 1.05)
    containerView.addSubview(toView)

    toView.layoutIfNeeded()

    performWithAnimation(animations: {
      blurEffectView.effect = UIBlurEffect(style: .systemMaterial)
      fromViewSnapshot.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
      toView.alpha = 1
      toView.transform = .identity
      fromView.layoutIfNeeded()
      toView.layoutIfNeeded()
    }) { _ in
      let success = !transitionContext.transitionWasCancelled
      if !success {
        assertionFailure()
        fromView.isHidden = false
        fromViewSnapshot.removeFromSuperview()
        blurEffectView.removeFromSuperview()
        toView.removeFromSuperview()
      }
      transitionContext.completeTransition(success)
    }
  }

  private func animateDismissal(using transitionContext: UIViewControllerContextTransitioning) {
    guard let fromViewController = transitionContext.viewController(forKey: .from),
          let toViewController = transitionContext.viewController(forKey: .to)
    else {
      transitionContext.completeTransition(false)
      assertionFailure()
      return
    }

    let fromView = fromViewController.view!
    let toView = toViewController.view!
    let containerView = transitionContext.containerView

    guard let fromViewSnapshot = containerView.viewWithTag(snapshotViewTag),
          let blurEffectView = containerView.viewWithTag(blurViewTag) as? UIVisualEffectView
    else {
      toView.isHidden = false
      assertionFailure()
      transitionContext.completeTransition(true)
      return
    }

    performWithAnimation(animations: {
      fromViewSnapshot.transform = .identity
      blurEffectView.effect = nil
      fromView.transform = CGAffineTransform(scaleX: 1.05, y: 1.05)
      fromView.alpha = 0
    }) { _ in
      let success = !transitionContext.transitionWasCancelled
      if success {
        toView.isHidden = false
        fromViewSnapshot.removeFromSuperview()
        blurEffectView.removeFromSuperview()
        fromView.layoutIfNeeded()
        toView.layoutIfNeeded()
      } else {
        assertionFailure()
        fromView.transform = .identity
        fromView.alpha = 1
      }
      transitionContext.completeTransition(success)
    }
  }
}
