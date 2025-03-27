import Foundation

public enum InlineNode: Hashable, Sendable, Equatable, Codable {
  case text(String)
  case softBreak
  case lineBreak
  case code(String)
  case html(String)
  case emphasis(children: [InlineNode])
  case strong(children: [InlineNode])
  case strikethrough(children: [InlineNode])
  case link(destination: String, children: [InlineNode])
  case image(source: String, children: [InlineNode])
}

extension InlineNode {
  var children: [InlineNode] {
    get {
      switch self {
      case let .emphasis(children):
        children
      case let .strong(children):
        children
      case let .strikethrough(children):
        children
      case let .link(_, children):
        children
      case let .image(_, children):
        children
      default:
        []
      }
    }

    set {
      switch self {
      case .emphasis:
        self = .emphasis(children: newValue)
      case .strong:
        self = .strong(children: newValue)
      case .strikethrough:
        self = .strikethrough(children: newValue)
      case let .link(destination, _):
        self = .link(destination: destination, children: newValue)
      case let .image(source, _):
        self = .image(source: source, children: newValue)
      default:
        break
      }
    }
  }
}
