//
//  GridView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import UIKit

class GridView: UIView {
  var stokeColor: UIColor = .label.withAlphaComponent(0.25) {
    didSet {
      layer.borderWidth = 1
      layer.borderColor = stokeColor.cgColor
      setNeedsDisplay()
    }
  }

  var lines: [CGPointPair] = [] {
    didSet { setNeedsDisplay() }
  }

  init() {
    super.init(frame: .zero)
    backgroundColor = .clear
    layer.borderWidth = 1
    layer.borderColor = stokeColor.cgColor
    layer.contentsGravity = .top
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  override var frame: CGRect {
    set { UIView.performWithoutAnimation { super.frame = newValue } }
    get { super.frame }
  }

  override func draw(_ rect: CGRect) {
    super.draw(rect)

    guard let context = UIGraphicsGetCurrentContext() else { return }

    context.setStrokeColor(stokeColor.cgColor)
    context.setLineWidth(1)

    for pathPair in lines {
      let adjustedStart = CGPoint(x: pathPair.start.x, y: pathPair.start.y)
      let adjustedEnd = CGPoint(x: pathPair.end.x, y: pathPair.end.y)
      context.move(to: adjustedStart)
      context.addLine(to: adjustedEnd)
    }
    context.strokePath()
  }
}

extension GridView {
  struct CGPointPair: Equatable {
    let start: CGPoint
    let end: CGPoint
  }
}
