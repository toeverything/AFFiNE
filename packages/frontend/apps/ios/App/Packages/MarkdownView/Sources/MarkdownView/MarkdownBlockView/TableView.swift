//
//  TableView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import UIKit

class TableView: BlockView {
  var manifest: Manifest { _manifest as! Manifest }
  var childrenViews: [TextLabel] = []
  let scrollView = UIScrollView()
  let gridView = GridView()

  override func viewDidLoad() {
    super.viewDidLoad()
    scrollView.isScrollEnabled = true
    scrollView.contentInset = .zero
    scrollView.showsVerticalScrollIndicator = false
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.alwaysBounceVertical = false
    scrollView.alwaysBounceHorizontal = false
    scrollView.clipsToBounds = true
    scrollView.backgroundColor = .clear
    addSubview(scrollView)
    scrollView.addSubview(gridView)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    scrollView.frame = bounds

    let flatCells = manifest.cells.flatMap(\.self)
    for (index, view) in childrenViews.enumerated() {
      view.frame = flatCells[index].contentRect
    }
    gridView.frame = .init(
      x: 0,
      y: 0,
      width: scrollView.contentSize.width,
      height: scrollView.contentSize.height
    )

    scrollView.contentSize = manifest.contentSize
  }

  override func viewDidUpdate() {
    super.viewDidUpdate()
    let currentCells = childrenViews
    let targetCells = manifest.cells.flatMap(\.self)
    for idx in 0 ..< max(currentCells.count, targetCells.count) {
      if let target = targetCells[safe: idx] {
        if let current = currentCells[safe: idx] {
          current.attributedText = target.content
          current.frame = target.rect
        } else {
          let view = TextLabel(frame: target.rect)
          view.attributedText = target.content
          scrollView.addSubview(view)
          childrenViews.append(view)
        }
      } else {
        currentCells[safe: idx]?.removeFromSuperview()
      }
    }
    gridView.lines = manifest.drawLine.map { start, end in
      .init(start: start, end: end)
    }
    scrollView.contentSize = manifest.contentSize
  }

  override func accept(_ manifest: AnyBlockManifest) -> Bool {
    manifest is Manifest
  }
}

extension TableView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var intrinsicWidth: CGFloat {
      contentSize.width
    }

    var cells: [[Cell]] = []
    var drawLine: [(CGPoint, CGPoint)] = []

    var contentSize: CGSize {
      let rect = cells.last?.last?.rect ?? .zero
      return .init(width: rect.maxX, height: rect.maxY)
    }

    required init() {}

    var block: BlockNode? = nil
    func load(block: BlockNode) {
      guard self.block != block else { return }
      dirty = true
      self.block = block
      guard case let .table(_, rawCells) = block else {
        assertionFailure()
        return
      }

      cells = rawCells.map { row in
        row.cells.map { cell in
          let content = cell.content.render(theme: theme)
          return Cell(content: content, rect: .zero)
        }
      }
    }

    func layoutIfNeeded() {
      guard dirty, size.width > 0 else { return }
      defer { dirty = false }
      let cols = cells.first?.count ?? 0
      let rows = cells.count
      drawLine.removeAll()

      guard rows > 0, cols > 0 else {
        size.height = 0
        return
      }

      // first pass calculate intrinsic width of each column to get the width
      var colWidths: [Int: CGFloat] = [:]
      var rowHeights: [Int: CGFloat] = [:]
      for col in 0 ..< cols {
        for row in 0 ..< rows {
          let cell = cells[row][col]
          colWidths[col] = max(colWidths[col] ?? 0, cell.intrinsicSize.width + 32)
          rowHeights[row] = max(rowHeights[row] ?? 0, cell.intrinsicSize.height + 16)
        }
      }

      // now calculate the rects and points
      var anchorY: CGFloat = 0
      var linePoints: [CGFloat] = [0]
      var colPoints: [CGFloat] = [0]
      for rowIdx in 0 ..< rows {
        var anchorX: CGFloat = 0
        let rowHeight = rowHeights[rowIdx] ?? 0
        linePoints.append(anchorY)
        for colIdx in 0 ..< cols { // column
          let colWidth = colWidths[colIdx] ?? 0
          if rowIdx == 0 { colPoints.append(anchorX) }
          let rect = CGRect(x: anchorX, y: anchorY, width: colWidth, height: rowHeight)
          cells[rowIdx][colIdx].rect = rect
          anchorX = rect.maxX
        }
        colPoints.append(anchorX + spacings.general)
        anchorY += rowHeight
      }
      linePoints.append(anchorY)

      for x in colPoints {
        drawLine.append((CGPoint(x: x, y: 0), CGPoint(x: x, y: linePoints.last ?? 0)))
      }

      for y in linePoints {
        drawLine.append((CGPoint(x: 0, y: y), CGPoint(x: colPoints.last ?? 0, y: y)))
      }

      size.height = contentSize.height
    }

    func determineViewType() -> BlockView.Type {
      TableView.self
    }
  }
}

extension TableView.Manifest {
  class Cell {
    let content: NSMutableAttributedString
    var rect: CGRect { didSet { updateContentRect() } }
    let intrinsicSize: CGSize
    var contentRect: CGRect
    init(
      content: NSMutableAttributedString,
      rect: CGRect = .zero
    ) {
      self.content = content
      self.rect = rect
      intrinsicSize = .init(
        width: content.measureWidth(),
        height: content.measureHeight(usingWidth: .greatestFiniteMagnitude)
      )
      contentRect = .zero
    }

    func updateContentRect() {
      contentRect = .init(
        x: rect.minX + (rect.width - intrinsicSize.width) / 2,
        y: rect.minY + (rect.height - intrinsicSize.height) / 2,
        width: intrinsicSize.width,
        height: intrinsicSize.height
      )
    }
  }
}
