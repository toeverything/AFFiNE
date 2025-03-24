// The Swift Programming Language
// https://docs.swift.org/swift-book

import MarkdownParser
import UIKit

public class MarkdownView: UIView {
  public var height: CGFloat = 0

  var blockViews: [BlockView] = []

  public var theme: Theme
  public init(theme: Theme = .default) {
    self.theme = theme
    super.init(frame: .zero)
    clipsToBounds = true
  }

  @available(*, unavailable)
  public required init?(coder _: NSCoder) {
    fatalError()
  }

  public func prepareForReuse() {
    blockViews.forEach { $0.removeFromSuperview() }
    blockViews.removeAll()
  }

  public func updateContentViews(_ manifest: [AnyBlockManifest]) {
    assert(Thread.isMainThread)
    diffableUpdate(reusingViews: &blockViews, manifests: manifest)
    var anchorY: CGFloat = 0
    for view in blockViews {
      view.frame = CGRect(
        x: 0,
        y: anchorY,
        width: view._manifest.size.width,
        height: view._manifest.size.height
      )
      anchorY = view.frame.maxY + theme.spacings.final
    }
    assert(subviews.count == blockViews.count)
  }
}
