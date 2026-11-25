import CoreGraphics
import CoreText
import UIKit

/// Native CoreText `CTTypesetter`/`CTLine`/`CTRun` text geometry, BiDi glyph-slot
/// selection rects, affinity-aware endpoint carets, whole-line `CTLineDraw` preview,
/// and Retina anti-aliased loupe rasterizer.
final class TextRenderingBridge {
  static let contentInsetPt: CGFloat = 16.0
  static let lineHeightPt: CGFloat = 22.0
  static let defaultClearColorRgba: UInt32 = 0xFAFA_FCFF

  let font = UIFont.systemFont(ofSize: 17, weight: .regular)
  private var isDarkCanvas = false
  private var canvasBackgroundColor = UIColor(
    red: 250.0 / 255.0,
    green: 250.0 / 255.0,
    blue: 252.0 / 255.0,
    alpha: 1.0
  )
  private var textColor = UIColor(white: 0.1, alpha: 1.0)
  private var selectionColor = UIColor(red: 0.808, green: 0.910, blue: 1.0, alpha: 1.0)
  private let caretColor = UIColor(red: 0.118, green: 0.588, blue: 0.922, alpha: 1.0)

  private struct LayoutKey: Equatable {
    let utf16Units: [UInt16]
    let viewportWidthBits: UInt32
    let safeLeftBits: UInt32
    let safeTopBits: UInt32
    let safeRightBits: UInt32
    let isDarkCanvas: Bool
  }

  struct ShapedVisualLine {
    let ctLine: CTLine
    let paragraphStart: Int
    let start: Int
    let end: Int
    let isSoftWrapped: Bool
    let writingDirection: NSWritingDirection
    let originX: CGFloat
    let topY: CGFloat
    let width: CGFloat
    let height: CGFloat
    let ascent: CGFloat
    let descent: CGFloat
  }

  private struct GlyphSlot {
    let docStart: Int
    let docEnd: Int
    let xLeft: CGFloat
    let xRight: CGFloat
    let isRtl: Bool
    let topY: CGFloat
    let height: CGFloat
  }

  private struct CachedLayout {
    let key: LayoutKey
    let nsText: NSString
    let originX: CGFloat
    let originY: CGFloat
    let maxWidth: CGFloat
    let lines: [ShapedVisualLine]
  }

  private var cachedLayout: CachedLayout?
  private var attachedHost: OpaquePointer?

  /// Adapt text & selection colors to the host's current clear color and return its `UIColor`.
  @discardableResult
  func applyClearColorRgba(_ rgba: UInt32) -> UIColor {
    let r = CGFloat((rgba >> 24) & 0xFF) / 255.0
    let g = CGFloat((rgba >> 16) & 0xFF) / 255.0
    let b = CGFloat((rgba >> 8) & 0xFF) / 255.0
    let a = CGFloat(rgba & 0xFF) / 255.0
    let bg = UIColor(red: r, green: g, blue: b, alpha: a)
    canvasBackgroundColor = bg
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    let dark = luma < 0.35
    if dark != isDarkCanvas {
      isDarkCanvas = dark
      if dark {
        textColor = UIColor(red: 242.0 / 255.0, green: 242.0 / 255.0, blue: 245.0 / 255.0, alpha: 1.0)
        selectionColor = UIColor(red: 0.118, green: 0.588, blue: 0.922, alpha: 0.35)
      } else {
        textColor = UIColor(white: 0.1, alpha: 1.0)
        selectionColor = UIColor(red: 0.808, green: 0.910, blue: 1.0, alpha: 1.0)
      }
      cachedLayout = nil
    }
    return bg
  }

  func attach(to host: OpaquePointer) {
    detach()
    attachedHost = host
    let provider = AffineTextProvider(
      caret_rect: affineTextCaretRectTrampoline,
      closest_offset: affineTextClosestOffsetTrampoline,
      selection_rects: affineTextSelectionRectsTrampoline,
      selection_endpoint_carets: affineTextSelectionEndpointCaretsTrampoline,
      render_loupe_rgba8: affineTextRenderLoupeRgba8Trampoline,
      user_data: Unmanaged.passUnretained(self).toOpaque()
    )
    affine_ios_host_set_text_provider(host, provider)
  }

  func detach() {
    guard let host = attachedHost else {
      return
    }
    let empty = AffineTextProvider(
      caret_rect: nil,
      closest_offset: nil,
      selection_rects: nil,
      selection_endpoint_carets: nil,
      render_loupe_rgba8: nil,
      user_data: nil
    )
    affine_ios_host_set_text_provider(host, empty)
    attachedHost = nil
    cachedLayout = nil
  }

