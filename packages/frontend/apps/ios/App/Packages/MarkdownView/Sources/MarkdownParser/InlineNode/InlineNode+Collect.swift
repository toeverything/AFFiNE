import Foundation

extension Sequence<InlineNode> {
  func collect<Result>(_ c: (InlineNode) throws -> [Result]) rethrows -> [Result] {
    try flatMap { try $0.collect(c) }
  }
}

extension InlineNode {
  func collect<Result>(_ c: (InlineNode) throws -> [Result]) rethrows -> [Result] {
    try children.collect(c) + c(self)
  }
}
