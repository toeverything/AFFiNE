import Foundation

extension Sequence<BlockNode> {
  func rewrite(_ r: (BlockNode) throws -> [BlockNode]) rethrows -> [BlockNode] {
    try flatMap { try $0.rewrite(r) }
  }

  func rewrite(_ r: (InlineNode) throws -> [InlineNode]) rethrows -> [BlockNode] {
    try flatMap { try $0.rewrite(r) }
  }
}

extension BlockNode {
  func rewrite(_ r: (BlockNode) throws -> [BlockNode]) rethrows -> [BlockNode] {
    switch self {
    case let .blockquote(children):
      try r(.blockquote(children: children.rewrite(r)))
    case let .bulletedList(isTight, items):
      try r(
        .bulletedList(
          isTight: isTight,
          items: items.map {
            try RawListItem(children: $0.children.rewrite(r))
          }
        )
      )
    case let .numberedList(isTight, start, items):
      try r(
        .numberedList(
          isTight: isTight,
          start: start,
          items: items.map {
            try RawListItem(children: $0.children.rewrite(r))
          }
        )
      )
    case let .taskList(isTight, items):
      try r(
        .taskList(
          isTight: isTight,
          items: items.map {
            try RawTaskListItem(isCompleted: $0.isCompleted, children: $0.children.rewrite(r))
          }
        )
      )
    default:
      try r(self)
    }
  }

  func rewrite(_ r: (InlineNode) throws -> [InlineNode]) rethrows -> [BlockNode] {
    switch self {
    case let .blockquote(children):
      try [.blockquote(children: children.rewrite(r))]
    case let .bulletedList(isTight, items):
      try [
        .bulletedList(
          isTight: isTight,
          items: items.map {
            try RawListItem(children: $0.children.rewrite(r))
          }
        ),
      ]
    case let .numberedList(isTight, start, items):
      try [
        .numberedList(
          isTight: isTight,
          start: start,
          items: items.map {
            try RawListItem(children: $0.children.rewrite(r))
          }
        ),
      ]
    case let .taskList(isTight, items):
      try [
        .taskList(
          isTight: isTight,
          items: items.map {
            try RawTaskListItem(isCompleted: $0.isCompleted, children: $0.children.rewrite(r))
          }
        ),
      ]
    case let .paragraph(content):
      try [.paragraph(content: content.rewrite(r))]
    case let .heading(level, content):
      try [.heading(level: level, content: content.rewrite(r))]
    case let .table(columnAlignments, rows):
      try [
        .table(
          columnAlignments: columnAlignments,
          rows: rows.map {
            try RawTableRow(
              cells: $0.cells.map {
                try RawTableCell(content: $0.content.rewrite(r))
              }
            )
          }
        ),
      ]
    default:
      [self]
    }
  }
}
