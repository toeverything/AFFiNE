import QuartzCore
import UIKit

final class AffineTextPosition: UITextPosition {
  let utf16Offset: Int

  init(utf16Offset: Int) {
    self.utf16Offset = max(0, utf16Offset)
    super.init()
  }
}

final class AffineTextRange: UITextRange {
  let utf16Range: NSRange

  init(utf16Range: NSRange) {
    self.utf16Range = utf16Range
    super.init()
  }

  override var start: UITextPosition {
    AffineTextPosition(utf16Offset: utf16Range.location)
  }

  override var end: UITextPosition {
    AffineTextPosition(utf16Offset: utf16Range.location + utf16Range.length)
  }

  override var isEmpty: Bool {
    utf16Range.length == 0
  }
}

final class AffineTextSelectionRect: UITextSelectionRect {
  private let selectionRect: CGRect
  private let isStart: Bool
  private let isEnd: Bool

  init(rect: CGRect, containsStart: Bool, containsEnd: Bool) {
    self.selectionRect = rect
    self.isStart = containsStart
    self.isEnd = containsEnd
    super.init()
  }

  override var rect: CGRect {
    selectionRect
  }

  override var writingDirection: NSWritingDirection {
    .natural
  }

  override var containsStart: Bool {
    isStart
  }

  override var containsEnd: Bool {
    isEnd
  }

  override var isVertical: Bool {
    false
  }
}

private final class DisplayLinkProxy: NSObject {
  weak var target: MetalHostViewController?

  init(target: MetalHostViewController) {
    self.target = target
    super.init()
  }

  @objc func onDisplayLink(_ link: CADisplayLink) {
    target?.handleDisplayLinkTick(link)
  }
}

private func affineIosTextInputChangedTrampoline(_ changeKind: UInt8, _ userData: UnsafeMutableRawPointer?) {
  guard let userData else {
    return
  }
  let view = Unmanaged<MetalHostView>.fromOpaque(userData).takeUnretainedValue()
  view.handleEditorTextInputStateChanged(kind: changeKind)
}

private func affineIosFrameWakeTrampoline(_ userData: UnsafeMutableRawPointer?) {
  guard let userData else {
    return
  }
  let controller = Unmanaged<MetalHostViewController>.fromOpaque(userData).takeUnretainedValue()
  if Thread.isMainThread {
    controller.wakeDisplayLink()
  } else {
    DispatchQueue.main.async { [weak controller] in
      controller?.wakeDisplayLink()
    }
  }
}

private func affineIosOpenUrlTrampoline(_ urlUtf8: UnsafePointer<CChar>?, _ userData: UnsafeMutableRawPointer?) {
  guard let urlUtf8, let raw = String(validatingUTF8: urlUtf8) else {
    return
  }
  let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
  guard trimmed.hasPrefix("https://") || trimmed.hasPrefix("http://"),
        let url = URL(string: trimmed)
  else {
    return
  }
  DispatchQueue.main.async {
    UIApplication.shared.open(url, options: [:], completionHandler: nil)
  }
}

final class MetalHostView: UIView, UITextInput {
  override class var layerClass: AnyClass {
    CAMetalLayer.self
  }

  var metalLayer: CAMetalLayer {
    guard let metal = layer as? CAMetalLayer else {
      preconditionFailure("MetalHostView requires CAMetalLayer")
    }
    return metal
  }

  weak var inputDelegate: UITextInputDelegate?
  lazy var tokenizer: UITextInputTokenizer = UITextInputStringTokenizer(textInput: self)

  var hostHandle: OpaquePointer?
  var onSelectedRangeChanged: ((NSRange) -> Void)?
  var onInteractionWake: (() -> Void)?
  private(set) var lastCopiedText: String?
  private var lastWantsCodeInput: Bool = false

  private var wantsCodeInput: Bool {
    guard let handle = hostHandle else {
      return false
    }
    return affine_ios_host_wants_code_input(handle)
  }

  var autocorrectionType: UITextAutocorrectionType {
    get { wantsCodeInput ? .no : .default }
    set {}
  }

  var autocapitalizationType: UITextAutocapitalizationType {
    get { wantsCodeInput ? .none : .sentences }
    set {}
  }

  var smartQuotesType: UITextSmartQuotesType {
    get { wantsCodeInput ? .no : .default }
    set {}
  }

  var smartDashesType: UITextSmartDashesType {
    get { wantsCodeInput ? .no : .default }
    set {}
  }

  func syncCodeInputTraitsIfNeeded() {
    let next = wantsCodeInput
    if next != lastWantsCodeInput {
      lastWantsCodeInput = next
      if isFirstResponder {
        reloadInputViews()
      }
    }
  }

  private(set) var editorInputNotificationCount: Int = 0

  private var isInsideImeMutation = false
  private var pendingExternalChangeKind: UInt8 = 0
  private var activeTouchIds: [ObjectIdentifier: UInt64] = [:]
  private var touchStartPoints: [UInt64: CGPoint] = [:]
  private var touchExceededPanThreshold: Set<UInt64> = []
  private var nextTouchId: UInt64 = 1

  /// Authoritative UTF-16 code units read directly from Rust `PlatformInputHandler` (zero host copy).
  var currentAuthoritativeUtf16Units: [UInt16] {
    guard let handle = hostHandle else {
      return []
    }
    let len = affine_ios_host_utf16_len(handle)
    guard len > 0 else {
      return []
    }
    var buf = Array(repeating: UInt16(0), count: len)
    let copied = buf.withUnsafeMutableBufferPointer { ptr in
      affine_ios_host_copy_utf16(handle, ptr.baseAddress, len)
    }
    if copied < len {
      return Array(buf.prefix(copied))
    }
    return buf
  }

  private var currentAuthoritativeString: NSString {
    let units = currentAuthoritativeUtf16Units
    guard !units.isEmpty else {
      return ""
    }
    return NSString(characters: units, length: units.count)
  }

  var currentSelectedUtf16Range: NSRange {
    guard let handle = hostHandle else {
      return NSRange(location: 0, length: 0)
    }
    let r = affine_ios_host_selected_range(handle)
    return clampRange(NSRange(location: Int(r.location), length: Int(r.length)))
  }

