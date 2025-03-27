//
//  Theme.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import Foundation
import Splash
import UIKit

public extension Theme {
  static var `default`: Theme = .init()
}

public struct Theme: Equatable {
  public struct Fonts: Equatable {
    public var body = UIFont.preferredFont(forTextStyle: .body)
    public var codeInline = UIFont.monospacedSystemFont(
      ofSize: UIFont.preferredFont(forTextStyle: .body).pointSize,
      weight: .regular
    )
    public var bold = UIFont.preferredFont(forTextStyle: .body).bold
    public var italic = UIFont.preferredFont(forTextStyle: .body).italic
    public var code = UIFont.monospacedSystemFont(
      ofSize: UIFont.preferredFont(forTextStyle: .body).pointSize * 0.85,
      weight: .regular
    )
    public var largeTitle = UIFont.preferredFont(forTextStyle: .body).bold
    public var title = UIFont.preferredFont(forTextStyle: .body).bold
  }

  public var fonts: Fonts = .init()

  public struct Colors: Equatable {
    public var body = UIColor.label
    public var emphasis = UIColor.systemOrange
    public var code = UIColor.label
    public var codeBackground = UIColor.gray.withAlphaComponent(0.25)
  }

  public var colors: Colors = .init()

  public struct Spacings: Equatable {
    public var final: CGFloat = 16
    public var general: CGFloat = 8
    public var list: CGFloat = 12
    public var cell: CGFloat = 32
  }

  public var spacings: Spacings = .init()

  public struct Sizes: Equatable {
    public var bullet: CGFloat = 4
  }

  public var sizes: Sizes = .init()

  public init() {}
}

extension UIFont {
  var baseLineHeight: CGFloat {
    NSAttributedString(string: "88", attributes: [
      .font: self,
      .originalFont: self,
    ]).measureHeight(usingWidth: .greatestFiniteMagnitude)
  }
}

private let codeThemeTemplate: Splash.Theme = .init(
  font: .init(size: Double(0)),
  plainTextColor: .label,
  tokenColors: [
    .keyword: Color(
      light: Color(red: 0.948, green: 0.140, blue: 0.547, alpha: 1),
      dark: Color(red: 0.948, green: 0.140, blue: 0.547, alpha: 1)
    ),
    .string: Color(
      light: Color(red: 0.988, green: 0.273, blue: 0.317, alpha: 1),
      dark: Color(red: 0.988, green: 0.273, blue: 0.317, alpha: 1)
    ),
    .type: Color(
      light: Color(red: 0.384, green: 0.698, blue: 0.161, alpha: 1),
      dark: Color(red: 0.584, green: 0.898, blue: 0.361, alpha: 1)
    ),
    .call: Color(
      light: Color(red: 0.384, green: 0.698, blue: 0.161, alpha: 1),
      dark: Color(red: 0.584, green: 0.898, blue: 0.361, alpha: 1)
    ),
    .number: Color(
      light: Color(red: 0.387, green: 0.317, blue: 0.774, alpha: 1),
      dark: Color(red: 0.587, green: 0.517, blue: 0.974, alpha: 1)
    ),
    .comment: Color(
      light: Color(red: 0.424, green: 0.475, blue: 0.529, alpha: 1),
      dark: Color(red: 0.424, green: 0.475, blue: 0.529, alpha: 1)
    ),
    .property: Color(
      light: Color(red: 0.384, green: 0.698, blue: 0.161, alpha: 1),
      dark: Color(red: 0.584, green: 0.898, blue: 0.361, alpha: 1)
    ),
    .dotAccess: Color(
      light: Color(red: 0.384, green: 0.698, blue: 0.161, alpha: 1),
      dark: Color(red: 0.584, green: 0.898, blue: 0.361, alpha: 1)
    ),
    .preprocessing: Color(
      light: Color(red: 0.752, green: 0.326, blue: 0.12, alpha: 19),
      dark: Color(red: 0.952, green: 0.526, blue: 0.22, alpha: 19)
    ),
  ],
  backgroundColor: .clear
)

public extension Theme {
  func codeTheme(withFont font: UIFont) -> Splash.Theme {
    var ret = codeThemeTemplate
    ret.font = .init(size: Double(font.pointSize))
    return ret
  }
}
