import cmark_gfm
import cmark_gfm_extensions
import Foundation

typealias UnsafeNode = UnsafeMutablePointer<cmark_node>

extension BlockNode {
  init?(unsafeNode: UnsafeNode) {
    switch unsafeNode.nodeType {
    case .blockquote:
      self = .blockquote(children: unsafeNode.children.compactMap(BlockNode.init(unsafeNode:)))
    case .list:
      if unsafeNode.children.contains(where: \.isTaskListItem) {
        self = .taskList(
          isTight: unsafeNode.isTightList,
          items: unsafeNode.children.map(RawTaskListItem.init(unsafeNode:))
        )
      } else {
        switch unsafeNode.listType {
        case CMARK_BULLET_LIST:
          self = .bulletedList(
            isTight: unsafeNode.isTightList,
            items: unsafeNode.children.map(RawListItem.init(unsafeNode:))
          )
        case CMARK_ORDERED_LIST:
          self = .numberedList(
            isTight: unsafeNode.isTightList,
            start: unsafeNode.listStart,
            items: unsafeNode.children.map(RawListItem.init(unsafeNode:))
          )
        default:
          fatalError("cmark reported a list node without a list type.")
        }
      }
    case .codeBlock:
      self = .codeBlock(fenceInfo: unsafeNode.fenceInfo, content: unsafeNode.literal ?? "")
    case .htmlBlock:
//            self = .htmlBlock(content: unsafeNode.literal ?? "")
      self = .codeBlock(fenceInfo: "html", content: unsafeNode.literal ?? "")
    case .paragraph:
      self = .paragraph(content: unsafeNode.children.compactMap(InlineNode.init(unsafeNode:)))
    case .heading:
      self = .heading(
        level: unsafeNode.headingLevel,
        content: unsafeNode.children.compactMap(InlineNode.init(unsafeNode:))
      )
    case .table:
      self = .table(
        columnAlignments: unsafeNode.tableAlignments,
        rows: unsafeNode.children.map(RawTableRow.init(unsafeNode:))
      )
    case .thematicBreak:
      self = .thematicBreak
    default:
      assertionFailure("Unhandled node type '\(unsafeNode.nodeType)' in BlockNode.")
      return nil
    }
  }
}

extension RawListItem {
  init(unsafeNode: UnsafeNode) {
    guard unsafeNode.nodeType == .item else {
      fatalError("Expected a list item but got a '\(unsafeNode.nodeType)' instead.")
    }
    self.init(children: unsafeNode.children.compactMap(BlockNode.init(unsafeNode:)))
  }
}

extension RawTaskListItem {
  init(unsafeNode: UnsafeNode) {
    guard unsafeNode.nodeType == .taskListItem || unsafeNode.nodeType == .item else {
      fatalError("Expected a list item but got a '\(unsafeNode.nodeType)' instead.")
    }
    self.init(
      isCompleted: unsafeNode.isTaskListItemChecked,
      children: unsafeNode.children.compactMap(BlockNode.init(unsafeNode:))
    )
  }
}

extension RawTableRow {
  init(unsafeNode: UnsafeNode) {
    guard unsafeNode.nodeType == .tableRow || unsafeNode.nodeType == .tableHead else {
      fatalError("Expected a table row but got a '\(unsafeNode.nodeType)' instead.")
    }
    self.init(cells: unsafeNode.children.map(RawTableCell.init(unsafeNode:)))
  }
}

extension RawTableCell {
  init(unsafeNode: UnsafeNode) {
    guard unsafeNode.nodeType == .tableCell else {
      fatalError("Expected a table cell but got a '\(unsafeNode.nodeType)' instead.")
    }
    self.init(content: unsafeNode.children.compactMap(InlineNode.init(unsafeNode:)))
  }
}

extension InlineNode {
  init?(unsafeNode: UnsafeNode) {
    switch unsafeNode.nodeType {
    case .text:
      self = .text(unsafeNode.literal ?? "")
    case .softBreak:
      self = .softBreak
    case .lineBreak:
      self = .lineBreak
    case .code:
      self = .code(unsafeNode.literal ?? "")
    case .html:
      self = .html(unsafeNode.literal ?? "")
    case .emphasis:
      self = .emphasis(children: unsafeNode.children.compactMap(InlineNode.init(unsafeNode:)))
    case .strong:
      self = .strong(children: unsafeNode.children.compactMap(InlineNode.init(unsafeNode:)))
    case .strikethrough:
      self = .strikethrough(children: unsafeNode.children.compactMap(InlineNode.init(unsafeNode:)))
    case .link:
      self = .link(
        destination: unsafeNode.url ?? "",
        children: unsafeNode.children.compactMap(InlineNode.init(unsafeNode:))
      )
    case .image:
      self = .image(
        source: unsafeNode.url ?? "",
        children: unsafeNode.children.compactMap(InlineNode.init(unsafeNode:))
      )
    default:
      assertionFailure("Unhandled node type '\(unsafeNode.nodeType)' in InlineNode.")
      return nil
    }
  }
}