  var currentWritingDirection: UInt8 {
    guard let handle = hostHandle else {
      return 0
    }
    return affine_ios_host_text_writing_direction(handle)
  }

  func attachTextInputObserver() {
    guard let handle = hostHandle else {
      return
    }
    let rawSelf = Unmanaged.passUnretained(self).toOpaque()
    affine_ios_host_set_text_input_callback(handle, affineIosTextInputChangedTrampoline, rawSelf)
    affine_ios_host_set_open_url_callback(handle, affineIosOpenUrlTrampoline, rawSelf)
  }

  func detachTextInputObserver() {
    guard let handle = hostHandle else {
      return
    }
    affine_ios_host_set_text_input_callback(handle, nil, nil)
    affine_ios_host_set_open_url_callback(handle, nil, nil)
  }

  /// H-S2: Editor-initiated content/selection change notifies `UITextInputDelegate` and overlay.
  func handleEditorTextInputStateChanged(kind: UInt8) {
    if isInsideImeMutation {
      pendingExternalChangeKind = max(pendingExternalChangeKind, kind)
      return
    }
    notifyInputDelegate(kind: kind)
  }

  private func notifyInputDelegate(kind: UInt8) {
    editorInputNotificationCount += 1
    if kind == 4 {
      inputDelegate?.textWillChange(self)
      inputDelegate?.selectionWillChange(self)
      inputDelegate?.selectionDidChange(self)
      inputDelegate?.textDidChange(self)
    } else {
      inputDelegate?.selectionWillChange(self)
      inputDelegate?.selectionDidChange(self)
    }
    onSelectedRangeChanged?(currentSelectedUtf16Range)
    syncCodeInputTraitsIfNeeded()
    if let handle = hostHandle,
      !affine_ios_host_wants_software_keyboard(handle),
      isFirstResponder
    {
      _ = resignFirstResponder()
    }
  }

  private var currentMarkedUtf16Range: NSRange? {
    guard let handle = hostHandle else {
      return nil
    }
    let r = affine_ios_host_marked_range(handle)
    if r.location == UInt32.max {
      return nil
    }
    return clampRange(NSRange(location: Int(r.location), length: Int(r.length)))
  }

  private func expectedUnitsReplacing(
    _ range: NSRange,
    with replacement: [UInt16],
    in before: [UInt16]
  ) -> [UInt16] {
    let lo = max(0, min(range.location, before.count))
    let hi = max(lo, min(range.location + range.length, before.count))
    var out: [UInt16] = []
    out.reserveCapacity(before.count - (hi - lo) + replacement.count)
    out.append(contentsOf: before[..<lo])
    out.append(contentsOf: replacement)
    out.append(contentsOf: before[hi...])
    return out
  }

  /// UIKit forbids calling `inputDelegate.textWillChange/textDidChange` in response to
  /// mutations initiated by the text input system itself (otherwise Pinyin/Kana IME
  /// resets composition on every keystroke). Only notify `inputDelegate` when the editor
  /// performed an unexpected extra transform (e.g. Markdown `# ` heading conversion or
  /// block split/merge).
  private func performImeMutation(
    expectedUnits: [UInt16]? = nil,
    expectedSelected: NSRange? = nil,
    expectedMarked: NSRange?? = nil,
    _ body: () -> Void
  ) {
    let wasInside = isInsideImeMutation
    isInsideImeMutation = true
    pendingExternalChangeKind = 0
    body()
    isInsideImeMutation = wasInside
    let pending = pendingExternalChangeKind
    pendingExternalChangeKind = 0
    guard !wasInside else {
      return
    }
    var diverged = expectedUnits == nil && expectedSelected == nil && expectedMarked == nil
    if let expUnits = expectedUnits, currentAuthoritativeUtf16Units != expUnits {
      diverged = true
    }
    if let expSel = expectedSelected, currentSelectedUtf16Range != expSel {
      diverged = true
    }
    if let expMarked = expectedMarked, currentMarkedUtf16Range != expMarked {
      diverged = true
    }
    if pending != 0 && diverged {
      notifyInputDelegate(kind: pending)
    } else {
      onSelectedRangeChanged?(currentSelectedUtf16Range)
      syncCodeInputTraitsIfNeeded()
    }
    onInteractionWake?()
  }

