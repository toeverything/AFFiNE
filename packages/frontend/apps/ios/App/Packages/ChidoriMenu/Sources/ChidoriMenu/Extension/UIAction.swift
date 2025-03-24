//
//  UIAction.swift
//  ChidoriMenu
//
//  Created by 秋星桥 on 1/19/25.
//

import UIKit

extension UIAction {
  func execute() {
    guard responds(to: NSSelectorFromString("handler")),
          let handler = value(forKey: "_handler")
    else { return }
    typealias ActionBlock = @convention(block) (UIAction) -> Void
    let blockPtr = UnsafeRawPointer(Unmanaged<AnyObject>.passUnretained(handler as AnyObject).toOpaque())
    let block = unsafeBitCast(blockPtr, to: ActionBlock.self)
    return block(self)
  }
}