extension UnsafeNode {
  var nodeType: NodeType {
    let typeString = String(cString: cmark_node_get_type_string(self))
    guard let nodeType = NodeType(rawValue: typeString) else {
      fatalError("Unknown node type '\(typeString)' found.")
    }
    return nodeType
  }

  var children: UnsafeNodeSequence {
    .init(cmark_node_first_child(self))
  }

  var literal: String? {
    cmark_node_get_literal(self).map(String.init(cString:))
  }

  var url: String? {
    cmark_node_get_url(self).map(String.init(cString:))
  }

  var isTaskListItem: Bool {
    nodeType == .taskListItem
  }

  var listType: cmark_list_type {
    cmark_node_get_list_type(self)
  }

  var listStart: Int {
    Int(cmark_node_get_list_start(self))
  }

  var isTaskListItemChecked: Bool {
    cmark_gfm_extensions_get_tasklist_item_checked(self)
  }

  var isTightList: Bool {
    cmark_node_get_list_tight(self) != 0
  }

  var fenceInfo: String? {
    cmark_node_get_fence_info(self).map(String.init(cString:))
  }

  var headingLevel: Int {
    Int(cmark_node_get_heading_level(self))
  }

  var tableColumns: Int {
    Int(cmark_gfm_extensions_get_table_columns(self))
  }

  var tableAlignments: [RawTableColumnAlignment] {
    (0 ..< tableColumns).map { column in
      let ascii = cmark_gfm_extensions_get_table_alignments(self)[column]
      let scalar = UnicodeScalar(ascii)
      let character = Character(scalar)
      return .init(rawValue: character) ?? .none
    }
  }
}

enum NodeType: String {
  case document
  case blockquote = "block_quote"
  case list
  case item
  case codeBlock = "code_block"
  case htmlBlock = "html_block"
  case customBlock = "custom_block"
  case paragraph
  case heading
  case thematicBreak = "thematic_break"
  case text
  case softBreak = "softbreak"
  case lineBreak = "linebreak"
  case code
  case html = "html_inline"
  case customInline = "custom_inline"
  case emphasis = "emph"
  case strong
  case link
  case image
  case inlineAttributes = "attribute"
  case none = "NONE"
  case unknown = "<unknown>"

  // Extensions

  case strikethrough
  case table
  case tableHead = "table_header"
  case tableRow = "table_row"
  case tableCell = "table_cell"
  case taskListItem = "tasklist"
}

struct UnsafeNodeSequence: Sequence {
  struct Iterator: IteratorProtocol {
    var node: UnsafeNode?

    init(_ node: UnsafeNode?) {
      self.node = node
    }

    mutating func next() -> UnsafeNode? {
      guard let node else { return nil }
      defer { self.node = cmark_node_next(node) }
      return node
    }
  }

  let node: UnsafeNode?

  init(_ node: UnsafeNode?) {
    self.node = node
  }

  func makeIterator() -> Iterator {
    .init(node)
  }
}

// Extension node types are not exported in `cmark_gfm_extensions`,
// so we need to look for them in the symbol table
struct ExtensionNodeTypes {
  let CMARK_NODE_TABLE: cmark_node_type
  let CMARK_NODE_TABLE_ROW: cmark_node_type
  let CMARK_NODE_TABLE_CELL: cmark_node_type
  let CMARK_NODE_STRIKETHROUGH: cmark_node_type

  static let shared = ExtensionNodeTypes()

  init() {
    func findNodeType(_ name: String, in handle: UnsafeMutableRawPointer!) -> cmark_node_type? {
      guard let symbol = dlsym(handle, name) else {
        return nil
      }
      return symbol.assumingMemoryBound(to: cmark_node_type.self).pointee
    }

    let handle = dlopen(nil, RTLD_LAZY)

    CMARK_NODE_TABLE = findNodeType("CMARK_NODE_TABLE", in: handle) ?? CMARK_NODE_NONE
    CMARK_NODE_TABLE_ROW = findNodeType("CMARK_NODE_TABLE_ROW", in: handle) ?? CMARK_NODE_NONE
    CMARK_NODE_TABLE_CELL =
      findNodeType("CMARK_NODE_TABLE_CELL", in: handle) ?? CMARK_NODE_NONE
    CMARK_NODE_STRIKETHROUGH =
      findNodeType("CMARK_NODE_STRIKETHROUGH", in: handle) ?? CMARK_NODE_NONE

    dlclose(handle)
  }
}
