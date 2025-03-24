//
//  MessageListView+HintCell.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/2.
//

import Combine
import UIKit

extension MessageListView {
  class HintCell: BaseCell {
    let label = UILabel()

    override func initializeContent() {
      super.initializeContent()
      label.font = .preferredFont(forTextStyle: .footnote)
      label.alpha = 0.5
      label.numberOfLines = 0
      containerView.addSubview(label)
    }

    override func updateContent(
      object: any MessageListView.Element.ViewModel,
      originalObject: Element.UserObject?
    ) {
      super.updateContent(object: object, originalObject: originalObject)
      guard let object = object as? ViewModel else { return }
      label.attributedText = object.hint
    }

    override func layoutContent(cache: any MessageListView.TableLayoutEngine.LayoutCache) {
      super.layoutContent(cache: cache)
      guard let cache = cache as? LayoutCache else {
        assertionFailure()
        return
      }
      label.frame = cache.labelFrame
    }

    override class func layoutInsideContainer(
      containerWidth: CGFloat,
      object: any MessageListView.Element.ViewModel
    ) -> any MessageListView.TableLayoutEngine.LayoutCache {
      guard let object = object as? ViewModel else {
        assertionFailure()
        return LayoutCache()
      }
      let cache = LayoutCache()
      cache.width = containerWidth
      cache.height = object.hint.measureHeight(usingWidth: containerWidth)
      cache.labelFrame = .init(x: 0, y: 0, width: containerWidth, height: cache.height)
      return cache
    }
  }
}

extension MessageListView.HintCell {
  class ViewModel: MessageListView.Element.ViewModel {
    var hint: NSAttributedString = .init()

    init(hint: NSAttributedString) {
      self.hint = hint
    }

    convenience init(hint: String) {
      let paragraphStyle = NSMutableParagraphStyle()
      paragraphStyle.alignment = .center
      let attributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.preferredFont(forTextStyle: .footnote),
        .originalFont: UIFont.preferredFont(forTextStyle: .footnote),
        .foregroundColor: UIColor.label,
        .paragraphStyle: paragraphStyle,
      ]
      let text = NSMutableAttributedString(string: hint, attributes: attributes)
      self.init(hint: text)
    }

    func contentIdentifier(hasher: inout Hasher) {
      hasher.combine(hint)
    }
  }
}

extension MessageListView.HintCell {
  class LayoutCache: MessageListView.TableLayoutEngine.LayoutCache {
    var width: CGFloat = 0
    var height: CGFloat = 0

    var labelFrame: CGRect = .zero
  }
}