  deinit {
    detach()
  }

  private func utf16ArrayFrom(_ ptr: UnsafePointer<UInt16>?, _ len: Int) -> [UInt16] {
    guard let ptr, len > 0 else { return [] }
    return Array(UnsafeBufferPointer(start: ptr, count: len))
  }

  private func layoutFor(
    utf16Units: [UInt16],
    viewportWidth: Float,
    insets: AffineWindowInsets
  ) -> CachedLayout {
    let key = LayoutKey(
      utf16Units: utf16Units,
      viewportWidthBits: viewportWidth.bitPattern,
      safeLeftBits: insets.safe_left.bitPattern,
      safeTopBits: insets.safe_top.bitPattern,
      safeRightBits: insets.safe_right.bitPattern,
      isDarkCanvas: isDarkCanvas
    )
    if let existing = cachedLayout, existing.key == key {
      return existing
    }

    let safeLeft = CGFloat(max(0.0, insets.safe_left.isFinite ? insets.safe_left : 0.0))
    let safeTop = CGFloat(max(0.0, insets.safe_top.isFinite ? insets.safe_top : 0.0))
    let safeRight = CGFloat(max(0.0, insets.safe_right.isFinite ? insets.safe_right : 0.0))
    let vw = CGFloat(max(0.0, viewportWidth.isFinite ? viewportWidth : 0.0))
    let originX = safeLeft + Self.contentInsetPt
    let originY = safeTop + Self.contentInsetPt
    let maxWidth = max(40.0, vw - originX - (safeRight + Self.contentInsetPt))

    let nsText: NSString = utf16Units.isEmpty
      ? ""
      : NSString(characters: utf16Units, length: utf16Units.count)
    let totalLen = nsText.length
    var lines: [ShapedVisualLine] = []
    var lineIndex = 0

    func emitEmptyLine(at docOffset: Int, dir: NSWritingDirection) {
      let emptyAttr = NSAttributedString(string: "", attributes: [.font: font])
      let ctLine = CTLineCreateWithAttributedString(emptyAttr)
      let x = dir == .rightToLeft ? (originX + maxWidth) : originX
      lines.append(
        ShapedVisualLine(
          ctLine: ctLine,
          paragraphStart: docOffset,
          start: docOffset,
          end: docOffset,
          isSoftWrapped: false,
          writingDirection: dir,
          originX: x,
          topY: originY + CGFloat(lineIndex) * Self.lineHeightPt,
          width: 0.0,
          height: Self.lineHeightPt,
          ascent: font.ascender,
          descent: abs(font.descender)
        )
      )
      lineIndex += 1
    }

    var paraStart = 0
    while paraStart <= totalLen {
      var paraEnd = paraStart
      while paraEnd < totalLen && nsText.character(at: paraEnd) != 0x000A {
        paraEnd += 1
      }
      let paraLen = paraEnd - paraStart
      let paraRange = NSRange(location: paraStart, length: paraLen)
      let paraStr = paraLen > 0 ? nsText.substring(with: paraRange) : ""
      let dir = detectBaseWritingDirection(paraStr)

      if paraLen == 0 {
        emitEmptyLine(at: paraStart, dir: dir)
      } else {
        let paraStyle = NSMutableParagraphStyle()
        paraStyle.baseWritingDirection = dir
        paraStyle.alignment = (dir == .rightToLeft) ? .right : .left
        let attrStr = NSAttributedString(
          string: paraStr,
          attributes: [
            .font: font,
            .foregroundColor: textColor,
            .paragraphStyle: paraStyle,
          ]
        )
        let typesetter = CTTypesetterCreateWithAttributedString(attrStr)
        var localStart = 0
        while localStart < paraLen {
          var count = CTTypesetterSuggestLineBreak(typesetter, localStart, Double(maxWidth))
          if count <= 0 {
            let seq = (paraStr as NSString).rangeOfComposedCharacterSequence(at: localStart)
            count = max(1, seq.length)
          }
          let localEnd = min(paraLen, localStart + count)
          let ctLine = CTTypesetterCreateLine(
            typesetter,
            CFRange(location: localStart, length: localEnd - localStart)
          )
          var ascent: CGFloat = 0
          var descent: CGFloat = 0
          var leading: CGFloat = 0
          let lineW = CGFloat(CTLineGetTypographicBounds(ctLine, &ascent, &descent, &leading))
          let flush: CGFloat = (dir == .rightToLeft) ? 1.0 : 0.0
          let penOffset = CGFloat(CTLineGetPenOffsetForFlush(ctLine, flush, Double(maxWidth)))
          let lineOriginX = originX + max(0.0, penOffset)
          lines.append(
            ShapedVisualLine(
              ctLine: ctLine,
              paragraphStart: paraStart,
              start: paraStart + localStart,
              end: paraStart + localEnd,
              isSoftWrapped: localEnd < paraLen,
              writingDirection: dir,
              originX: lineOriginX,
              topY: originY + CGFloat(lineIndex) * Self.lineHeightPt,
              width: lineW,
              height: Self.lineHeightPt,
              ascent: ascent > 0 ? ascent : font.ascender,
              descent: descent > 0 ? descent : abs(font.descender)
            )
          )
          lineIndex += 1
          localStart = localEnd
        }
      }

      if paraEnd < totalLen && nsText.character(at: paraEnd) == 0x000A {
        paraStart = paraEnd + 1
      } else {
        break
      }
    }

    if lines.isEmpty {
      emitEmptyLine(at: 0, dir: .leftToRight)
    }

    let built = CachedLayout(
      key: key,
      nsText: nsText,
      originX: originX,
      originY: originY,
      maxWidth: maxWidth,
      lines: lines
    )
    cachedLayout = built
    return built
  }

