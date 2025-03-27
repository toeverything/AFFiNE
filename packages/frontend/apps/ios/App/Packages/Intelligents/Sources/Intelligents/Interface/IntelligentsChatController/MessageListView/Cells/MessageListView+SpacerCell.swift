//
//  MessageListView+SpacerCell.swift
//  FlowDown
//
//  Created by 秋星桥 on 2025/1/12.
//

import Combine
import UIKit

extension MessageListView {
  class SpacerCell: BaseCell {
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
      cache.height = object.height
      return cache
    }
  }
}

extension MessageListView.SpacerCell {
  class ViewModel: MessageListView.Element.ViewModel {
    var height: CGFloat
    init(height: CGFloat) {
      self.height = height
    }

    func contentIdentifier(hasher: inout Hasher) {
      hasher.combine(height)
    }
  }
}

extension MessageListView.SpacerCell {
  class LayoutCache: MessageListView.TableLayoutEngine.LayoutCache {
    var width: CGFloat = 0
    var height: CGFloat = 0
  }
}
