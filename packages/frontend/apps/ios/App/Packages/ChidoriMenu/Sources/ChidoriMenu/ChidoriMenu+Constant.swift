//
//  ChidoriMenu+Constant.swift
//  ChidoriMenu
//
//  Created by 秋星桥 on 1/19/25.
//

import UIKit

extension ChidoriMenu {
  static let width: CGFloat = 256
  static let cornerRadius: CGFloat = 14
  static let shadowRadius: CGFloat = cornerRadius
  static let sectionTopPadding: CGFloat = 6
  static let offsetY: CGFloat = 10

  static let dimmingBackgroundColor = UIColor.black.withAlphaComponent(0.2)
  static let dimmingSectionSepratorColor = UIColor.black.withAlphaComponent(0.2)
  static let dimmingSectionSepratorHeight: CGFloat = 4

  static let stackScaleFactor: CGFloat = 0.05
}

extension ChidoriMenu.Cell {
  static let highlightCoverColor = UIColor.black.withAlphaComponent(0.1)
}