  private func snapToGraphemeBoundary(_ nsText: NSString, offset: Int) -> Int {
    let clamped = max(0, min(offset, nsText.length))
    guard clamped > 0 && clamped < nsText.length else {
      return clamped
    }
    let seq = nsText.rangeOfComposedCharacterSequence(at: clamped)
    if clamped > seq.location && clamped < seq.location + seq.length {
      let distStart = clamped - seq.location
      let distEnd = (seq.location + seq.length) - clamped
      return distStart <= distEnd ? seq.location : (seq.location + seq.length)
    }
    return clamped
  }

  /// Extract exact visual glyph slots (`[docStart, docEnd)` -> `[xLeft, xRight]`) from `CTRun`s
  /// so BiDi direction boundaries never collapse or jump to the outer run's primary caret edge.
  private func glyphSlots(in line: ShapedVisualLine) -> [GlyphSlot] {
    let runs = CTLineGetGlyphRuns(line.ctLine) as? [CTRun] ?? []
    var slots: [GlyphSlot] = []
    for run in runs {
      let count = CTRunGetGlyphCount(run)
      guard count > 0 else { continue }
      let runRange = CTRunGetStringRange(run)
      let runEnd = runRange.location + runRange.length
      let isRtl = CTRunGetStatus(run).contains(.rightToLeft)

      var indices = Array(repeating: CFIndex(0), count: count)
      var positions = Array(repeating: CGPoint.zero, count: count)
      var advances = Array(repeating: CGSize.zero, count: count)
      CTRunGetStringIndices(run, CFRange(location: 0, length: count), &indices)
      CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
      CTRunGetAdvances(run, CFRange(location: 0, length: count), &advances)

      var uniqueSorted = Array(Set(indices)).sorted()
      if uniqueSorted.last != runEnd {
        uniqueSorted.append(runEnd)
      }
      var nextBoundaryByIndex: [CFIndex: CFIndex] = [:]
      for i in 0..<(uniqueSorted.count - 1) {
        nextBoundaryByIndex[uniqueSorted[i]] = uniqueSorted[i + 1]
      }

      for g in 0..<count {
        let gStart = indices[g]
        let gEnd = max(gStart + 1, nextBoundaryByIndex[gStart] ?? runEnd)
        let xLeft = line.originX + positions[g].x
        let xRight = xLeft + max(0.0, advances[g].width)
        let docStart = line.paragraphStart + gStart
        let docEnd = line.paragraphStart + gEnd
        let lo = min(xLeft, xRight)
        let hi = max(xLeft, xRight)
        // Merge multi-glyph clusters sharing the same `(docStart, docEnd)` (e.g. base + 0-advance combining mark).
        if let idx = slots.firstIndex(where: {
          $0.docStart == docStart && $0.docEnd == docEnd && $0.isRtl == isRtl
        }) {
          let prev = slots[idx]
          slots[idx] = GlyphSlot(
            docStart: docStart,
            docEnd: docEnd,
            xLeft: min(prev.xLeft, lo),
            xRight: max(prev.xRight, hi),
            isRtl: isRtl,
            topY: line.topY,
            height: line.height
          )
        } else {
          slots.append(
            GlyphSlot(
              docStart: docStart,
              docEnd: docEnd,
              xLeft: lo,
              xRight: hi,
              isRtl: isRtl,
              topY: line.topY,
              height: line.height
            )
          )
        }
      }
    }
    return slots
  }

