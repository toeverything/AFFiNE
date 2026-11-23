//
//  MainHeaderViewDelegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import Foundation

protocol MainHeaderViewDelegate: AnyObject {
  func mainHeaderViewDidTapClose()
  func mainHeaderViewDidTapDropdown()
  func mainHeaderViewDidTapMenu()
}
