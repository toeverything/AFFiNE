//
//  Present+UIView.swift
//  ChidoriMenu
//
//  Created by 秋星桥 on 1/19/25.
//

import UIKit

public extension UIView {
  func present(menu: UIMenu, anchorPoint: CGPoint? = nil, onMenuCreated: (ChidoriMenu) -> Void = { _ in }) {
    guard let presenter = parentViewController else { return }
    let chidoriMenu = ChidoriMenu(
      menu: menu,
      anchorPoint: anchorPoint ?? convert(.init(
        x: bounds.midX,
        y: bounds.midY
      ), to: window)
    )
    onMenuCreated(chidoriMenu)
    presenter.present(chidoriMenu, animated: true) {
      chidoriMenu.dismissIfEmpty()
    }
  }
}
