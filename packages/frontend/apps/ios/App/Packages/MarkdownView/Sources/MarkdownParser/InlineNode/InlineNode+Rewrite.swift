import Foundation

extension Sequence<InlineNode> {
  func rewrite(_ r: (InlineNode) throws -> [InlineNode]) rethrows -> [InlineNode] {
    try flatMap { try $0.rewrite(r) }
  }
}

extension InlineNode {
  func rewrite(_ r: (InlineNode) throws -> [InlineNode]) rethrows -> [InlineNode] {
    var inline = self
    inline.children = try children.rewrite(r)
    return try r(inline)
  }
}
