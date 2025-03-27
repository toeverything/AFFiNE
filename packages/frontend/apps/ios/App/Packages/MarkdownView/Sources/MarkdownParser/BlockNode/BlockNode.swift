import Foundation

public enum BlockNode: Hashable, Equatable, Codable {
  case blockquote(children: [BlockNode])
  case bulletedList(isTight: Bool, items: [RawListItem])
  case numberedList(isTight: Bool, start: Int, items: [RawListItem])
  case taskList(isTight: Bool, items: [RawTaskListItem])
  case codeBlock(fenceInfo: String?, content: String)
//    case htmlBlock(content: String)
  case paragraph(content: [InlineNode])
  case heading(level: Int, content: [InlineNode])
  case table(columnAlignments: [RawTableColumnAlignment], rows: [RawTableRow])
  case thematicBreak
//
//    public var typeIdentifier: String {
//        switch self {
//        case .blockquote:
//            "blockquote"
//        case .bulletedList:
//            "bulletedList"
//        case .numberedList:
//            "numberedList"
//        case .taskList:
//            "taskList"
//        case .codeBlock:
//            "codeBlock"
//        case .htmlBlock:
//            "htmlBlock"
//        case .paragraph:
//            "paragraph"
//        case .heading:
//            "heading"
//        case .table:
//            "table"
//        case .thematicBreak:
//            "thematicBreak"
//        }
//    }
}

extension BlockNode {
  var children: [BlockNode] {
    switch self {
    case let .blockquote(children):
      children
    case let .bulletedList(_, items):
      items.map(\.children).flatMap(\.self)
    case let .numberedList(_, _, items):
      items.map(\.children).flatMap(\.self)
    case let .taskList(_, items):
      items.map(\.children).flatMap(\.self)
    default:
      []
    }
  }

  var isParagraph: Bool {
    guard case .paragraph = self else { return false }
    return true
  }
}

public struct RawListItem: Hashable, Equatable, Codable {
  public let children: [BlockNode]
}

public struct RawTaskListItem: Hashable, Equatable, Codable {
  public let isCompleted: Bool
  public let children: [BlockNode]
}

public enum RawTableColumnAlignment: Character, Equatable, Codable {
  case none = "\0"
  case left = "l"
  case center = "c"
  case right = "r"
}

public struct RawTableRow: Hashable, Equatable, Codable {
  public let cells: [RawTableCell]
}

public struct RawTableCell: Hashable, Equatable, Codable {
  public let content: [InlineNode]
}