  /// Slice a glyph slot's horizontal extent proportionally when a ligature/cluster is partially selected.
  private func slicedBounds(
    for slot: GlyphSlot,
    ovStart: Int,
    ovEnd: Int
  ) -> (minX: CGFloat, maxX: CGFloat) {
    let totalUnits = max(1, slot.docEnd - slot.docStart)
    if ovStart <= slot.docStart && ovEnd >= slot.docEnd {
      return (slot.xLeft, slot.xRight)
    }
    let fracStart = CGFloat(max(0, ovStart - slot.docStart)) / CGFloat(totalUnits)
    let fracEnd = CGFloat(min(totalUnits, ovEnd - slot.docStart)) / CGFloat(totalUnits)
    let span = slot.xRight - slot.xLeft
    if slot.isRtl {
      return (slot.xRight - fracEnd * span, slot.xRight - fracStart * span)
    }
    return (slot.xLeft + fracStart * span, slot.xLeft + fracEnd * span)
  }

  private func caretRectInLayout(_ layout: CachedLayout, utf16Offset: UInt32) -> AffineRect {
    let offset = snapToGraphemeBoundary(layout.nsText, offset: Int(utf16Offset))
    let targetLine = layout.lines.first { line in
      if line.isSoftWrapped {
        return offset >= line.start && offset < line.end
      }
      return offset >= line.start && offset <= line.end
    } ?? layout.lines.last!
    let localIdx = max(0, offset - targetLine.paragraphStart)
    let xOff = CTLineGetOffsetForStringIndex(targetLine.ctLine, localIdx, nil)
    return AffineRect(
      x: Float(targetLine.originX + xOff),
      y: Float(targetLine.topY),
      width: 2.0,
      height: Float(targetLine.height)
    )
  }

  private func selectionEndpointCaretsInLayout(
    _ layout: CachedLayout,
    range: AffineUtf16Range
  ) -> (start: AffineRect, end: AffineRect) {
    let selStart = snapToGraphemeBoundary(layout.nsText, offset: Int(range.location))
    let selEnd = snapToGraphemeBoundary(
      layout.nsText,
      offset: Int(range.location) + Int(range.length)
    )
    if selEnd <= selStart || layout.nsText.length == 0 {
      let c = caretRectInLayout(layout, utf16Offset: UInt32(max(0, selStart)))
      return (c, c)
    }

    var startRect: AffineRect?
    var endRect: AffineRect?
    let lastUnit = selEnd - 1

    for line in layout.lines {
      if selEnd < line.start || selStart > line.end {
        continue
      }
      let slots = glyphSlots(in: line)
      if startRect == nil && selStart >= line.start && selStart < line.end {
        if let slot = slots.first(where: { selStart >= $0.docStart && selStart < $0.docEnd }) {
          let bounds = slicedBounds(
            for: slot,
            ovStart: selStart,
            ovEnd: min(slot.docEnd, selEnd)
          )
          let edgeX = slot.isRtl ? bounds.maxX : bounds.minX
          startRect = AffineRect(
            x: Float(edgeX),
            y: Float(slot.topY),
            width: 2.0,
            height: Float(slot.height)
          )
        }
      }
      if endRect == nil && lastUnit >= line.start && lastUnit < line.end {
        if let slot = slots.last(where: { lastUnit >= $0.docStart && lastUnit < $0.docEnd }) {
          let bounds = slicedBounds(
            for: slot,
            ovStart: max(slot.docStart, selStart),
            ovEnd: selEnd
          )
          let edgeX = slot.isRtl ? bounds.minX : bounds.maxX
          endRect = AffineRect(
            x: Float(edgeX),
            y: Float(slot.topY),
            width: 2.0,
            height: Float(slot.height)
          )
        }
      }
      if startRect != nil && endRect != nil {
        break
      }
    }

    let resolvedStart = startRect ?? caretRectInLayout(layout, utf16Offset: UInt32(selStart))
    let resolvedEnd = endRect ?? caretRectInLayout(layout, utf16Offset: UInt32(selEnd))
    return (resolvedStart, resolvedEnd)
  }

  func caretRect(
    utf16Ptr: UnsafePointer<UInt16>?,
    utf16Len: Int,
    utf16Offset: UInt32,
    viewportWidth: Float,
    insets: AffineWindowInsets
  ) -> AffineRect {
    let units = utf16ArrayFrom(utf16Ptr, utf16Len)
    let layout = layoutFor(utf16Units: units, viewportWidth: viewportWidth, insets: insets)
    return caretRectInLayout(layout, utf16Offset: utf16Offset)
  }

