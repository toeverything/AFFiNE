//
//  SKUnitIntelligentDetailView+Feature.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import AffineResources
import SwiftUI

extension SKUnitIntelligentDetailView {
  static let features: [IntelligentFeatureView.Feature] = [
    .init(
      preview: "AI_PREVIEW_WRITE",
      icon: "AI_TEXT",
      title: "Write with you",
      features: [
        "Create quality content from sentences to articles on topics you need",
        "Rewrite like the professionals",
        "Change the tones / fix spelling & grammar",
      ]
    ),
    .init(
      preview: "AI_PREVIEW_DRAW",
      icon: "AI_PEN",
      title: "Draw with you",
      features: [
        "Visualize your mind, magically",
        "Turn your outline into beautiful, engaging presentations(Beta)",
        "Summarize your content into structured mind-maps",
      ]
    ),
    .init(
      preview: "AI_PREVIEW_PLAN",
      icon: "AI_CHECK",
      title: "Plan with you",
      features: [
        "Memorize and tidy up your knowledge",
        "Auto-sorting and auto-tagging (Coming soon)",
        "Privacy ensured",
      ]
    ),
  ]
}