  func updateSelectedRangeFromOverlay(_ range: NSRange) {
    guard let handle = hostHandle else {
      return
    }
    let clamped = clampRange(range)
    performImeMutation {
      affine_ios_host_set_selected_range(
        handle,
        AffineUtf16Range(location: UInt32(clamped.location), length: UInt32(clamped.length))
      )
    }
  }

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(copy(_:)) || action == #selector(cut(_:)) {
      return currentSelectedUtf16Range.length > 0
    }
    if action == #selector(paste(_:)) {
      return UIPasteboard.general.hasStrings
    }
    if action == #selector(selectAll(_:)) {
      return hasText
    }
    return super.canPerformAction(action, withSender: sender)
  }

  override func copy(_ sender: Any?) {
    let clamped = currentSelectedUtf16Range
    guard clamped.length > 0 else {
      return
    }
    let copied = currentAuthoritativeString.substring(with: clamped)
    lastCopiedText = copied
    UIPasteboard.general.string = copied
  }

  override func cut(_ sender: Any?) {
    let clamped = currentSelectedUtf16Range
    guard clamped.length > 0 else {
      return
    }
    copy(sender)
    deleteBackward()
  }

  override func paste(_ sender: Any?) {
    guard let text = UIPasteboard.general.string, !text.isEmpty else {
      return
    }
    insertText(text)
  }

  override func selectAll(_ sender: Any?) {
    let len = Int(hostHandle.map { affine_ios_host_utf16_len($0) } ?? 0)
    selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: len))
  }

  override var canBecomeFirstResponder: Bool {
    true
  }

  var hasText: Bool {
    guard let handle = hostHandle else {
      return false
    }
    return affine_ios_host_utf16_len(handle) > 0
  }

  func insertText(_ text: String) {
    guard let handle = hostHandle else {
      return
    }
    let utf16 = Array(text.utf16)
    let before = currentAuthoritativeUtf16Units
    let replaceRange = currentMarkedUtf16Range ?? currentSelectedUtf16Range
    let expUnits = expectedUnitsReplacing(replaceRange, with: utf16, in: before)
    let expSel = NSRange(location: replaceRange.location + utf16.count, length: 0)
    performImeMutation(expectedUnits: expUnits, expectedSelected: expSel, expectedMarked: .some(nil)) {
      utf16.withUnsafeBufferPointer { buf in
        affine_ios_host_insert_text(handle, buf.baseAddress, buf.count)
      }
    }
  }

  func deleteBackward() {
    guard let handle = hostHandle else {
      return
    }
    let before = currentAuthoritativeUtf16Units
    let sel = currentSelectedUtf16Range
    if sel.length > 0 {
      let expUnits = expectedUnitsReplacing(sel, with: [], in: before)
      let expSel = NSRange(location: sel.location, length: 0)
      performImeMutation(expectedUnits: expUnits, expectedSelected: expSel, expectedMarked: .some(nil)) {
        affine_ios_host_delete_backward(handle)
      }
    } else if sel.location > 0 {
      let ns = NSString(characters: before, length: before.count)
      let delRange = ns.rangeOfComposedCharacterSequence(at: sel.location - 1)
      let expUnits = expectedUnitsReplacing(delRange, with: [], in: before)
      let expSel = NSRange(location: delRange.location, length: 0)
      performImeMutation(expectedUnits: expUnits, expectedSelected: expSel, expectedMarked: .some(nil)) {
        affine_ios_host_delete_backward(handle)
      }
    } else {
      performImeMutation {
        affine_ios_host_delete_backward(handle)
      }
    }
  }

  func text(in range: UITextRange) -> String? {
    guard let affineRange = range as? AffineTextRange else {
      return nil
    }
    let text = currentAuthoritativeString
    let clamped = clampRange(affineRange.utf16Range, maxLen: text.length)
    return text.substring(with: clamped)
  }

  func replace(_ range: UITextRange, withText text: String) {
    guard let affineRange = range as? AffineTextRange, let handle = hostHandle else {
      return
    }
    let clamped = clampRange(affineRange.utf16Range)
    let utf16 = Array(text.utf16)
    let before = currentAuthoritativeUtf16Units
    let expUnits = expectedUnitsReplacing(clamped, with: utf16, in: before)
    performImeMutation(expectedUnits: expUnits) {
      let cRange = AffineUtf16Range(
        location: UInt32(clamped.location),
        length: UInt32(clamped.length)
      )
      utf16.withUnsafeBufferPointer { buf in
        affine_ios_host_replace_range(handle, cRange, buf.baseAddress, buf.count)
      }
    }
  }

  var selectedTextRange: UITextRange? {
    get {
      AffineTextRange(utf16Range: currentSelectedUtf16Range)
    }
    set {
      guard let affineRange = newValue as? AffineTextRange, let handle = hostHandle else {
        return
      }
      let clamped = clampRange(affineRange.utf16Range)
      performImeMutation(expectedUnits: currentAuthoritativeUtf16Units, expectedSelected: clamped) {
        affine_ios_host_set_selected_range(
          handle,
          AffineUtf16Range(location: UInt32(clamped.location), length: UInt32(clamped.length))
        )
      }
    }
  }

  var markedTextRange: UITextRange? {
    guard let range = currentMarkedUtf16Range else {
      return nil
    }
    return AffineTextRange(utf16Range: range)
  }

  var markedTextStyle: [NSAttributedString.Key: Any]?

  func setMarkedText(_ markedText: String?, selectedRange: NSRange) {
    guard let handle = hostHandle else {
      return
    }
    let text = markedText ?? ""
    let utf16 = Array(text.utf16)
    let utf16Len = utf16.count
    let clampedLoc = max(0, min(selectedRange.location, utf16Len))
    let clampedLen = max(0, min(selectedRange.length, utf16Len - clampedLoc))
    let before = currentAuthoritativeUtf16Units
    let replaceRange = currentMarkedUtf16Range ?? currentSelectedUtf16Range
    let expUnits = expectedUnitsReplacing(replaceRange, with: utf16, in: before)
    let expSel = NSRange(location: replaceRange.location + clampedLoc, length: clampedLen)
    let expMarked: NSRange? = utf16.isEmpty
      ? nil
      : NSRange(location: replaceRange.location, length: utf16Len)
    performImeMutation(expectedUnits: expUnits, expectedSelected: expSel, expectedMarked: .some(expMarked)) {
      let cRange = AffineUtf16Range(location: UInt32(clampedLoc), length: UInt32(clampedLen))
      utf16.withUnsafeBufferPointer { buf in
        affine_ios_host_set_marked_text(handle, buf.baseAddress, buf.count, cRange)
      }
    }
  }

  func unmarkText() {
    guard let handle = hostHandle else {
      return
    }
    performImeMutation(expectedUnits: currentAuthoritativeUtf16Units, expectedMarked: .some(nil)) {
      affine_ios_host_unmark_text(handle)
    }
  }

  var beginningOfDocument: UITextPosition {
    AffineTextPosition(utf16Offset: 0)
  }

  var endOfDocument: UITextPosition {
    let len = Int(hostHandle.map { affine_ios_host_utf16_len($0) } ?? 0)
    return AffineTextPosition(utf16Offset: len)
  }

  func textRange(from fromPosition: UITextPosition, to toPosition: UITextPosition) -> UITextRange? {
    guard
      let from = fromPosition as? AffineTextPosition,
      let to = toPosition as? AffineTextPosition
    else {
      return nil
    }
    let start = min(from.utf16Offset, to.utf16Offset)
    let end = max(from.utf16Offset, to.utf16Offset)
    return AffineTextRange(utf16Range: clampRange(NSRange(location: start, length: end - start)))
  }

  func position(from position: UITextPosition, offset: Int) -> UITextPosition? {
    guard let pos = position as? AffineTextPosition else {
      return nil
    }
    let maxLen = Int(hostHandle.map { affine_ios_host_utf16_len($0) } ?? 0)
    let next = pos.utf16Offset + offset
    guard next >= 0 && next <= maxLen else {
      return nil
    }
    return AffineTextPosition(utf16Offset: next)
  }

  func position(
    from position: UITextPosition,
    in direction: UITextLayoutDirection,
    offset: Int
  ) -> UITextPosition? {
    let signedOffset = (direction == .left || direction == .up) ? -offset : offset
    return self.position(from: position, offset: signedOffset)
  }

  func compare(_ position: UITextPosition, to other: UITextPosition) -> ComparisonResult {
    guard
      let lhs = position as? AffineTextPosition,
      let rhs = other as? AffineTextPosition
    else {
      return .orderedSame
    }
    if lhs.utf16Offset < rhs.utf16Offset {
      return .orderedAscending
    }
    if lhs.utf16Offset > rhs.utf16Offset {
      return .orderedDescending
    }
    return .orderedSame
  }

  func offset(from: UITextPosition, to toPosition: UITextPosition) -> Int {
    guard
      let start = from as? AffineTextPosition,
      let end = toPosition as? AffineTextPosition
    else {
      return 0
    }
    return end.utf16Offset - start.utf16Offset
  }

  func position(
    within range: UITextRange,
    farthestIn direction: UITextLayoutDirection
  ) -> UITextPosition? {
    guard let affineRange = range as? AffineTextRange else {
      return nil
    }
    switch direction {
    case .left, .up:
      return affineRange.start
    case .right, .down:
      return affineRange.end
    @unknown default:
      return affineRange.start
    }
  }

  func characterRange(
    byExtending position: UITextPosition,
    in direction: UITextLayoutDirection
  ) -> UITextRange? {
    guard let pos = position as? AffineTextPosition else {
      return nil
    }
    let maxLen = Int(hostHandle.map { affine_ios_host_utf16_len($0) } ?? 0)
    switch direction {
    case .left, .up:
      return AffineTextRange(
        utf16Range: clampRange(NSRange(location: 0, length: pos.utf16Offset), maxLen: maxLen)
      )
    case .right, .down:
      return AffineTextRange(
        utf16Range: clampRange(
          NSRange(location: pos.utf16Offset, length: max(0, maxLen - pos.utf16Offset)),
          maxLen: maxLen
        )
      )
    @unknown default:
      return nil
    }
  }

  func baseWritingDirection(
    for position: UITextPosition,
    in direction: UITextStorageDirection
  ) -> NSWritingDirection {
    currentWritingDirection == 1 ? .rightToLeft : .leftToRight
  }

  func setBaseWritingDirection(_ writingDirection: NSWritingDirection, for range: UITextRange) {}

  func firstRect(for range: UITextRange) -> CGRect {
    guard let affineRange = range as? AffineTextRange else {
      return .zero
    }
    let clamped = clampRange(affineRange.utf16Range)
    let startRect = caretRect(for: AffineTextPosition(utf16Offset: clamped.location))
    if clamped.length == 0 {
      return startRect
    }
    let endRect = caretRect(for: AffineTextPosition(utf16Offset: clamped.location + clamped.length))
    if abs(startRect.minY - endRect.minY) < 1.0 {
      return CGRect(
        x: min(startRect.minX, endRect.minX),
        y: startRect.minY,
        width: max(2.0, abs(endRect.maxX - startRect.minX)),
        height: startRect.height
      )
    }
    return startRect
  }

  func caretRect(for position: UITextPosition) -> CGRect {
    guard
      let pos = position as? AffineTextPosition,
      let handle = hostHandle
    else {
      return .zero
    }
    let cRect = affine_ios_host_text_caret_rect(handle, UInt32(max(0, pos.utf16Offset)))
    return CGRect(
      x: CGFloat(cRect.x),
      y: CGFloat(cRect.y),
      width: CGFloat(cRect.width),
      height: CGFloat(cRect.height)
    )
  }

  func selectionRects(for range: UITextRange) -> [UITextSelectionRect] {
    guard
      let affineRange = range as? AffineTextRange,
      let handle = hostHandle
    else {
      return []
    }
    let clamped = clampRange(affineRange.utf16Range)
    guard clamped.length > 0 else {
      return []
    }
    let cRange = AffineUtf16Range(location: UInt32(clamped.location), length: UInt32(clamped.length))
    let count = affine_ios_host_text_selection_rects(handle, cRange, nil, 0)
    guard count > 0 else {
      return []
    }
    var rawRects = Array(repeating: AffineSelectionRect(), count: count)
    _ = rawRects.withUnsafeMutableBufferPointer { buf in
      affine_ios_host_text_selection_rects(handle, cRange, buf.baseAddress, count)
    }
    return rawRects.map { item in
      AffineTextSelectionRect(
        rect: CGRect(
          x: CGFloat(item.rect.x),
          y: CGFloat(item.rect.y),
          width: CGFloat(item.rect.width),
          height: CGFloat(item.rect.height)
        ),
        containsStart: item.contains_start,
        containsEnd: item.contains_end
      )
    }
  }

  func closestPosition(to point: CGPoint) -> UITextPosition? {
    guard let handle = hostHandle else {
      return AffineTextPosition(utf16Offset: 0)
    }
    let offset = affine_ios_host_text_closest_offset(
      handle,
      AffinePoint(x: Float(point.x), y: Float(point.y))
    )
    return AffineTextPosition(utf16Offset: Int(offset))
  }

  func closestPosition(to point: CGPoint, within range: UITextRange) -> UITextPosition? {
    guard let affineRange = range as? AffineTextRange else {
      return closestPosition(to: point)
    }
    let clamped = clampRange(affineRange.utf16Range)
    guard let pos = closestPosition(to: point) as? AffineTextPosition else {
      return affineRange.end
    }
    let bounded = max(clamped.location, min(pos.utf16Offset, clamped.location + clamped.length))
    return AffineTextPosition(utf16Offset: bounded)
  }

  func characterRange(at point: CGPoint) -> UITextRange? {
    guard let pos = closestPosition(to: point) as? AffineTextPosition else {
      return nil
    }
    let text = currentAuthoritativeString
    let len = text.length
    guard len > 0 else {
      return AffineTextRange(utf16Range: NSRange(location: 0, length: 0))
    }
    let idx = min(pos.utf16Offset, len - 1)
    let cluster = text.rangeOfComposedCharacterSequence(at: idx)
    return AffineTextRange(utf16Range: cluster)
  }

  // MARK: - UIKit Touch & Hardware Keyboard Forwarding

  private func touchId(for touch: UITouch, remove: Bool) -> UInt64 {
    let key = ObjectIdentifier(touch)
    if let existing = activeTouchIds[key] {
      if remove {
        activeTouchIds.removeValue(forKey: key)
      }
      return existing
    }
    let assigned = nextTouchId
    nextTouchId &+= 1
    if !remove {
      activeTouchIds[key] = assigned
    }
    return assigned
  }

  private static let topBarHeightPt: CGFloat = 53.0
  private static let panSlopPt: CGFloat = 10.0

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let handle = hostHandle else { return }
    for touch in touches {
      let loc = touch.location(in: self)
      let id = touchId(for: touch, remove: false)
      touchStartPoints[id] = loc
      touchExceededPanThreshold.remove(id)
      affine_ios_host_touch_event(handle, id, 0, Float(loc.x), Float(loc.y))
    }
    onInteractionWake?()
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let handle = hostHandle else { return }
    for touch in touches {
      let loc = touch.location(in: self)
      let id = touchId(for: touch, remove: false)
      if let start = touchStartPoints[id] {
        let dx = loc.x - start.x
        let dy = loc.y - start.y
        if hypot(dx, dy) > Self.panSlopPt {
          touchExceededPanThreshold.insert(id)
        }
      }
      affine_ios_host_touch_event(handle, id, 1, Float(loc.x), Float(loc.y))
    }
    onInteractionWake?()
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let handle = hostHandle else { return }
    var endedEditableTap = false
    for touch in touches {
      let loc = touch.location(in: self)
      let id = touchId(for: touch, remove: true)
      let start = touchStartPoints.removeValue(forKey: id) ?? loc
      let wasPan = touchExceededPanThreshold.remove(id) != nil
        || hypot(loc.x - start.x, loc.y - start.y) > Self.panSlopPt
      affine_ios_host_touch_event(handle, id, 2, Float(loc.x), Float(loc.y))
      if !wasPan && start.y >= Self.topBarHeightPt && loc.y >= Self.topBarHeightPt {
        endedEditableTap = true
      }
    }
    syncCodeInputTraitsIfNeeded()
    if affine_ios_host_wants_software_keyboard(handle) {
      if endedEditableTap && !isFirstResponder {
        _ = becomeFirstResponder()
      }
    } else if isFirstResponder {
      _ = resignFirstResponder()
    }
    onInteractionWake?()
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let handle = hostHandle else { return }
    for touch in touches {
      let loc = touch.location(in: self)
      let id = touchId(for: touch, remove: true)
      touchStartPoints.removeValue(forKey: id)
      touchExceededPanThreshold.remove(id)
      affine_ios_host_touch_event(handle, id, 3, Float(loc.x), Float(loc.y))
    }
    onInteractionWake?()
  }

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    // Yield hardware keyboard navigation/edit keys to the active IME composition
    // so Pinyin/Kana candidate selection and commit are never intercepted.
    if markedTextRange != nil {
      super.pressesBegan(presses, with: event)
      return
    }
    guard let handle = hostHandle else {
      super.pressesBegan(presses, with: event)
      return
    }
    var handled = false
    for press in presses {
      guard let key = press.key else { continue }
      let mods = key.modifierFlags
      let shift = mods.contains(.shift)
      let cmd = mods.contains(.command)
      let ctrl = mods.contains(.control)
      let alt = mods.contains(.alternate)
      let mapped: String?
      switch key.keyCode {
      case .keyboardLeftArrow: mapped = "left"
      case .keyboardRightArrow: mapped = "right"
      case .keyboardUpArrow: mapped = "up"
      case .keyboardDownArrow: mapped = "down"
      case .keyboardDeleteOrBackspace: mapped = "backspace"
      case .keyboardDeleteForward: mapped = "delete"
      case .keyboardReturnOrEnter: mapped = "enter"
      case .keyboardEscape: mapped = "escape"
      case .keyboardTab: mapped = "tab"
      case .keyboardZ where cmd: mapped = "z"
      default: mapped = nil
      }
      if let name = mapped {
        name.withCString { cKey in
          affine_ios_host_key_down(handle, cKey, nil, shift, cmd, ctrl, alt)
        }
        handled = true
      }
    }
    if handled {
      onInteractionWake?()
    } else {
      super.pressesBegan(presses, with: event)
    }
  }

  private func clampRange(_ range: NSRange, maxLen: Int? = nil) -> NSRange {
    let limit = maxLen ?? Int(hostHandle.map { affine_ios_host_utf16_len($0) } ?? 0)
    let loc = max(0, min(range.location, limit))
    let len = max(0, min(range.length, limit - loc))
    return NSRange(location: loc, length: len)
  }
}

