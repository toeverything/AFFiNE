//
//  Feature.swift
//  AffinePaywall
//
//  Created by qaq on 9/18/25.
//

import Foundation

struct Feature: Identifiable, Equatable, Hashable {
  var id = UUID()
  var text: String
  var isHighlighted: Bool // For text like "Everything in AFFINE Pro"

  init(_ text: String, isHighlighted: Bool = false) {
    self.text = text
    self.isHighlighted = isHighlighted
  }
}
