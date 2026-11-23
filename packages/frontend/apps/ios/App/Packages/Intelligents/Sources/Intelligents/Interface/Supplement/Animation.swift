//
//  Animation.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/19/25.
//

import UIKit

func performWithAnimation(
  duration: TimeInterval = 0.5,
  animations: @escaping () -> Void,
  completion: @escaping (Bool) -> Void = { _ in }
) {
  UIView.animate(
    withDuration: duration,
    delay: 0,
    usingSpringWithDamping: 0.8,
    initialSpringVelocity: 0.8,
    options: [.beginFromCurrentState, .allowAnimatedContent, .curveEaseInOut],
    animations: animations,
    completion: completion
  )
}