final class MetalHostViewController: UIViewController, UIEditMenuInteractionDelegate {
  private let hostView = MetalHostView()
  private let selectionOverlayView = SelectionOverlayView()
  private let keyboardAvoidanceCoordinator = KeyboardAvoidanceCoordinator()
  private let pdfRendererBridge = PdfRendererBridge()
  private let textRenderingBridge = TextRenderingBridge()
  private let hapticsBridge = HapticsBridge()
  private let bootstrapCoordinator = HostBootstrapCoordinator()
  private var editorMetalLayer: CAMetalLayer?
  private var editMenuInteraction: UIEditMenuInteraction?
  private(set) var presentedMenuAnchorRect: CGRect?
  private var lastSyncedInsets = AffineWindowInsets(
    safe_top: 0,
    safe_right: 0,
    safe_bottom: 0,
    safe_left: 0,
    ime_bottom: 0
  )
  private(set) var lastBootstrapError: Error?
  private var bootstrapCompleted = false
  private var hostHandle: OpaquePointer?
  private var displayLink: CADisplayLink?
  private var displayLinkProxy: DisplayLinkProxy?
  private var timerWakeWorkItem: DispatchWorkItem?

  var textHostView: MetalHostView {
    hostView
  }

  var selectionOverlay: SelectionOverlayView {
    selectionOverlayView
  }

