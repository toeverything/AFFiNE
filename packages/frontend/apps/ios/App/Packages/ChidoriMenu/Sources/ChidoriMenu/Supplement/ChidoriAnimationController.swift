//
//  ChidoriAnimationController.swift
//  Chidori
//
//  Created by Christian Selig on 2021-02-15.
//

import UIKit

private typealias ChidoriDelegateProtocol = AnyObject
  & UIViewControllerAnimatedTransitioning
  & UIViewControllerInteractiveTransitioning

class ChidoriAnimationController: NSObject, ChidoriDelegateProtocol {
  enum AnimationControllerType { case presentation, dismissal }

  let type: AnimationControllerType
  var animator: UIViewPropertyAnimator?

  weak var context: UIViewControllerContextTransitioning?

  init(type: AnimationControllerType) {
    self.type = type
  }

  func transitionDuration(
    using _: UIViewControllerContextTransitioning?
  ) -> TimeInterval {
    switch type {
    case .presentation:
      0.5
    case .dismissal:
      0.35
    }
  }

  func startInteractiveTransition(
    _ transitionContext: UIViewControllerContextTransitioning
  ) {
    context = transitionContext
    animateTransition(using: transitionContext)
  }

  func cancelTransition() {
    guard let context, let animator else { return }
    context.cancelInteractiveTransition()
    animator.isReversed = true
    animator.startAnimation()

    guard type == .presentation else { return }
    if let presentingController = context.viewController(forKey: .from) {
      presentingController.view.tintAdjustmentMode = .automatic
    }
  }

  func animateTransition(using transitionContext: UIViewControllerContextTransitioning) {
    let interruptableAnimator = interruptibleAnimator(using: transitionContext)

    switch type {
    case .presentation:
      if let menu = transitionContext.viewController(
        forKey: .to
      ) as? ChidoriMenu { transitionContext.containerView.addSubview(menu.view) }

      if let presentingController = transitionContext.viewController(
        forKey: .from
      ) { presentingController.view.tintAdjustmentMode = .dimmed }
    case .dismissal:
      if let presentingController = transitionContext.viewController(
        forKey: .to
      ) { presentingController.view.tintAdjustmentMode = .automatic }
    }

    interruptableAnimator.startAnimation()
  }

  func interruptibleAnimator(
    using context: UIViewControllerContextTransitioning
  ) -> UIViewImplicitlyAnimating {
    if let animator { return animator }

    let duration = transitionDuration(using: context)
    let propertyAnimator = UIViewPropertyAnimator(
      duration: duration,
      timingParameters: UISpringTimingParameters(
        dampingRatio: 0.8,
        initialVelocity: .init(dx: 0.8, dy: 0.8)
      )
    )

    propertyAnimator.isInterruptible = true
    propertyAnimator.isUserInteractionEnabled = true

    let isPresenting = type == .presentation

    guard let menu = (
      isPresenting
        ? context.viewController(forKey: .to)
        : context.viewController(forKey: .from)
    ) as? ChidoriMenu else {
      preconditionFailure()
    }

    let finalFrame = context.finalFrame(for: menu)
    menu.view.frame = finalFrame

    let translationRequired: CGVector = .init(
      dx: 0,
      dy: menu.view.frame.height * -0.1
    )

    let initialAlpha: CGFloat = isPresenting ? 0.0 : 1.0
    let finalAlpha: CGFloat = isPresenting ? 1.0 : 0.0

    let transform = CGAffineTransform(
      translationX: translationRequired.dx,
      y: translationRequired.dy
    ).scaledBy(x: 0.9, y: 0.9)
    let initialTransform = isPresenting ? transform : .identity
    let finalTransform = isPresenting ? .identity : transform

    menu.view.transform = initialTransform
      .concatenating(menu.view.transform)
    menu.view.alpha = initialAlpha

    propertyAnimator.addAnimations {
      menu.view.transform = finalTransform
      menu.view.alpha = finalAlpha
    }

    propertyAnimator.addCompletion { _ in
      context.completeTransition(!context.transitionWasCancelled)
      self.animator = nil
    }

    animator = propertyAnimator
    return propertyAnimator
  }
}