  func selectionEndpointCarets(
    utf16Ptr: UnsafePointer<UInt16>?,
    utf16Len: Int,
    range: AffineUtf16Range,
    viewportWidth: Float,
    insets: AffineWindowInsets,
    outStart: UnsafeMutablePointer<AffineRect>?,
    outEnd: UnsafeMutablePointer<AffineRect>?
  ) -> Bool {
    guard let outStart, let outEnd else { return false }
    let units = utf16ArrayFrom(utf16Ptr, utf16Len)
    let layout = layoutFor(utf16Units: units, viewportWidth: viewportWidth, insets: insets)
    let pair = selectionEndpointCaretsInLayout(layout, range: range)
    outStart.pointee = pair.start
    outEnd.pointee = pair.end
    return true
  }

  func closestOffset(
    utf16Ptr: UnsafePointer<UInt16>?,
    utf16Len: Int,
    point: AffinePoint,
    preferredOffset: UInt32,
    viewportWidth: Float,
    insets: AffineWindowInsets
  ) -> UInt32 {
    let units = utf16ArrayFrom(utf16Ptr, utf16Len)
    guard !units.isEmpty else { return 0 }
    let layout = layoutFor(utf16Units: units, viewportWidth: viewportWidth, insets: insets)
    let px = CGFloat(point.x.isFinite ? point.x : 0.0)
    let py = CGFloat(point.y.isFinite ? point.y : 0.0)

    var targetLine = layout.lines[0]
    var bestDy = CGFloat.greatestFiniteMagnitude
    for line in layout.lines {
      let dy = abs(py - (line.topY + line.height * 0.5))
      if dy < bestDy {
        bestDy = dy
        targetLine = line
      }
    }

    // At BiDi direction-change boundaries, one visual x maps to two logical UTF-16 offsets.
    // When the drag probe sits within 2.0pt of a glyph boundary matching `preferredOffset`,
    // keep `preferredOffset` so in-place or micro-jitter drags never collapse the selection.
    if preferredOffset != UInt32.max {
      let pref = snapToGraphemeBoundary(layout.nsText, offset: Int(preferredOffset))
      let slots = glyphSlots(in: targetLine)
      let boundaryTolerance: CGFloat = 2.0
      for slot in slots {
        let leadX = slot.isRtl ? slot.xRight : slot.xLeft
        let trailX = slot.isRtl ? slot.xLeft : slot.xRight
        if slot.docStart == pref && abs(px - leadX) <= boundaryTolerance {
          return UInt32(max(0, pref))
        }
        if slot.docEnd == pref && abs(px - trailX) <= boundaryTolerance {
          return UInt32(max(0, pref))
        }
      }
    }

    let localPos = CGPoint(x: px - targetLine.originX, y: targetLine.height * 0.5)
    let rawLocalIdx = CTLineGetStringIndexForPosition(targetLine.ctLine, localPos)
    if rawLocalIdx == kCFNotFound {
      return UInt32(max(0, targetLine.start))
    }
    let docOffset = max(targetLine.start, min(targetLine.paragraphStart + rawLocalIdx, targetLine.end))
    let snapped = snapToGraphemeBoundary(layout.nsText, offset: docOffset)
    return UInt32(max(0, snapped))
  }