  var keyboardCoordinator: KeyboardAvoidanceCoordinator {
    keyboardAvoidanceCoordinator
  }

  var haptics: HapticsBridge {
    hapticsBridge
  }

  var textRenderer: TextRenderingBridge {
    textRenderingBridge
  }

  var hostPointer: OpaquePointer? {
    hostHandle
  }

  override func loadView() {
    let root = UIView()
    root.backgroundColor = .white
    view = root
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .white
    hostView.isMultipleTouchEnabled = true
    hostView.backgroundColor = .white
    let initialFrame = view.bounds.inset(by: view.safeAreaInsets)
    let clampedInitial = CGRect(
      x: initialFrame.origin.x,
      y: initialFrame.origin.y,
      width: max(initialFrame.width, 1.0),
      height: max(initialFrame.height, 1.0)
    )
    hostView.frame = clampedInitial
    view.addSubview(hostView)

    let scale = Float(view.window?.screen.scale ?? UIScreen.main.scale)
    let rawLayer = Unmanaged.passUnretained(hostView.metalLayer).toOpaque()
    let handle = affine_ios_host_create(
      rawLayer,
      Float(max(initialFrame.width, 390.0)),
      Float(max(initialFrame.height, 844.0)),
      scale
    )
    hostHandle = handle
    hostView.hostHandle = handle
    hostView.attachTextInputObserver()

    if let handle {
      let rawSelf = Unmanaged.passUnretained(self).toOpaque()
      affine_ios_host_set_frame_wake_callback(handle, affineIosFrameWakeTrampoline, rawSelf)
      let isPad = UIDevice.current.userInterfaceIdiom == .pad
      affine_ios_host_set_form_factor(handle, isPad ? 1 : 0)
      if let rawEditorLayer = affine_ios_host_metal_layer(handle) {
        let metalLayer = Unmanaged<CAMetalLayer>.fromOpaque(rawEditorLayer).takeUnretainedValue()
        metalLayer.frame = hostView.bounds
        metalLayer.contentsScale = CGFloat(scale)
        hostView.layer.insertSublayer(metalLayer, at: 0)
        editorMetalLayer = metalLayer
      }
    }
    applyClearColor(TextRenderingBridge.defaultClearColorRgba)

    selectionOverlayView.hostHandle = handle
    selectionOverlayView.frame = hostView.bounds
    selectionOverlayView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    hostView.addSubview(selectionOverlayView)

    let menuInteraction = UIEditMenuInteraction(delegate: self)
    hostView.addInteraction(menuInteraction)
    editMenuInteraction = menuInteraction

    hostView.onSelectedRangeChanged = { [weak self] range in
      self?.syncSelectionOverlay(for: range)
    }
    hostView.onInteractionWake = { [weak self] in
      self?.wakeDisplayLink()
    }
    selectionOverlayView.onSelectionDragResolved = { [weak self] probePoint in
      guard let self else {
        let fallback = CGRect(x: probePoint.x, y: probePoint.y, width: 2, height: 22)
        return (0, fallback, fallback)
      }
      return self.resolveSelectionDrag(at: probePoint)
    }
    selectionOverlayView.onMenuAnchorChanged = { [weak self] anchorRect in
      guard let self else {
        return
      }
      self.presentedMenuAnchorRect = anchorRect
      guard let interaction = self.editMenuInteraction else {
        return
      }
      if let rect = anchorRect,
        !rect.isNull,
        rect.origin.x.isFinite,
        rect.origin.y.isFinite,
        rect.size.width.isFinite,
        rect.size.height.isFinite,
        self.hostView.window != nil
      {
        let clampedX = min(max(rect.midX, 1.0), max(self.hostView.bounds.width - 1.0, 1.0))
        let clampedY = min(max(rect.minY, 1.0), max(self.hostView.bounds.height - 1.0, 1.0))
        let config = UIEditMenuConfiguration(
          identifier: nil,
          sourcePoint: CGPoint(x: clampedX, y: clampedY)
        )
        DispatchQueue.main.async { [weak self, weak interaction] in
          guard
            let self,
            let interaction,
            self.hostView.window != nil,
            self.presentedMenuAnchorRect == rect
          else {
            return
          }
          interaction.presentEditMenu(with: config)
        }
      } else {
        interaction.dismissMenu()
      }
    }

    keyboardAvoidanceCoordinator.hostView = hostView
    keyboardAvoidanceCoordinator.hostHandle = handle
    keyboardAvoidanceCoordinator.startObserving()

    if let handle {
      textRenderingBridge.attach(to: handle)
      pdfRendererBridge.attach(to: handle)
      hapticsBridge.attach(to: handle)
      hapticsBridge.prepareAll()
    }
    observeNotifications()
    startDisplayLink()
    retryBootstrapIfNeeded()
  }

