//
//  MessageListView+AssistantCell.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/2.
//

import Combine
import MarkdownParser
import MarkdownView
import UIKit

extension MessageListView {
  class AssistantCell: BaseCell {
    let avatarView = UIImageView()
    let usernameView = UILabel()
    let markdownView = MarkdownView()

    override func initializeContent() {
      super.initializeContent()

      avatarView.contentMode = .scaleAspectFit
      avatarView.image = UIImage(named: "spark", in: .module, with: nil)
      usernameView.text = "AFFiNE AI"
      usernameView.font = .preferredFont(forTextStyle: .body).bold
      usernameView.textColor = .label

      containerView.addSubview(avatarView)
      containerView.addSubview(usernameView)
      containerView.addSubview(markdownView)
    }

    override func prepareForReuse() {
      super.prepareForReuse()
      markdownView.prepareForReuse()
    }

    override func updateContent(
      object: any MessageListView.Element.ViewModel,
      originalObject _: Element.UserObject?
    ) {
      guard let object = object as? ViewModel else {
        assertionFailure()
        return
      }
      _ = object
    }

    override func layoutContent(cache: any MessageListView.TableLayoutEngine.LayoutCache) {
      super.layoutContent(cache: cache)
      guard let cache = cache as? LayoutCache else {
        assertionFailure()
        return
      }
      avatarView.frame = cache.avatarRect
      usernameView.frame = cache.usernameRect
      markdownView.frame = cache.markdownFrame

      UIView.performWithoutAnimation {
        markdownView.updateContentViews(cache.manifests)
      }
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

      let inset: CGFloat = 8
      let bubbleInset = UIEdgeInsets(top: inset, left: inset, bottom: inset, right: inset)

      let avatarRect = CGRect(x: bubbleInset.left, y: bubbleInset.top, width: 24, height: 24)
      let usernameRect = CGRect(
        x: avatarRect.maxX + bubbleInset.right,
        y: bubbleInset.top,
        width: containerWidth - avatarRect.maxX - bubbleInset.right,
        height: 24
      )

      let textWidth = containerWidth - bubbleInset.left - bubbleInset.right

      var height: CGFloat = 0
      let manifests = object.blocks.map {
        let ret = $0.manifest(theme: object.theme)
        ret.setLayoutTheme(.default)
        ret.setLayoutWidth(textWidth)
        ret.layoutIfNeeded()
        height += ret.size.height + Theme.default.spacings.final
        return ret
      }
      if height > 0 { height -= Theme.default.spacings.final }
      let textRect = CGRect(
        x: bubbleInset.left,
        y: usernameRect.maxY + bubbleInset.bottom,
        width: textWidth,
        height: height
      )
      cache.markdownFrame = textRect
      cache.avatarRect = avatarRect
      cache.usernameRect = usernameRect
      cache.manifests = manifests
      cache.height = textRect.maxY + bubbleInset.bottom

      return cache
    }
  }
}

extension MessageListView.AssistantCell {
  class ViewModel: MessageListView.Element.ViewModel {
    var theme: Theme
    var blocks: [BlockNode]

    enum GroupLocation {
      case begin
      case center
      case end
    }

    var groupLocation: GroupLocation = .center

    init(theme: Theme = .default, blocks: [BlockNode]) {
      self.theme = theme
      self.blocks = blocks
    }

    func contentIdentifier(hasher: inout Hasher) {
      hasher.combine(blocks)
    }
  }
}

extension MessageListView.AssistantCell {
  class LayoutCache: MessageListView.TableLayoutEngine.LayoutCache {
    var width: CGFloat = 0
    var height: CGFloat = 0

    var avatarRect: CGRect = .zero
    var usernameRect: CGRect = .zero

    var markdownFrame: CGRect = .zero
    var manifests: [AnyBlockManifest] = []
  }
}