  private func computeSelectionRects(
    layout: CachedLayout,
    range: AffineUtf16Range
  ) -> [AffineSelectionRect] {
    guard range.length > 0 && layout.nsText.length > 0 else {
      return []
    }
    let selStart = snapToGraphemeBoundary(layout.nsText, offset: Int(range.location))
    let selEnd = snapToGraphemeBoundary(
      layout.nsText,
      offset: Int(range.location) + Int(range.length)
    )
    guard selEnd > selStart else {
      return []
    }

    var result: [AffineSelectionRect] = []
    for line in layout.lines {
      if selEnd < line.start || selStart > line.end {
        continue
      }
      let segStart = max(line.start, selStart)
      let segEnd = min(line.end, selEnd)
      let emptyHardInside =
        line.start == line.end && !line.isSoftWrapped && selStart < line.start && selEnd > line.end
      if segEnd <= segStart && !emptyHardInside {
        continue
      }

      if emptyHardInside {
        result.append(
          AffineSelectionRect(
            rect: AffineRect(
              x: Float(line.originX),
              y: Float(line.topY),
              width: 2.0,
              height: Float(line.height)
            ),
            contains_start: false,
            contains_end: false
          )
        )
        continue
      }

      let slots = glyphSlots(in: line)
      var intervals: [(minX: CGFloat, maxX: CGFloat, hasStart: Bool, hasEnd: Bool)] = []
      let lastUnit = selEnd - 1

      for slot in slots {
        let ovStart = max(slot.docStart, segStart)
        let ovEnd = min(slot.docEnd, segEnd)
        guard ovEnd > ovStart else { continue }
        let bounds = slicedBounds(for: slot, ovStart: ovStart, ovEnd: ovEnd)
        let hasStart = selStart >= ovStart && selStart < ovEnd
        let hasEnd = lastUnit >= ovStart && lastUnit < ovEnd
        intervals.append((bounds.minX, bounds.maxX, hasStart, hasEnd))
      }

      if intervals.isEmpty {
        let localStart = segStart - line.paragraphStart
        let localEnd = segEnd - line.paragraphStart
        let x0 = line.originX + CTLineGetOffsetForStringIndex(line.ctLine, localStart, nil)
        let x1 = line.originX + CTLineGetOffsetForStringIndex(line.ctLine, localEnd, nil)
        intervals.append((min(x0, x1), max(x0, x1), selStart == segStart, selEnd == segEnd))
      }

      intervals.sort { $0.minX < $1.minX }
      var merged: [(minX: CGFloat, maxX: CGFloat, hasStart: Bool, hasEnd: Bool)] = []
      for item in intervals {
        if let last = merged.last, item.minX <= last.maxX + 0.75 {
          merged[merged.count - 1] = (
            min(last.minX, item.minX),
            max(last.maxX, item.maxX),
            last.hasStart || item.hasStart,
            last.hasEnd || item.hasEnd
          )
        } else {
          merged.append(item)
        }
      }

      for seg in merged {
        result.append(
          AffineSelectionRect(
            rect: AffineRect(
              x: Float(seg.minX),
              y: Float(line.topY),
              width: Float(max(2.0, seg.maxX - seg.minX)),
              height: Float(line.height)
            ),
            contains_start: seg.hasStart,
            contains_end: seg.hasEnd
          )
        )
      }
    }
    return result
  }

  func selectionRects(
    utf16Ptr: UnsafePointer<UInt16>?,
    utf16Len: Int,
    range: AffineUtf16Range,
    viewportWidth: Float,
    insets: AffineWindowInsets,
    outRects: UnsafeMutablePointer<AffineSelectionRect>?,
    capacity: Int
  ) -> Int {
    let units = utf16ArrayFrom(utf16Ptr, utf16Len)
    let layout = layoutFor(utf16Units: units, viewportWidth: viewportWidth, insets: insets)
    let rects = computeSelectionRects(layout: layout, range: range)
    if let outRects, capacity > 0 {
      let count = min(rects.count, capacity)
      for i in 0..<count {
        outRects[i] = rects[i]
      }
    }
    return rects.count
  }

  /// Draw selection highlights and shaped CoreText lines (`CTLineDraw`) in UIKit top-left coordinates.
  func drawShapedText(
    in ctx: CGContext,
    utf16Units: [UInt16],
    selectedRange: NSRange,
    viewportWidth: Float,
    insets: AffineWindowInsets
  ) {
    guard !utf16Units.isEmpty else { return }
    let layout = layoutFor(utf16Units: utf16Units, viewportWidth: viewportWidth, insets: insets)
    drawShapedLayout(
      in: ctx,
      layout: layout,
      selectedRange: AffineUtf16Range(
        location: UInt32(max(0, selectedRange.location)),
        length: UInt32(max(0, selectedRange.length))
      )
    )
  }

  private func drawShapedLayout(
    in ctx: CGContext,
    layout: CachedLayout,
    selectedRange: AffineUtf16Range
  ) {
    if selectedRange.length > 0 {
      let rects = computeSelectionRects(layout: layout, range: selectedRange)
      ctx.setFillColor(selectionColor.cgColor)
      for item in rects {
        ctx.fill(
          CGRect(
            x: CGFloat(item.rect.x),
            y: CGFloat(item.rect.y),
            width: CGFloat(item.rect.width),
            height: CGFloat(item.rect.height)
          )
        )
      }
    }

    for line in layout.lines {
      let contentH = line.ascent + line.descent
      let baselineY = line.topY + max(0.0, (line.height - contentH) * 0.5) + line.ascent
      ctx.saveGState()
      ctx.translateBy(x: line.originX, y: baselineY)
      ctx.scaleBy(x: 1.0, y: -1.0)
      ctx.textMatrix = .identity
      ctx.textPosition = .zero
      CTLineDraw(line.ctLine, ctx)
      ctx.restoreGState()
    }
  }

