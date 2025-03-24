//
//  BlockView.swift
//  FlowMarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import Foundation
import MarkdownParser
import UIKit

public class BlockView: UIView {
  private(set) var _manifest: AnyBlockManifest
  required init(manifest: AnyBlockManifest) {
    _manifest = manifest
    super.init(frame: .zero)
    backgroundColor = .clear

//        NSLog("[*] \(type(of: self)) was initialized at \(Date()) \(debugDescription)")

    viewDidLoad()
    viewDidUpdate()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  override public func action(for _: CALayer, forKey _: String) -> (any CAAction)? {
    nil
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    assert(_manifest.size.width >= 0, "\(type(of: self))'s manifest has invalid size")
    assert(_manifest.size.height >= 0, "\(type(of: self))'s manifest has invalid size")
    viewDidLayout()
  }

  func viewDidLoad() {
    assert(Thread.isMainThread)
  }

  func viewDidUpdate() {
    assert(Thread.isMainThread)
  }

  func viewDidLayout() {
    assert(Thread.isMainThread)
  }

  func accept(_ manifest: AnyBlockManifest) -> Bool {
    manifest is Manifest
  }

  func set(_ manifest: AnyBlockManifest) {
    _manifest = manifest
    viewDidUpdate()
    setNeedsLayout()
  }
}

public extension BlockView {
  class Manifest: BlockManifest {
    public var size: CGSize = .zero
    public var theme: Theme = .default
    public var dirty: Bool = true

    public var intrinsicWidth: CGFloat { 0 }

    public required init() {}

    public func load(block _: BlockNode) {}

    public func layoutIfNeeded() {
      dirty = false
    }

    public func determineViewType() -> BlockView.Type {
      BlockView.self
    }
  }
}