  /// Run or retry legacy `capacitor://localhost` bootstrap, retaining any error for recovery UI.
  @MainActor
  func retryBootstrapIfNeeded() {
    guard !bootstrapCompleted else {
      return
    }
    Task { @MainActor [weak self] in
      guard let self else {
        return
      }
      do {
        _ = try await self.bootstrapCoordinator.bootstrapFromLegacyStorage()
        self.lastBootstrapError = nil
        self.bootstrapCompleted = true
      } catch {
        self.lastBootstrapError = error
      }
    }
  }

  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange()
    updateEditorMetalLayout()
    sampleInsets(timestamp: CACurrentMediaTime())
    wakeDisplayLink()
  }

  private func updateEditorMetalLayout() {
    let scale = view.window?.screen.scale ?? UIScreen.main.scale
    let editorFrame = view.bounds.inset(by: view.safeAreaInsets)
    let clampedWidth = max(editorFrame.width, 1.0)
    let clampedHeight = max(editorFrame.height, 1.0)
    let clampedFrame = CGRect(
      x: editorFrame.origin.x,
      y: editorFrame.origin.y,
      width: clampedWidth,
      height: clampedHeight
    )
    hostView.frame = clampedFrame
    hostView.metalLayer.contentsScale = scale
    hostView.metalLayer.drawableSize = CGSize(
      width: clampedWidth * scale,
      height: clampedHeight * scale
    )
    if let editorLayer = editorMetalLayer {
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      editorLayer.frame = hostView.bounds
      editorLayer.contentsScale = scale
      CATransaction.commit()
    }
    selectionOverlayView.frame = hostView.bounds
    if let handle = hostHandle {
      affine_ios_host_resize(
        handle,
        Float(clampedWidth),
        Float(clampedHeight),
        Float(scale)
      )
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    updateEditorMetalLayout()
    sampleInsets(timestamp: CACurrentMediaTime())
    wakeDisplayLink()
    let currentRange = hostView.currentSelectedUtf16Range
    if currentRange.length > 0 {
      syncSelectionOverlay(for: currentRange)
    } else {
      selectionOverlayView.refreshFromHost()
    }
  }

  deinit {
    timerWakeWorkItem?.cancel()
    timerWakeWorkItem = nil
    displayLink?.invalidate()
    keyboardAvoidanceCoordinator.stopObserving()
    keyboardAvoidanceCoordinator.hostHandle = nil
    NotificationCenter.default.removeObserver(self)
    hostView.detachTextInputObserver()
    hostView.hostHandle = nil
    selectionOverlayView.hostHandle = nil
    editorMetalLayer?.removeFromSuperlayer()
    editorMetalLayer = nil
    if let handle = hostHandle {
      affine_ios_host_set_frame_wake_callback(handle, nil, nil)
      textRenderingBridge.detach()
      pdfRendererBridge.detach(from: handle)
      hapticsBridge.detach(from: handle)
      affine_ios_host_destroy(handle)
      hostHandle = nil
    }
  }

  private func applyClearColor(_ rgba: UInt32) {
    let bg = textRenderingBridge.applyClearColorRgba(rgba)
    if view.backgroundColor != bg {
      view.backgroundColor = bg
    }
    if hostView.backgroundColor != bg {
      hostView.backgroundColor = bg
    }
  }

  private func syncSelectionOverlay(for range: NSRange) {
    guard let handle = hostHandle, selectionOverlayView.currentState.active_drag_handle == 0 else {
      return
    }
    let cRange = AffineUtf16Range(location: UInt32(range.location), length: UInt32(range.length))
    var cStart = AffineRect()
    var cEnd = AffineRect()
    if !affine_ios_host_text_selection_endpoint_carets(handle, cRange, &cStart, &cEnd) {
      let startRect = hostView.caretRect(for: AffineTextPosition(utf16Offset: range.location))
      let endRect = hostView.caretRect(
        for: AffineTextPosition(utf16Offset: range.location + range.length)
      )
      cStart = AffineRect(
        x: Float(startRect.origin.x),
        y: Float(startRect.origin.y),
        width: Float(max(startRect.size.width, 2.0)),
        height: Float(max(startRect.size.height, 22.0))
      )
      cEnd = AffineRect(
        x: Float(endRect.origin.x),
        y: Float(endRect.origin.y),
        width: Float(max(endRect.size.width, 2.0)),
        height: Float(max(endRect.size.height, 22.0))
      )
    }
    let state = affine_ios_host_selection_set(
      handle,
      cStart,
      cEnd,
      cRange,
      hostView.currentWritingDirection
    )
    selectionOverlayView.applyOverlayState(state)
  }

  func editMenuInteraction(
    _ interaction: UIEditMenuInteraction,
    targetRectFor configuration: UIEditMenuConfiguration
  ) -> CGRect {
    guard
      let rect = presentedMenuAnchorRect,
      !rect.isNull,
      rect.origin.x.isFinite,
      rect.origin.y.isFinite,
      rect.size.width.isFinite,
      rect.size.height.isFinite
    else {
      return CGRect(
        x: max(hostView.bounds.midX, 1.0),
        y: max(hostView.bounds.midY, 1.0),
        width: 1.0,
        height: 1.0
      )
    }
    return CGRect(
      x: min(max(rect.origin.x, 0.0), max(hostView.bounds.width - 1.0, 0.0)),
      y: min(max(rect.origin.y, 0.0), max(hostView.bounds.height - 1.0, 0.0)),
      width: max(rect.size.width, 1.0),
      height: max(rect.size.height, 1.0)
    )
  }

  func editMenuInteraction(
    _ interaction: UIEditMenuInteraction,
    menuFor configuration: UIEditMenuConfiguration,
    suggestedActions: [UIMenuElement]
  ) -> UIMenu? {
    var actions: [UIAction] = []
    let hasSelection = hostView.currentSelectedUtf16Range.length > 0
    if hasSelection {
      actions.append(
        UIAction(title: "Cut") { [weak self] _ in
          self?.hostView.cut(nil)
        }
      )
      actions.append(
        UIAction(title: "Copy") { [weak self] _ in
          self?.hostView.copy(nil)
        }
      )
    }
    if UIPasteboard.general.hasStrings {
      actions.append(
        UIAction(title: "Paste") { [weak self] _ in
          self?.hostView.paste(nil)
        }
      )
    }
    if hostView.hasText {
      actions.append(
        UIAction(title: "Select All") { [weak self] _ in
          self?.hostView.selectAll(nil)
        }
      )
    }
    guard !actions.isEmpty else {
      return nil
    }
    return UIMenu(children: actions)
  }

  private func resolveSelectionDrag(
    at probePoint: CGPoint
  ) -> (targetOffset: UInt32, startCaret: CGRect, endCaret: CGRect) {
    let fallback = CGRect(x: probePoint.x - 1.0, y: probePoint.y - 11.0, width: 2.0, height: 22.0)
    guard let handle = hostHandle else {
      return (0, fallback, fallback)
    }
    let previousRange = selectionOverlayView.currentState.range
    let rawAnchor = affine_ios_host_selection_drag_anchor(handle)
    let anchor: UInt32
    if rawAnchor != UInt32.max {
      anchor = rawAnchor
    } else if selectionOverlayView.currentState.active_drag_handle == 1 {
      anchor = previousRange.location + previousRange.length
    } else {
      anchor = previousRange.location
    }

    let activeCurrentOffset: UInt32 =
      selectionOverlayView.currentState.active_drag_handle == 1
        ? previousRange.location
        : (previousRange.location + previousRange.length)
    let targetOffset = affine_ios_host_text_closest_offset_preferred(
      handle,
      AffinePoint(x: Float(probePoint.x), y: Float(probePoint.y)),
      activeCurrentOffset
    )
    let newStart = min(anchor, targetOffset)
    let newEnd = max(anchor, targetOffset)
    let nextRange = AffineUtf16Range(location: newStart, length: newEnd - newStart)
    if nextRange.location != previousRange.location || nextRange.length != previousRange.length {
      hostView.updateSelectedRangeFromOverlay(
        NSRange(location: Int(nextRange.location), length: Int(nextRange.length))
      )
      _ = affine_ios_host_trigger_haptic(handle, AffineHapticPatternSwift.selectionChanged.rawValue)
    }
    var cStart = AffineRect()
    var cEnd = AffineRect()
    if affine_ios_host_text_selection_endpoint_carets(handle, nextRange, &cStart, &cEnd) {
      let startCaret = CGRect(
        x: CGFloat(cStart.x),
        y: CGFloat(cStart.y),
        width: CGFloat(cStart.width),
        height: CGFloat(cStart.height)
      )
      let endCaret = CGRect(
        x: CGFloat(cEnd.x),
        y: CGFloat(cEnd.y),
        width: CGFloat(cEnd.width),
        height: CGFloat(cEnd.height)
      )
      return (targetOffset, startCaret, endCaret)
    }
    let startCaret = hostView.caretRect(for: AffineTextPosition(utf16Offset: Int(newStart)))
    let endCaret = hostView.caretRect(for: AffineTextPosition(utf16Offset: Int(newEnd)))
    return (targetOffset, startCaret, endCaret)
  }

  private func startDisplayLink() {
    let proxy = DisplayLinkProxy(target: self)
    displayLinkProxy = proxy
    let link = CADisplayLink(target: proxy, selector: #selector(DisplayLinkProxy.onDisplayLink(_:)))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  func wakeDisplayLink() {
    timerWakeWorkItem?.cancel()
    timerWakeWorkItem = nil
    displayLink?.isPaused = false
  }

  private func pauseDisplayLinkUntilNextTimer(handle: OpaquePointer) {
    let nextDelayMs = affine_ios_host_next_timer_delay_ms(handle)
    if affine_ios_host_is_dirty(handle) {
      displayLink?.isPaused = false
      return
    }
    displayLink?.isPaused = true
    timerWakeWorkItem?.cancel()
    timerWakeWorkItem = nil
    if nextDelayMs >= 0 {
      let delayMs = max(16, Int(min(nextDelayMs, Int64(Int.max))))
      let work = DispatchWorkItem { [weak self] in
        guard let self, let h = self.hostHandle else { return }
        _ = affine_ios_host_next_timer_delay_ms(h)
        if affine_ios_host_is_dirty(h) {
          self.displayLink?.isPaused = false
        } else {
          self.pauseDisplayLinkUntilNextTimer(handle: h)
        }
      }
      timerWakeWorkItem = work
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(delayMs), execute: work)
    }
  }

  func handleDisplayLinkTick(_ link: CADisplayLink) {
    sampleInsets(timestamp: link.timestamp)
    guard let handle = hostHandle else {
      displayLink?.isPaused = true
      return
    }
    if affine_ios_host_is_dirty(handle) {
      let clearRgba = affine_ios_host_render_frame(handle, link.timestamp)
      if clearRgba != 0 {
        applyClearColor(clearRgba)
      }
    }
    if !affine_ios_host_is_dirty(handle) {
      pauseDisplayLinkUntilNextTimer(handle: handle)
    }
  }

  private func observeNotifications() {
    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(handleDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleWillEnterForeground),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleKeyboardNotification),
      name: UIResponder.keyboardWillChangeFrameNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleKeyboardNotification),
      name: UIResponder.keyboardWillHideNotification,
      object: nil
    )
  }

  @objc private func handleKeyboardNotification() {
    sampleInsets(timestamp: CACurrentMediaTime())
    wakeDisplayLink()
  }

  @objc private func handleDidEnterBackground() {
    timerWakeWorkItem?.cancel()
    timerWakeWorkItem = nil
    displayLink?.isPaused = true
    bootstrapCoordinator.checkpointAllPassive()
  }

  @objc private func handleWillEnterForeground() {
    if let handle = hostHandle {
      affine_ios_host_request_frame(handle)
    }
    wakeDisplayLink()
  }

  func sampleInsets(timestamp: Double) {
    let next = keyboardAvoidanceCoordinator.sampleDisplayLinkFrame(
      timestamp: timestamp,
      safeAreaInsets: view.safeAreaInsets
    )
    let changed = next.safe_top != lastSyncedInsets.safe_top
      || next.safe_right != lastSyncedInsets.safe_right
      || next.safe_bottom != lastSyncedInsets.safe_bottom
      || next.safe_left != lastSyncedInsets.safe_left
      || next.ime_bottom != lastSyncedInsets.ime_bottom
    if changed {
      lastSyncedInsets = next
      wakeDisplayLink()
      let currentRange = hostView.currentSelectedUtf16Range
      if currentRange.length > 0 {
        syncSelectionOverlay(for: currentRange)
      } else if let handle = hostHandle,
        selectionOverlayView.currentState.has_selection
          || selectionOverlayView.lastMenuAnchorRect != nil
      {
        selectionOverlayView.applyOverlayState(affine_ios_host_selection_state(handle))
      }
    }
  }
}