  func renderLoupeRgba8(
    utf16Ptr: UnsafePointer<UInt16>?,
    utf16Len: Int,
    selectedRange: AffineUtf16Range,
    viewportWidth: Float,
    insets: AffineWindowInsets,
    focusX: Float,
    focusY: Float,
    diameterPx: UInt32,
    zoomScale: Float,
    outPtr: UnsafeMutablePointer<UInt8>?,
    outLen: Int
  ) -> Bool {
    let dim = Int(diameterPx)
    guard dim >= 16, let outPtr, outLen >= dim * dim * 4 else {
      return false
    }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo =
      CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
    guard
      let ctx = CGContext(
        data: outPtr,
        width: dim,
        height: dim,
        bitsPerComponent: 8,
        bytesPerRow: dim * 4,
        space: colorSpace,
        bitmapInfo: bitmapInfo
      )
    else {
      return false
    }

    ctx.setAllowsAntialiasing(true)
    ctx.setShouldAntialias(true)
    ctx.setAllowsFontSmoothing(true)
    ctx.setShouldSmoothFonts(true)
    ctx.interpolationQuality = .high

    ctx.setFillColor(canvasBackgroundColor.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: dim, height: dim))

    ctx.saveGState()
    ctx.translateBy(x: 0, y: CGFloat(dim))
    ctx.scaleBy(x: 1.0, y: -1.0)
    let half = CGFloat(dim) * 0.5
    let zoom = CGFloat(zoomScale)
    ctx.translateBy(x: half, y: half)
    ctx.scaleBy(x: zoom, y: zoom)
    ctx.translateBy(x: -CGFloat(focusX), y: -CGFloat(focusY))

    let units = utf16ArrayFrom(utf16Ptr, utf16Len)
    let layout = layoutFor(utf16Units: units, viewportWidth: viewportWidth, insets: insets)
    drawShapedLayout(in: ctx, layout: layout, selectedRange: selectedRange)

    // Snap the loupe caret bar to the nearest affinity-aware selection endpoint edge.
    let endpoints = selectionEndpointCaretsInLayout(layout, range: selectedRange)
    let startDist = hypot(
      CGFloat(endpoints.start.x) - CGFloat(focusX),
      CGFloat(endpoints.start.y + endpoints.start.height * 0.5) - CGFloat(focusY)
    )
    let endDist = hypot(
      CGFloat(endpoints.end.x) - CGFloat(focusX),
      CGFloat(endpoints.end.y + endpoints.end.height * 0.5) - CGFloat(focusY)
    )
    let snappedCaret = startDist <= endDist ? endpoints.start : endpoints.end
    ctx.setFillColor(caretColor.cgColor)
    ctx.fill(
      CGRect(
        x: CGFloat(snappedCaret.x) - 0.85,
        y: CGFloat(snappedCaret.y),
        width: 1.7,
        height: CGFloat(snappedCaret.height)
      )
    )
    ctx.restoreGState()
    return true
  }

  private func detectBaseWritingDirection(_ text: String) -> NSWritingDirection {
    for scalar in text.unicodeScalars {
      let v = scalar.value
      if (0x0590...0x08FF).contains(v)
        || (0xFB1D...0xFDFF).contains(v)
        || (0xFE70...0xFEFC).contains(v)
      {
        return .rightToLeft
      }
      if (0x0041...0x005A).contains(v)
        || (0x0061...0x007A).contains(v)
        || (0x00C0...0x024F).contains(v)
        || (0x0370...0x052F).contains(v)
        || (0x4E00...0x9FFF).contains(v)
      {
        return .leftToRight
      }
    }
    return .leftToRight
  }
}

/// Lightweight transparent S3 transition preview view mounted above `MetalHostView`
/// and below `SelectionOverlayView`. Removed in S4 when GPU `blocksuite-editor` attaches.
final class HostTextPreviewView: UIView {
  weak var renderer: TextRenderingBridge?
  var utf16Units: [UInt16] = [] {
    didSet {
      if oldValue != utf16Units { setNeedsDisplay() }
    }
  }
  var selectedRange = NSRange(location: 0, length: 0) {
    didSet {
      if oldValue != selectedRange { setNeedsDisplay() }
    }
  }
  var hostInsets = AffineWindowInsets(
    safe_top: 0,
    safe_right: 0,
    safe_bottom: 0,
    safe_left: 0,
    ime_bottom: 0
  ) {
    didSet { setNeedsDisplay() }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = false
  }

