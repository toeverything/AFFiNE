//
//  MainViewController+Header.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/19/25.
//

import UIKit

extension MainViewController: MainHeaderViewDelegate {
  func mainHeaderViewDidTapClose() {
    dismiss(animated: true)
  }

  func mainHeaderViewDidTapDropdown() {
    print(#function)
  }

  func mainHeaderViewDidTapMenu() {
    print(#function)
  }
}