  override func draw(_ rect: CGRect) {
    guard
      let renderer,
      !utf16Units.isEmpty,
      let ctx = UIGraphicsGetCurrentContext()
    else {
      return
    }
    renderer.drawShapedText(
      in: ctx,
      utf16Units: utf16Units,
      selectedRange: selectedRange,
      viewportWidth: Float(bounds.width),
      insets: hostInsets
    )
  }
}

private func affineTextCaretRectTrampoline(
  utf16Ptr: UnsafePointer<UInt16>?,
  utf16Len: Int,
  utf16Offset: UInt32,
  viewportWidth: Float,
  insets: AffineWindowInsets,
  userData: UnsafeMutableRawPointer?
) -> AffineRect {
  guard let userData else { return AffineRect() }
  let bridge = Unmanaged<TextRenderingBridge>.fromOpaque(userData).takeUnretainedValue()
  return bridge.caretRect(
    utf16Ptr: utf16Ptr,
    utf16Len: utf16Len,
    utf16Offset: utf16Offset,
    viewportWidth: viewportWidth,
    insets: insets
  )
}

private func affineTextClosestOffsetTrampoline(
  utf16Ptr: UnsafePointer<UInt16>?,
  utf16Len: Int,
  point: AffinePoint,
  preferredOffset: UInt32,
  viewportWidth: Float,
  insets: AffineWindowInsets,
  userData: UnsafeMutableRawPointer?
) -> UInt32 {
  guard let userData else { return 0 }
  let bridge = Unmanaged<TextRenderingBridge>.fromOpaque(userData).takeUnretainedValue()
  return bridge.closestOffset(
    utf16Ptr: utf16Ptr,
    utf16Len: utf16Len,
    point: point,
    preferredOffset: preferredOffset,
    viewportWidth: viewportWidth,
    insets: insets
  )
}

private func affineTextSelectionRectsTrampoline(
  utf16Ptr: UnsafePointer<UInt16>?,
  utf16Len: Int,
  range: AffineUtf16Range,
  viewportWidth: Float,
  insets: AffineWindowInsets,
  outRects: UnsafeMutablePointer<AffineSelectionRect>?,
  capacity: Int,
  userData: UnsafeMutableRawPointer?
) -> Int {
  guard let userData else { return 0 }
  let bridge = Unmanaged<TextRenderingBridge>.fromOpaque(userData).takeUnretainedValue()
  return bridge.selectionRects(
    utf16Ptr: utf16Ptr,
    utf16Len: utf16Len,
    range: range,
    viewportWidth: viewportWidth,
    insets: insets,
    outRects: outRects,
    capacity: capacity
  )
}

private func affineTextSelectionEndpointCaretsTrampoline(
  utf16Ptr: UnsafePointer<UInt16>?,
  utf16Len: Int,
  range: AffineUtf16Range,
  viewportWidth: Float,
  insets: AffineWindowInsets,
  outStart: UnsafeMutablePointer<AffineRect>?,
  outEnd: UnsafeMutablePointer<AffineRect>?,
  userData: UnsafeMutableRawPointer?
) -> Bool {
  guard let userData else { return false }
  let bridge = Unmanaged<TextRenderingBridge>.fromOpaque(userData).takeUnretainedValue()
  return bridge.selectionEndpointCarets(
    utf16Ptr: utf16Ptr,
    utf16Len: utf16Len,
    range: range,
    viewportWidth: viewportWidth,
    insets: insets,
    outStart: outStart,
    outEnd: outEnd
  )
}

private func affineTextRenderLoupeRgba8Trampoline(
  utf16Ptr: UnsafePointer<UInt16>?,
  utf16Len: Int,
  selectedRange: AffineUtf16Range,
  viewportWidth: Float,
  insets: AffineWindowInsets,
  focusX: Float,
  focusY: Float,
  diameterPx: UInt32,
  zoomScale: Float,
  outPtr: UnsafeMutablePointer<UInt8>?,
  outLen: Int,
  userData: UnsafeMutableRawPointer?
) -> Bool {
  guard let userData else { return false }
  let bridge = Unmanaged<TextRenderingBridge>.fromOpaque(userData).takeUnretainedValue()
  return bridge.renderLoupeRgba8(
    utf16Ptr: utf16Ptr,
    utf16Len: utf16Len,
    selectedRange: selectedRange,
    viewportWidth: viewportWidth,
    insets: insets,
    focusX: focusX,
    focusY: focusY,
    diameterPx: diameterPx,
    zoomScale: zoomScale,
    outPtr: outPtr,
    outLen: outLen
  )
}
