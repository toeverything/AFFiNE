import QuartzCore
import UIKit
import UniformTypeIdentifiers

private let affineBlocksuiteSnapshotUti = "pro.affine.blocksuite-snapshot"
private let affineMarkdownUti = "net.daringfireball.markdown"
private let affineHasSystemPasteboardRunLoop: Bool = (Bundle.main.bundleIdentifier != nil)
private var affineHeadlessPasteboard: [String: String] = [:]

private func affineIosHasPasteboardContent() -> Bool {
  guard affineHasSystemPasteboardRunLoop else {
    return !affineHeadlessPasteboard.isEmpty
  }
  let pb = UIPasteboard.general
  if pb.hasStrings {
    return true
  }
  return pb.contains(pasteboardTypes: [
    affineBlocksuiteSnapshotUti,
    UTType.html.identifier,
    affineMarkdownUti,
    UTType.utf8PlainText.identifier,
    UTType.plainText.identifier,
  ])
}

private func affineIosWriteSystemPasteboard(_ dict: [String: String]) {
  var item: [String: Any] = [:]
  if let plain = dict["text/plain"] {
    item[UTType.utf8PlainText.identifier] = plain
    item[UTType.plainText.identifier] = plain
  }
  if let html = dict["text/html"], let htmlData = html.data(using: .utf8) {
    item[UTType.html.identifier] = htmlData
  }
  if let md = dict["text/markdown"], let mdData = md.data(using: .utf8) {
    item[affineMarkdownUti] = mdData
  }
  if let snap = dict["application/x-blocksuite-snapshot"], let snapData = snap.data(using: .utf8) {
    item[affineBlocksuiteSnapshotUti] = snapData
  }
  if !item.isEmpty {
    UIPasteboard.general.setItems([item], options: [:])
  }
}

private func affineIosClipboardWriteTrampoline(
  _ utf8Ptr: UnsafePointer<UInt8>?,
  _ utf8Len: Int,
  _ userData: UnsafeMutableRawPointer?
) {
  guard let utf8Ptr, utf8Len > 0 else { return }
  let data = Data(bytes: utf8Ptr, count: utf8Len)
  guard
    let obj = try? JSONSerialization.jsonObject(with: data, options: []),
    let dict = obj as? [String: String]
  else {
    return
  }
  let changeCount: Int
  if affineHasSystemPasteboardRunLoop {
    affineIosWriteSystemPasteboard(dict)
    changeCount = UIPasteboard.general.changeCount
  } else {
    affineHeadlessPasteboard = dict
    changeCount = 1
  }
  if let userData {
    let controller = Unmanaged<MetalHostViewController>.fromOpaque(userData).takeUnretainedValue()
    controller.recordLastWrittenClipboard(dict, changeCount: changeCount)
  }
}

private func affineIosClipboardReadTrampoline(
  _ sink: AffineClipboardReadSinkFn?,
  _ ctx: UnsafeMutableRawPointer?,
  _ userData: UnsafeMutableRawPointer?
) {
  guard let sink else { return }
  var dict: [String: String] = [:]
  if affineHasSystemPasteboardRunLoop {
    let pb = UIPasteboard.general
    if let plain = pb.string, !plain.isEmpty {
      dict["text/plain"] = plain
    }
    if let htmlData = pb.data(forPasteboardType: UTType.html.identifier),
      let html = String(data: htmlData, encoding: .utf8),
      !html.isEmpty
    {
      dict["text/html"] = html
    }
    if let mdData = pb.data(forPasteboardType: affineMarkdownUti),
      let md = String(data: mdData, encoding: .utf8),
      !md.isEmpty
    {
      dict["text/markdown"] = md
    }
    if let snapData = pb.data(forPasteboardType: affineBlocksuiteSnapshotUti),
      let snap = String(data: snapData, encoding: .utf8),
      !snap.isEmpty
    {
      dict["application/x-blocksuite-snapshot"] = snap
    }
    if dict.isEmpty, let userData {
      let controller = Unmanaged<MetalHostViewController>.fromOpaque(userData).takeUnretainedValue()
      if pb.changeCount == controller.lastWrittenPasteboardChangeCount {
        dict = controller.lastWrittenClipboard
      }
    }
  } else {
    dict = affineHeadlessPasteboard
  }
  guard
    !dict.isEmpty,
    let encoded = try? JSONSerialization.data(withJSONObject: dict, options: [])
  else {
    return
  }
  encoded.withUnsafeBytes { raw in
    if let base = raw.bindMemory(to: UInt8.self).baseAddress {
      sink(base, encoded.count, ctx)
    }
  }
}

final class AffineTextPosition: UITextPosition {
  let utf16Offset: Int
  let blockOrder: Int32
  let endpointToken: UInt64

  init(
    utf16Offset: Int,
    blockOrder: Int32 = -1,
    endpointToken: UInt64 = 0
  ) {
    self.utf16Offset = max(0, utf16Offset)
    self.blockOrder = blockOrder
    self.endpointToken = endpointToken
    super.init()
  }

  static func from(_ raw: AffineDocPosition) -> AffineTextPosition {
    AffineTextPosition(
      utf16Offset: Int(raw.utf16_offset),
      blockOrder: raw.block_order,
      endpointToken: raw.endpoint_token
    )
  }

  override func isEqual(_ object: Any?) -> Bool {
    guard let other = object as? AffineTextPosition else {
      return false
    }
    if self === other {
      return true
    }
    if endpointToken != 0 || other.endpointToken != 0 {
      return endpointToken == other.endpointToken
    }
    return blockOrder == other.blockOrder && utf16Offset == other.utf16Offset
  }

  override var hash: Int {
    var hasher = Hasher()
    if endpointToken != 0 {
      hasher.combine(1)
      hasher.combine(endpointToken)
    } else {
      hasher.combine(0)
      hasher.combine(blockOrder)
      hasher.combine(utf16Offset)
    }
    return hasher.finalize()
  }
}

final class AffineTextRange: UITextRange {
  let startPos: AffineTextPosition
  let endPos: AffineTextPosition

  var utf16Range: NSRange {
    if startPos.blockOrder == endPos.blockOrder
      || startPos.blockOrder == -1
      || endPos.blockOrder == -1
    {
      let lo = min(startPos.utf16Offset, endPos.utf16Offset)
      let hi = max(startPos.utf16Offset, endPos.utf16Offset)
      return NSRange(location: lo, length: hi - lo)
    }
    return NSRange(location: max(0, startPos.utf16Offset), length: 1)
  }

  convenience init(utf16Range: NSRange, blockOrder: Int32 = -1) {
    self.init(
      startPos: AffineTextPosition(utf16Offset: utf16Range.location, blockOrder: blockOrder),
      endPos: AffineTextPosition(
        utf16Offset: utf16Range.location + utf16Range.length,
        blockOrder: blockOrder
      )
    )
  }

  init(startPos: AffineTextPosition, endPos: AffineTextPosition) {
    self.startPos = startPos
    self.endPos = endPos
    super.init()
  }

  override var start: UITextPosition {
    startPos
  }

  override var end: UITextPosition {
    endPos
  }

  override var isEmpty: Bool {
    startPos.isEqual(endPos)
  }

  override func isEqual(_ object: Any?) -> Bool {
    guard let other = object as? AffineTextRange else {
      return false
    }
    if self === other {
      return true
    }
    return startPos.isEqual(other.startPos) && endPos.isEqual(other.endPos)
  }

  override var hash: Int {
    var hasher = Hasher()
    hasher.combine(startPos.hash)
    hasher.combine(endPos.hash)
    return hasher.finalize()
  }
}

private final class AffineDocTextTokenizer: UITextInputStringTokenizer {
  private weak var hostView: MetalHostView?

  init(hostView: MetalHostView) {
    self.hostView = hostView
    super.init(textInput: hostView)
  }

  private func enclosingTokenRange(
    for pos: AffineTextPosition,
    granularity: UITextGranularity,
    view: MetalHostView
  ) -> AffineTextRange? {
    guard pos.endpointToken != 0 else {
      return nil
    }
    switch granularity {
    case .word:
      return view.wordRange(at: pos)
    case .character:
      return view.characterUnitRange(at: pos)
    case .line:
      return view.visualLineRange(at: pos)
    case .paragraph, .sentence:
      return view.blockParagraphRange(at: pos)
    default:
      return nil
    }
  }

  override func rangeEnclosingPosition(
    _ position: UITextPosition,
    with granularity: UITextGranularity,
    inDirection direction: UITextDirection
  ) -> UITextRange? {
    if let pos = position as? AffineTextPosition,
      let view = hostView,
      let range = enclosingTokenRange(for: pos, granularity: granularity, view: view)
    {
      return range
    }
    return super.rangeEnclosingPosition(position, with: granularity, inDirection: direction)
  }

  override func isPosition(
    _ position: UITextPosition,
    atBoundary granularity: UITextGranularity,
    inDirection direction: UITextDirection
  ) -> Bool {
    if let pos = position as? AffineTextPosition,
      let view = hostView,
      let range = enclosingTokenRange(for: pos, granularity: granularity, view: view)
    {
      let backward = direction.rawValue == UITextStorageDirection.backward.rawValue
        || direction.rawValue == UITextLayoutDirection.left.rawValue
      return backward
        ? view.compare(pos, to: range.start) == .orderedSame
        : view.compare(pos, to: range.end) == .orderedSame
    }
    return super.isPosition(position, atBoundary: granularity, inDirection: direction)
  }

  override func isPosition(
    _ position: UITextPosition,
    withinTextUnit granularity: UITextGranularity,
    inDirection direction: UITextDirection
  ) -> Bool {
    if let pos = position as? AffineTextPosition,
      let view = hostView,
      enclosingTokenRange(for: pos, granularity: granularity, view: view) != nil
    {
      return true
    }
    return super.isPosition(position, withinTextUnit: granularity, inDirection: direction)
  }

  override func position(
    from position: UITextPosition,
    toBoundary granularity: UITextGranularity,
    inDirection direction: UITextDirection
  ) -> UITextPosition? {
    if let pos = position as? AffineTextPosition,
      let view = hostView,
      let range = enclosingTokenRange(for: pos, granularity: granularity, view: view)
    {
      let backward = direction.rawValue == UITextStorageDirection.backward.rawValue
        || direction.rawValue == UITextLayoutDirection.left.rawValue
      return backward ? range.startPos : range.endPos
    }
    return super.position(from: position, toBoundary: granularity, inDirection: direction)
  }
}

final class AffineTextSelectionRect: UITextSelectionRect {
  private let selectionRect: CGRect
  private let isStart: Bool
  private let isEnd: Bool
  private let dir: NSWritingDirection

  init(
    rect: CGRect,
    containsStart: Bool,
    containsEnd: Bool,
    writingDirection: NSWritingDirection = .leftToRight
  ) {
    self.selectionRect = rect
    self.isStart = containsStart
    self.isEnd = containsEnd
    self.dir = writingDirection
    super.init()
  }

  override var rect: CGRect {
    selectionRect
  }

  override var writingDirection: NSWritingDirection {
    dir
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
  lazy var tokenizer: UITextInputTokenizer = AffineDocTextTokenizer(hostView: self)

  var hostHandle: OpaquePointer?
  var onSelectedRangeChanged: ((NSRange) -> Void)?
  var onSystemSelectionApplied: (() -> Void)?
  var onInteractionWake: (() -> Void)?
  var onDismissEditMenu: (() -> Void)?
  var onFallbackCopiedText: (() -> String?)?
  var onQuerySystemGestureActive: (() -> Bool)?
  var onQueryShouldLetTextInteractionOwnTouch: ((CGPoint) -> Bool)?
  var onDidMoveToWindow: (() -> Void)?
  private(set) var lastCopiedText: String?
  private(set) var editorInputNotificationCount: Int = 0

  private let emptyInputView = UIView(frame: .zero)
  private var lastWantsSoftwareKeyboard = true
  private var lastWantsCodeInput = false
  private(set) var isInsideImeMutation = false
  private(set) var isApplyingSystemSelection = false
  private var pendingExternalChangeKind: UInt8 = 0
  private var activeTouchIds: [ObjectIdentifier: UInt64] = [:]
  private var touchStartPoints: [UInt64: CGPoint] = [:]
  private var touchStartTimes: [UInt64: Double] = [:]
  private var touchExceededPanThreshold: Set<UInt64> = []
  private var touchForwardedToRust: Set<UInt64> = []
  private var nextTouchId: UInt64 = 1
  private(set) var lastTouchDownTimestamp: Double = 0
  private(set) var lastTouchUpTimestamp: Double = 0
  private(set) var lastTouchTapCount: Int = 1

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

  /// H-S2: Editor-initiated content/selection change notifies `UITextInputDelegate`.
  /// Suppressed during UIKit-initiated `setSelectedTextRange:` (Single-Writer invariant).
  func handleEditorTextInputStateChanged(kind: UInt8) {
    if isApplyingSystemSelection {
      return
    }
    if isInsideImeMutation {
      pendingExternalChangeKind = max(pendingExternalChangeKind, kind)
      return
    }
    notifyInputDelegate(kind: kind)
  }

  private func notifyInputDelegate(kind: UInt8) {
    guard !isApplyingSystemSelection else {
      return
    }
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
      !affine_ios_host_document_selection_snapshot(handle).has_selection,
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
  /// mutations initiated by the text input system itself. Only notify `inputDelegate` when
  /// the editor performed an unexpected extra transform (e.g. Markdown `# ` heading conversion
  /// or block split/merge).
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

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    guard let handle = hostHandle else {
      return super.canPerformAction(action, withSender: sender)
    }
    let mask = affine_ios_host_document_selection_snapshot(handle).action_mask
    if action == #selector(copy(_:)) {
      return (mask & 1) != 0
    }
    if action == #selector(cut(_:)) {
      return (mask & 2) != 0
    }
    if action == #selector(paste(_:)) {
      return (mask & 4) != 0 && affineIosHasPasteboardContent()
    }
    if action == #selector(selectAll(_:)) {
      return (mask & 8) != 0
    }
    if action == #selector(select(_:)) {
      let snap = affine_ios_host_document_selection_snapshot(handle)
      return snap.has_selection && snap.is_collapsed && affine_ios_host_utf16_len(handle) > 0
    }
    return super.canPerformAction(action, withSender: sender)
  }

  override func copy(_ sender: Any?) {
    guard let handle = hostHandle else {
      return
    }
    affine_ios_host_selection_action_copy(handle)
    lastCopiedText = onFallbackCopiedText?()
    onDismissEditMenu?()
    onInteractionWake?()
  }

  override func cut(_ sender: Any?) {
    guard let handle = hostHandle else {
      return
    }
    affine_ios_host_selection_action_cut(handle)
    lastCopiedText = onFallbackCopiedText?()
    onDismissEditMenu?()
    onInteractionWake?()
  }

  override func paste(_ sender: Any?) {
    guard let handle = hostHandle else {
      return
    }
    affine_ios_host_selection_action_paste(handle)
    onDismissEditMenu?()
    onInteractionWake?()
  }

  override func selectAll(_ sender: Any?) {
    guard let handle = hostHandle else {
      return
    }
    affine_ios_host_selection_action_select_all(handle)
    onInteractionWake?()
  }

  override func select(_ sender: Any?) {
    guard let handle = hostHandle else {
      return
    }
    let snap = affine_ios_host_document_selection_snapshot(handle)
    if snap.has_selection {
      _ = affine_ios_host_select_word_at_point(
        handle,
        snap.start_caret.x,
        snap.start_caret.y + max(snap.start_caret.height * 0.5, 4.0)
      )
      onInteractionWake?()
    }
  }

  override var canBecomeFirstResponder: Bool {
    true
  }

  override func becomeFirstResponder() -> Bool {
    if let handle = hostHandle, !affine_ios_host_is_surface_readonly(handle) {
      affine_ios_host_restore_software_keyboard(handle)
      lastWantsSoftwareKeyboard = true
    }
    return super.becomeFirstResponder()
  }

  override var inputView: UIView? {
    guard let handle = hostHandle else {
      return nil
    }
    if affine_ios_host_is_surface_readonly(handle) {
      return emptyInputView
    }
    return affine_ios_host_wants_software_keyboard(handle) ? nil : emptyInputView
  }

  func syncKeyboardInputViewIfNeeded() {
    guard let handle = hostHandle else {
      return
    }
    let wants = !affine_ios_host_is_surface_readonly(handle)
      && affine_ios_host_wants_software_keyboard(handle)
    if wants != lastWantsSoftwareKeyboard {
      lastWantsSoftwareKeyboard = wants
      if isFirstResponder {
        reloadInputViews()
      }
    }
  }

  func notifySystemSelectionUpdated() {
    guard !isInsideImeMutation && !isApplyingSystemSelection else {
      return
    }
    inputDelegate?.selectionWillChange(self)
    inputDelegate?.selectionDidChange(self)
  }

  var hasText: Bool {
    guard let handle = hostHandle else {
      return false
    }
    var sRaw = AffineDocPosition()
    var eRaw = AffineDocPosition()
    if affine_ios_host_doc_document_bounds(handle, &sRaw, &eRaw),
      sRaw.valid,
      eRaw.valid,
      sRaw.endpoint_token != 0,
      eRaw.endpoint_token != 0
    {
      return sRaw.endpoint_token != eRaw.endpoint_token
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

  private var hasCrossBlockSelectionOnEmptyFocus: Bool {
    guard let handle = hostHandle, affine_ios_host_utf16_len(handle) == 0 else {
      return false
    }
    let snap = affine_ios_host_document_selection_snapshot(handle)
    return snap.has_selection && !snap.is_collapsed
  }

  private var effectiveDocumentUtf16Length: Int {
    guard let handle = hostHandle else {
      return 0
    }
    let raw = Int(affine_ios_host_utf16_len(handle))
    if raw == 0 && hasCrossBlockSelectionOnEmptyFocus {
      return 1
    }
    return raw
  }

  /// Single-Writer system selection apply: commits UIKit's `selectedTextRange` into Rust and
  /// updates host signature/menu state WITHOUT synchronously echoing back into `inputDelegate`.
  private func applySystemSelectionMutation(_ body: () -> Void) {
    let wasApplying = isApplyingSystemSelection
    let wasInside = isInsideImeMutation
    isApplyingSystemSelection = true
    isInsideImeMutation = true
    pendingExternalChangeKind = 0
    body()
    if !wasApplying {
      onSystemSelectionApplied?()
      syncCodeInputTraitsIfNeeded()
    }
    isApplyingSystemSelection = wasApplying
    isInsideImeMutation = wasInside
    pendingExternalChangeKind = 0
  }

  private var currentFocusedBlockOrder: Int32 {
    guard let handle = hostHandle else {
      return 0
    }
    return affine_ios_host_focused_block_order(handle)
  }

  private func resolvedBlockOrder(for pos: AffineTextPosition) -> Int32 {
    pos.blockOrder >= 0 ? pos.blockOrder : currentFocusedBlockOrder
  }

  private func resolvedEndpointToken(for pos: AffineTextPosition) -> UInt64 {
    if pos.endpointToken != 0 {
      return pos.endpointToken
    }
    guard let handle = hostHandle else {
      return 0
    }
    var sRaw = AffineDocPosition()
    var eRaw = AffineDocPosition()
    if affine_ios_host_doc_selection_positions(handle, &sRaw, &eRaw),
      sRaw.valid,
      sRaw.block_order == resolvedBlockOrder(for: pos)
    {
      let delta = pos.utf16Offset - Int(sRaw.utf16_offset)
      if delta == 0 {
        return sRaw.endpoint_token
      }
      let stepped = affine_ios_host_doc_step_position(handle, sRaw.endpoint_token, delta)
      if stepped.valid {
        return stepped.endpoint_token
      }
    }
    var docStart = AffineDocPosition()
    var docEnd = AffineDocPosition()
    if affine_ios_host_doc_document_bounds(handle, &docStart, &docEnd),
      docStart.valid,
      pos.blockOrder <= 0
    {
      if pos.utf16Offset == 0 {
        return docStart.endpoint_token
      }
      let stepped = affine_ios_host_doc_step_position(handle, docStart.endpoint_token, pos.utf16Offset)
      if stepped.valid {
        return stepped.endpoint_token
      }
    }
    return 0
  }

  func wordRange(at pos: AffineTextPosition) -> AffineTextRange? {
    guard let handle = hostHandle else {
      return nil
    }
    let tok = resolvedEndpointToken(for: pos)
    guard tok != 0 else {
      return nil
    }
    var sRaw = AffineDocPosition()
    var eRaw = AffineDocPosition()
    guard affine_ios_host_doc_word_range(handle, tok, &sRaw, &eRaw),
      sRaw.valid,
      eRaw.valid
    else {
      return nil
    }
    return AffineTextRange(startPos: .from(sRaw), endPos: .from(eRaw))
  }

  func characterUnitRange(at pos: AffineTextPosition) -> AffineTextRange? {
    let tok = resolvedEndpointToken(for: pos)
    guard tok != 0 else {
      return nil
    }
    let anchoredPos = pos.endpointToken != 0
      ? pos
      : AffineTextPosition(utf16Offset: pos.utf16Offset, blockOrder: pos.blockOrder, endpointToken: tok)
    if let para = blockParagraphRange(at: anchoredPos),
      let paraText = text(in: para)
    {
      let nsText = paraText as NSString
      if nsText.length == 0 {
        return AffineTextRange(startPos: anchoredPos, endPos: anchoredPos)
      }
      let localOffset = max(0, min(anchoredPos.utf16Offset, nsText.length))
      let probeIndex = localOffset < nsText.length ? localOffset : nsText.length - 1
      let composed = nsText.rangeOfComposedCharacterSequence(at: probeIndex)
      if let startPos = position(from: para.startPos, offset: composed.location) as? AffineTextPosition,
        let endPos = position(from: para.startPos, offset: composed.location + composed.length) as? AffineTextPosition
      {
        return AffineTextRange(startPos: startPos, endPos: endPos)
      }
    }
    if let next1 = position(from: anchoredPos, offset: 1) as? AffineTextPosition {
      return AffineTextRange(startPos: anchoredPos, endPos: next1)
    }
    if let prev1 = position(from: anchoredPos, offset: -1) as? AffineTextPosition {
      return AffineTextRange(startPos: prev1, endPos: anchoredPos)
    }
    return AffineTextRange(startPos: anchoredPos, endPos: anchoredPos)
  }

  func blockParagraphRange(at pos: AffineTextPosition) -> AffineTextRange? {
    let tok = resolvedEndpointToken(for: pos)
    guard tok != 0 else {
      return nil
    }
    let anchoredPos = pos.endpointToken != 0
      ? pos
      : AffineTextPosition(utf16Offset: pos.utf16Offset, blockOrder: pos.blockOrder, endpointToken: tok)
    let startPos = (position(from: anchoredPos, offset: -anchoredPos.utf16Offset) as? AffineTextPosition) ?? anchoredPos
    var endPos = anchoredPos
    for step in [256, 64, 16, 4, 1] {
      while let next = position(from: endPos, offset: step) as? AffineTextPosition,
        next.blockOrder == anchoredPos.blockOrder
      {
        endPos = next
      }
    }
    return AffineTextRange(startPos: startPos, endPos: endPos)
  }

  func visualLineRange(at pos: AffineTextPosition) -> AffineTextRange? {
    guard let para = blockParagraphRange(at: pos) else {
      return nil
    }
    let baseRect = caretRect(for: pos)
    let tol = max(baseRect.height * 0.45, 6.0)
    let curOff = pos.utf16Offset
    let maxOff = para.endPos.utf16Offset
    var lo = 0
    var hi = curOff
    var lineStart = pos
    while lo <= hi {
      let mid = (lo + hi) / 2
      if let cand = position(from: para.startPos, offset: mid) as? AffineTextPosition,
        abs(caretRect(for: cand).midY - baseRect.midY) <= tol
      {
        lineStart = cand
        if mid == 0 { break }
        hi = mid - 1
      } else {
        lo = mid + 1
      }
    }
    lo = curOff
    hi = maxOff
    var lineEnd = pos
    while lo <= hi {
      let mid = (lo + hi) / 2
      if let cand = position(from: para.startPos, offset: mid) as? AffineTextPosition,
        abs(caretRect(for: cand).midY - baseRect.midY) <= tol
      {
        lineEnd = cand
        lo = mid + 1
      } else {
        if mid == 0 { break }
        hi = mid - 1
      }
    }
    return AffineTextRange(startPos: lineStart, endPos: lineEnd)
  }

  func text(in range: UITextRange) -> String? {
    guard let affineRange = range as? AffineTextRange else {
      return nil
    }
    let sTok = resolvedEndpointToken(for: affineRange.startPos)
    let eTok = resolvedEndpointToken(for: affineRange.endPos)
    if let handle = hostHandle, sTok != 0, eTok != 0 {
      if sTok == eTok {
        return ""
      }
      if let rawPtr = affine_ios_host_doc_text_between_tokens(handle, sTok, eTok) {
        defer { affine_ios_string_free(rawPtr) }
        return String(cString: rawPtr)
      }
      return ""
    }
    if let handle = hostHandle, currentSelectedUtf16Range.length == 0 {
      let snap = affine_ios_host_document_selection_snapshot(handle)
      if snap.has_selection && !snap.is_collapsed && !affineRange.isEmpty {
        if let rawPtr = affine_ios_host_selected_plain_text(handle) {
          defer { affine_ios_string_free(rawPtr) }
          return String(cString: rawPtr)
        }
        return "\n"
      }
    }
    let text = currentAuthoritativeString
    let clamped = clampRange(affineRange.utf16Range, maxLen: text.length)
    return text.substring(with: clamped)
  }

  func replace(_ range: UITextRange, withText text: String) {
    guard let affineRange = range as? AffineTextRange, let handle = hostHandle else {
      return
    }
    let sTok = resolvedEndpointToken(for: affineRange.startPos)
    let eTok = resolvedEndpointToken(for: affineRange.endPos)
    let focusedOrder = currentFocusedBlockOrder
    if sTok != 0,
      eTok != 0,
      resolvedBlockOrder(for: affineRange.startPos) != focusedOrder
        || resolvedBlockOrder(for: affineRange.endPos) != focusedOrder
    {
      performImeMutation {
        _ = affine_ios_host_doc_selection_select_between_endpoint_tokens(handle, sTok, eTok)
        let utf16 = Array(text.utf16)
        utf16.withUnsafeBufferPointer { buf in
          affine_ios_host_insert_text(handle, buf.baseAddress, buf.count)
        }
      }
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
      if let handle = hostHandle {
        var sRaw = AffineDocPosition()
        var eRaw = AffineDocPosition()
        if affine_ios_host_doc_selection_positions(handle, &sRaw, &eRaw),
          sRaw.valid,
          eRaw.valid
        {
          return AffineTextRange(startPos: .from(sRaw), endPos: .from(eRaw))
        }
      }
      return AffineTextRange(
        utf16Range: currentSelectedUtf16Range,
        blockOrder: currentFocusedBlockOrder
      )
    }
    set {
      guard let affineRange = newValue as? AffineTextRange, let handle = hostHandle else {
        return
      }
      let bumpMenuIfNonCollapsed = { [weak self] in
        let snap = affine_ios_host_document_selection_snapshot(handle)
        if snap.has_selection && !snap.is_collapsed {
          affine_ios_host_bump_selection_menu_request_seq(handle)
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            self?.onInteractionWake?()
          }
        }
      }
      let sTok = resolvedEndpointToken(for: affineRange.startPos)
      let eTok = resolvedEndpointToken(for: affineRange.endPos)
      if sTok != 0 && eTok != 0 {
        applySystemSelectionMutation {
          var curStart: UInt64 = 0
          var curEnd: UInt64 = 0
          affine_ios_host_doc_selection_endpoint_tokens(handle, &curStart, &curEnd)
          let changed = !(curStart == sTok && curEnd == eTok)
          _ = affine_ios_host_doc_selection_select_between_endpoint_tokens(handle, sTok, eTok)
          if changed && sTok != eTok {
            bumpMenuIfNonCollapsed()
          }
        }
        return
      }
      let clamped = clampRange(affineRange.utf16Range)
      applySystemSelectionMutation {
        affine_ios_host_set_selected_range(
          handle,
          AffineUtf16Range(location: UInt32(clamped.location), length: UInt32(clamped.length))
        )
        if clamped.length > 0 {
          bumpMenuIfNonCollapsed()
        }
      }
    }
  }

  var markedTextRange: UITextRange? {
    guard let range = currentMarkedUtf16Range else {
      return nil
    }
    return AffineTextRange(utf16Range: range, blockOrder: currentFocusedBlockOrder)
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
    if let handle = hostHandle {
      var sRaw = AffineDocPosition()
      var eRaw = AffineDocPosition()
      if affine_ios_host_doc_document_bounds(handle, &sRaw, &eRaw), sRaw.valid {
        return AffineTextPosition.from(sRaw)
      }
    }
    return AffineTextPosition(utf16Offset: 0, blockOrder: 0)
  }

  var endOfDocument: UITextPosition {
    if let handle = hostHandle {
      var sRaw = AffineDocPosition()
      var eRaw = AffineDocPosition()
      if affine_ios_host_doc_document_bounds(handle, &sRaw, &eRaw), eRaw.valid {
        return AffineTextPosition.from(eRaw)
      }
    }
    return AffineTextPosition(
      utf16Offset: effectiveDocumentUtf16Length,
      blockOrder: currentFocusedBlockOrder
    )
  }

  func textRange(from fromPosition: UITextPosition, to toPosition: UITextPosition) -> UITextRange? {
    guard
      let from = fromPosition as? AffineTextPosition,
      let to = toPosition as? AffineTextPosition
    else {
      return nil
    }
    if compare(from, to: to) != .orderedDescending {
      return AffineTextRange(startPos: from, endPos: to)
    }
    return AffineTextRange(startPos: to, endPos: from)
  }

  func position(from position: UITextPosition, offset: Int) -> UITextPosition? {
    guard let pos = position as? AffineTextPosition else {
      return nil
    }
    if offset == 0 {
      return pos
    }
    if let handle = hostHandle {
      let tok = resolvedEndpointToken(for: pos)
      if tok != 0 {
        let stepped = affine_ios_host_doc_step_position(handle, tok, offset)
        return stepped.valid ? AffineTextPosition.from(stepped) : nil
      }
    }
    let maxLen = effectiveDocumentUtf16Length
    let next = pos.utf16Offset + offset
    guard next >= 0 && next <= maxLen else {
      return nil
    }
    return AffineTextPosition(utf16Offset: next, blockOrder: resolvedBlockOrder(for: pos))
  }

  func position(
    from position: UITextPosition,
    in direction: UITextLayoutDirection,
    offset: Int
  ) -> UITextPosition? {
    guard let pos = position as? AffineTextPosition else {
      return nil
    }
    if offset == 0 {
      return pos
    }
    switch direction {
    case .left:
      return self.position(from: pos, offset: -offset)
    case .right:
      return self.position(from: pos, offset: offset)
    case .up, .down:
      let cr = caretRect(for: pos)
      let lineStep = max(cr.height, 22.0) * CGFloat(offset)
      let dy = direction == .up ? -lineStep : lineStep
      return closestPosition(to: CGPoint(x: cr.midX, y: cr.midY + dy))
    @unknown default:
      return self.position(from: pos, offset: offset)
    }
  }

  func compare(_ position: UITextPosition, to other: UITextPosition) -> ComparisonResult {
    guard
      let lhs = position as? AffineTextPosition,
      let rhs = other as? AffineTextPosition
    else {
      return .orderedSame
    }
    let lo = resolvedBlockOrder(for: lhs)
    let ro = resolvedBlockOrder(for: rhs)
    if lo != ro {
      return lo < ro ? .orderedAscending : .orderedDescending
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
    let so = resolvedBlockOrder(for: start)
    let eo = resolvedBlockOrder(for: end)
    if so == eo {
      return end.utf16Offset - start.utf16Offset
    }
    if let handle = hostHandle {
      let sTok = resolvedEndpointToken(for: start)
      let eTok = resolvedEndpointToken(for: end)
      if sTok != 0 && eTok != 0 {
        return Int(affine_ios_host_doc_offset_between_tokens(handle, sTok, eTok))
      }
    }
    return Int(eo - so) * 1024 + (end.utf16Offset - start.utf16Offset)
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
      return affineRange.startPos
    case .right, .down:
      return affineRange.endPos
    @unknown default:
      return affineRange.startPos
    }
  }

  func characterRange(
    byExtending position: UITextPosition,
    in direction: UITextLayoutDirection
  ) -> UITextRange? {
    guard let pos = position as? AffineTextPosition else {
      return nil
    }
    if pos.endpointToken != 0 {
      switch direction {
      case .left, .up:
        if let start = self.position(from: pos, offset: -pos.utf16Offset) as? AffineTextPosition {
          return AffineTextRange(startPos: start, endPos: pos)
        }
      case .right, .down:
        if let para = blockParagraphRange(at: pos) {
          return AffineTextRange(startPos: pos, endPos: para.endPos)
        }
      @unknown default:
        break
      }
    }
    let maxLen = Int(hostHandle.map { affine_ios_host_utf16_len($0) } ?? 0)
    switch direction {
    case .left, .up:
      return AffineTextRange(
        utf16Range: clampRange(NSRange(location: 0, length: pos.utf16Offset), maxLen: maxLen),
        blockOrder: resolvedBlockOrder(for: pos)
      )
    case .right, .down:
      return AffineTextRange(
        utf16Range: clampRange(
          NSRange(location: pos.utf16Offset, length: max(0, maxLen - pos.utf16Offset)),
          maxLen: maxLen
        ),
        blockOrder: resolvedBlockOrder(for: pos)
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
    if affineRange.isEmpty {
      return caretRect(for: affineRange.startPos)
    }
    if let first = selectionRects(for: affineRange).first {
      return first.rect
    }
    return caretRect(for: affineRange.startPos)
  }

  func caretRect(for position: UITextPosition) -> CGRect {
    guard
      let pos = position as? AffineTextPosition,
      let handle = hostHandle
    else {
      return .zero
    }
    let tok = resolvedEndpointToken(for: pos)
    if tok != 0 {
      var tokenRect = AffineRect()
      if affine_ios_host_doc_caret_rect_for_token(handle, tok, &tokenRect) {
        return CGRect(
          x: CGFloat(tokenRect.x),
          y: CGFloat(tokenRect.y),
          width: CGFloat(max(tokenRect.width, 2.0)),
          height: CGFloat(max(tokenRect.height, 18.0))
        )
      }
    }
    let snap = affine_ios_host_document_selection_snapshot(handle)
    if snap.has_selection && snap.is_collapsed {
      if pos.utf16Offset == currentSelectedUtf16Range.location
        && resolvedBlockOrder(for: pos) == currentFocusedBlockOrder
      {
        if !snap.start_visible {
          return CGRect(x: -1000.0, y: -1000.0, width: 0.0, height: 0.0)
        }
        return CGRect(
          x: CGFloat(snap.start_caret.x),
          y: CGFloat(snap.start_caret.y),
          width: CGFloat(max(snap.start_caret.width, 2.0)),
          height: CGFloat(max(snap.start_caret.height, 18.0))
        )
      }
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
    let sTok = resolvedEndpointToken(for: affineRange.startPos)
    let eTok = resolvedEndpointToken(for: affineRange.endPos)
    if sTok != 0 && eTok != 0 {
      if sTok == eTok {
        return []
      }
      let count = affine_ios_host_doc_selection_rects_between_tokens(handle, sTok, eTok, nil, 0)
      if count > 0 {
        var rects = Array(repeating: AffineDocumentSelectionRect(), count: count)
        _ = rects.withUnsafeMutableBufferPointer { buf in
          affine_ios_host_doc_selection_rects_between_tokens(
            handle,
            sTok,
            eTok,
            buf.baseAddress,
            count
          )
        }
        return rects.map { item in
          AffineTextSelectionRect(
            rect: CGRect(
              x: CGFloat(item.rect.x),
              y: CGFloat(item.rect.y),
              width: CGFloat(item.rect.width),
              height: CGFloat(item.rect.height)
            ),
            containsStart: item.contains_start,
            containsEnd: item.contains_end,
            writingDirection: item.is_rtl ? .rightToLeft : .leftToRight
          )
        }
      }
      return []
    }
    let snap = affine_ios_host_document_selection_snapshot(handle)
    let cur = currentSelectedUtf16Range
    let matchesActiveSelection = snap.has_selection
      && !snap.is_collapsed
      && snap.rect_count > 0
      && affineRange.utf16Range == cur
    if matchesActiveSelection {
      let count = affine_ios_host_document_selection_rects(handle, nil, 0)
      if count > 0 {
        var docRects = Array(repeating: AffineDocumentSelectionRect(), count: count)
        _ = docRects.withUnsafeMutableBufferPointer { buf in
          affine_ios_host_document_selection_rects(handle, buf.baseAddress, count)
        }
        return docRects.map { item in
          AffineTextSelectionRect(
            rect: CGRect(
              x: CGFloat(item.rect.x),
              y: CGFloat(item.rect.y),
              width: CGFloat(item.rect.width),
              height: CGFloat(item.rect.height)
            ),
            containsStart: item.contains_start,
            containsEnd: item.contains_end,
            writingDirection: item.is_rtl ? .rightToLeft : .leftToRight
          )
        }
      }
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
    let dir: NSWritingDirection = currentWritingDirection == 1 ? .rightToLeft : .leftToRight
    return rawRects.map { item in
      AffineTextSelectionRect(
        rect: CGRect(
          x: CGFloat(item.rect.x),
          y: CGFloat(item.rect.y),
          width: CGFloat(item.rect.width),
          height: CGFloat(item.rect.height)
        ),
        containsStart: item.contains_start,
        containsEnd: item.contains_end,
        writingDirection: dir
      )
    }
  }

  func closestPosition(to point: CGPoint) -> UITextPosition? {
    guard let handle = hostHandle else {
      return AffineTextPosition(utf16Offset: 0, blockOrder: 0)
    }
    let hit = affine_ios_host_doc_hit_position(handle, Float(point.x), Float(point.y))
    if hit.valid {
      return AffineTextPosition.from(hit)
    }
    let offset = affine_ios_host_text_closest_offset(
      handle,
      AffinePoint(x: Float(point.x), y: Float(point.y))
    )
    return AffineTextPosition(utf16Offset: Int(offset), blockOrder: currentFocusedBlockOrder)
  }

  func closestPosition(to point: CGPoint, within range: UITextRange) -> UITextPosition? {
    guard let affineRange = range as? AffineTextRange else {
      return closestPosition(to: point)
    }
    guard let pos = closestPosition(to: point) as? AffineTextPosition else {
      return affineRange.endPos
    }
    if compare(pos, to: affineRange.startPos) == .orderedAscending {
      return affineRange.startPos
    }
    if compare(pos, to: affineRange.endPos) == .orderedDescending {
      return affineRange.endPos
    }
    return pos
  }

  func characterRange(at point: CGPoint) -> UITextRange? {
    guard let pos = closestPosition(to: point) as? AffineTextPosition else {
      return nil
    }
    return characterUnitRange(at: pos)
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

  private static let panSlopPt: CGFloat = 10.0

  override func didMoveToWindow() {
    super.didMoveToWindow()
    onDidMoveToWindow?()
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let handle = hostHandle else { return }
    let now = CACurrentMediaTime()
    lastTouchDownTimestamp = now
    for touch in touches {
      lastTouchTapCount = max(1, touch.tapCount)
      let loc = touch.location(in: self)
      let id = touchId(for: touch, remove: false)
      touchStartPoints[id] = loc
      touchStartTimes[id] = now
      touchExceededPanThreshold.remove(id)
      touchForwardedToRust.remove(id)
      if !(onQueryShouldLetTextInteractionOwnTouch?(loc) ?? true) {
        touchForwardedToRust.insert(id)
        affine_ios_host_touch_event(handle, id, 0, Float(loc.x), Float(loc.y))
      }
    }
    onInteractionWake?()
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let handle = hostHandle else { return }
    let systemGestureActive = onQuerySystemGestureActive?() ?? false
    for touch in touches {
      let loc = touch.location(in: self)
      let id = touchId(for: touch, remove: false)
      if touchForwardedToRust.contains(id) {
        affine_ios_host_touch_event(handle, id, 1, Float(loc.x), Float(loc.y))
        continue
      }
      if let start = touchStartPoints[id] {
        let dx = loc.x - start.x
        let dy = loc.y - start.y
        if hypot(dx, dy) > Self.panSlopPt {
          touchExceededPanThreshold.insert(id)
          if !systemGestureActive {
            touchForwardedToRust.insert(id)
            affine_ios_host_touch_event(handle, id, 0, Float(start.x), Float(start.y))
            affine_ios_host_touch_event(handle, id, 1, Float(loc.x), Float(loc.y))
          }
        }
      }
    }
    onInteractionWake?()
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let handle = hostHandle else { return }
    lastTouchUpTimestamp = CACurrentMediaTime()
    for touch in touches {
      let loc = touch.location(in: self)
      let id = touchId(for: touch, remove: true)
      touchStartPoints.removeValue(forKey: id)
      touchStartTimes.removeValue(forKey: id)
      touchExceededPanThreshold.remove(id)
      if touchForwardedToRust.remove(id) != nil {
        affine_ios_host_touch_event(handle, id, 2, Float(loc.x), Float(loc.y))
      }
    }
    if !affine_ios_host_wants_software_keyboard(handle),
      !affine_ios_host_document_selection_snapshot(handle).has_selection,
      isFirstResponder
    {
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
      touchStartTimes.removeValue(forKey: id)
      touchExceededPanThreshold.remove(id)
      if touchForwardedToRust.remove(id) != nil {
        affine_ios_host_touch_event(handle, id, 3, Float(loc.x), Float(loc.y))
      }
    }
    onInteractionWake?()
  }

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
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

private struct SelectionSyncSignature: Equatable {
  let hasSelection: Bool
  let isCollapsed: Bool
  let isReversed: Bool
  let startVisible: Bool
  let endVisible: Bool
  let startX: Int
  let startY: Int
  let startH: Int
  let endX: Int
  let endY: Int
  let endH: Int
  let rectCount: Int
}

final class MetalHostViewController:
  UIViewController,
  UITextInteractionDelegate,
  UIEditMenuInteractionDelegate
{
  private let hostView = MetalHostView()
  private let keyboardAvoidanceCoordinator = KeyboardAvoidanceCoordinator()
  private let pdfRendererBridge = PdfRendererBridge()
  private let textRenderingBridge = TextRenderingBridge()
  private let hapticsBridge = HapticsBridge()
  private let bootstrapCoordinator = HostBootstrapCoordinator()
  private let shareExtensionBridge = ShareExtensionBridge()
  private let paywallBridge = AffinePaywallBridge()
  private let onboardingSignInBridge = OnboardingSignInBridge()
  private var editorMetalLayer: CAMetalLayer?
  private var textInteraction: UITextInteraction?
  private var textInteractionIsReadonly = false
  private var editMenuInteraction: UIEditMenuInteraction?
  private var systemGestureStartPoint: [ObjectIdentifier: CGPoint] = [:]
  private var observedSystemGestures: Set<ObjectIdentifier> = []
  private var lastSelectionSyncSignature: SelectionSyncSignature?
  private var lastPresentedMenuWasCollapsed = false
  private var lastCollapsedMenuCaretKey: (Int, Int) = (-1, -1)
  private(set) var presentedMenuAnchorRect: CGRect?
  private var lastPresentedMenuSeq: UInt64 = 0
  private var menuSuppressedByMotion = false
  private(set) var lastWrittenClipboard: [String: String] = [:]
  private(set) var lastWrittenPasteboardChangeCount: Int = -1

  func recordLastWrittenClipboard(
    _ dict: [String: String],
    changeCount: Int = affineHasSystemPasteboardRunLoop ? UIPasteboard.general.changeCount : 1
  ) {
    lastWrittenClipboard = dict
    lastWrittenPasteboardChangeCount = changeCount
  }

  static func seedExternalPasteboard(_ dict: [String: String]) {
    if affineHasSystemPasteboardRunLoop {
      affineIosWriteSystemPasteboard(dict)
    } else {
      affineHeadlessPasteboard = dict
    }
  }

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

  var textHostView: MetalHostView { hostView }
  var keyboardCoordinator: KeyboardAvoidanceCoordinator { keyboardAvoidanceCoordinator }
  var haptics: HapticsBridge { hapticsBridge }
  var textRenderer: TextRenderingBridge { textRenderingBridge }
  var hostPointer: OpaquePointer? { hostHandle }
  var shareExtension: ShareExtensionBridge { shareExtensionBridge }
  var paywall: AffinePaywallBridge { paywallBridge }
  var onboardingSignIn: OnboardingSignInBridge { onboardingSignInBridge }

  /// Routes incoming `affine://auth/callback?...` URLs from `SceneDelegate` into `OnboardingSignInBridge`
  /// without exposing any raw host pointers outside the view controller.
  @discardableResult
  func handleIncomingUrl(_ url: URL) -> Bool {
    guard let handle = hostHandle else {
      return false
    }
    guard url.scheme?.lowercased() == "affine", url.host?.lowercased() == "auth" else {
      return false
    }
    let handled = onboardingSignInBridge.handleOAuthCallbackUrl(url, host: handle)
    if handled {
      affine_ios_host_request_frame(handle)
      wakeDisplayLink()
    }
    return handled
  }

  /// Triggers native Sign in with Apple through `OnboardingSignInBridge`.
  func triggerAppleSignIn(completion: @escaping (Bool) -> Void) {
    onboardingSignInBridge.beginAppleSignIn(completion: completion)
  }

  /// Initiates a StoreKit 2 purchase through `AffinePaywallBridge` (finishes only after Rust records JWS).
  @available(iOS 15.0, *)
  func triggerPaywallPurchase(productId: String) async -> Bool {
    await paywallBridge.purchaseProduct(productId: productId)
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
      affine_ios_host_set_clipboard_provider(
        handle,
        AffineClipboardProvider(
          write_json: affineIosClipboardWriteTrampoline,
          read_json: affineIosClipboardReadTrampoline,
          user_data: rawSelf
        )
      )
      let isPad = UIDevice.current.userInterfaceIdiom == .pad
      affine_ios_host_set_form_factor(handle, isPad ? 1 : 0)
      if let rawEditorLayer = affine_ios_host_metal_layer(handle) {
        let metalLayer = Unmanaged<CAMetalLayer>.fromOpaque(rawEditorLayer).takeUnretainedValue()
        metalLayer.frame = hostView.bounds
        metalLayer.contentsScale = CGFloat(scale)
        hostView.layer.insertSublayer(metalLayer, at: 0)
        editorMetalLayer = metalLayer
      }
      onboardingSignInBridge.attach(window: view.window, host: handle)
      paywallBridge.attach(host: handle)
      paywallBridge.startTransactionListener()
    }
    applyClearColor(TextRenderingBridge.defaultClearColorRgba)

    installTextInteraction(readonly: false)
    let menuInteraction = UIEditMenuInteraction(delegate: self)
    hostView.addInteraction(menuInteraction)
    editMenuInteraction = menuInteraction

    hostView.onDidMoveToWindow = { [weak self] in
      self?.attachSystemGestureObservers()
      if let self, let handle = self.hostHandle {
        self.onboardingSignInBridge.attach(window: self.view.window, host: handle)
      }
    }
    hostView.onQuerySystemGestureActive = { [weak self] in
      self?.isSystemSelectionGestureActive ?? false
    }
    hostView.onQueryShouldLetTextInteractionOwnTouch = { [weak self] point in
      self?.shouldLetTextInteractionOwnTouch(at: point) ?? false
    }
    hostView.onSelectedRangeChanged = { [weak self] _ in
      self?.syncDocumentSelectionFromEditor(suppressInputDelegateNotification: false)
    }
    hostView.onSystemSelectionApplied = { [weak self] in
      self?.wakeDisplayLink()
      self?.syncDocumentSelectionFromEditor(suppressInputDelegateNotification: true)
    }
    hostView.onInteractionWake = { [weak self] in
      self?.wakeDisplayLink()
      self?.syncDocumentSelectionFromEditor(suppressInputDelegateNotification: false)
    }
    hostView.onDismissEditMenu = { [weak self] in
      self?.menuSuppressedByMotion = false
      self?.editMenuInteraction?.dismissMenu()
      self?.presentedMenuAnchorRect = nil
    }
    hostView.onFallbackCopiedText = { [weak self] in
      self?.lastWrittenClipboard["text/plain"]
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

  private func installTextInteraction(readonly: Bool) {
    if let existing = textInteraction {
      hostView.removeInteraction(existing)
      textInteraction = nil
    }
    observedSystemGestures.removeAll()
    systemGestureStartPoint.removeAll()
    textInteractionIsReadonly = readonly
    let interaction = UITextInteraction(for: readonly ? .nonEditable : .editable)
    interaction.delegate = self
    interaction.textInput = hostView
    hostView.addInteraction(interaction)
    textInteraction = interaction
    attachSystemGestureObservers()
  }

  private func syncTextInteractionModeIfNeeded(handle: OpaquePointer) {
    let readonly = affine_ios_host_is_surface_readonly(handle)
    if readonly != textInteractionIsReadonly {
      installTextInteraction(readonly: readonly)
    }
  }

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
    attachSystemGestureObservers()
    updateEditorMetalLayout()
    sampleInsets(timestamp: CACurrentMediaTime())
    wakeDisplayLink()
    syncDocumentSelectionFromEditor(suppressInputDelegateNotification: false)
  }

  private func attachSystemGestureObservers() {
    let allGestures = (textInteraction?.gesturesForFailureRequirements ?? [])
      + (hostView.gestureRecognizers ?? [])
    for gesture in allGestures {
      let className = NSStringFromClass(type(of: gesture))
      guard className.localizedCaseInsensitiveContains("loupe") else {
        continue
      }
      let id = ObjectIdentifier(gesture)
      if observedSystemGestures.insert(id).inserted {
        gesture.addTarget(self, action: #selector(handleSystemTextGestureState(_:)))
      }
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
    editorMetalLayer?.removeFromSuperlayer()
    editorMetalLayer = nil
    if let handle = hostHandle {
      affine_ios_host_set_frame_wake_callback(handle, nil, nil)
      affine_ios_host_set_clipboard_provider(
        handle,
        AffineClipboardProvider(write_json: nil, read_json: nil, user_data: nil)
      )
      MainActor.assumeIsolated {
        onboardingSignInBridge.detach()
        paywallBridge.detach()
      }
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

  private var isSystemSelectionGestureActive: Bool {
    let gestures = textInteraction?.gesturesForFailureRequirements ?? []
    return gestures.contains { $0.state == .began || $0.state == .changed }
  }

  func shouldLetTextInteractionOwnTouch(at point: CGPoint) -> Bool {
    guard let handle = hostHandle else {
      return false
    }
    syncTextInteractionModeIfNeeded(handle: handle)
    let snap = affine_ios_host_document_selection_snapshot(handle)
    if snap.has_selection && !snap.is_collapsed {
      if snap.start_visible {
        let startDot = CGPoint(
          x: CGFloat(snap.start_caret.x),
          y: CGFloat(snap.start_caret.y) - 6.0
        )
        let startStem = CGPoint(
          x: CGFloat(snap.start_caret.x),
          y: CGFloat(snap.start_caret.y + snap.start_caret.height * 0.5)
        )
        if hypot(point.x - startDot.x, point.y - startDot.y) <= 24.0
          || hypot(point.x - startStem.x, point.y - startStem.y) <= 20.0
        {
          return true
        }
      }
      if snap.end_visible {
        let endDot = CGPoint(
          x: CGFloat(snap.end_caret.x),
          y: CGFloat(snap.end_caret.y + snap.end_caret.height) + 6.0
        )
        let endStem = CGPoint(
          x: CGFloat(snap.end_caret.x),
          y: CGFloat(snap.end_caret.y + snap.end_caret.height * 0.5)
        )
        if hypot(point.x - endDot.x, point.y - endDot.y) <= 24.0
          || hypot(point.x - endStem.x, point.y - endStem.y) <= 20.0
        {
          return true
        }
      }
    }
    return !affine_ios_host_should_forward_touch_immediately(
      handle,
      Float(point.x),
      Float(point.y)
    )
  }

  func interactionShouldBegin(_ interaction: UITextInteraction, at point: CGPoint) -> Bool {
    shouldLetTextInteractionOwnTouch(at: point)
  }

  @objc private func handleSystemTextGestureState(_ gesture: UIGestureRecognizer) {
    let key = ObjectIdentifier(gesture)
    let loc = gesture.location(in: hostView)
    switch gesture.state {
    case .began:
      systemGestureStartPoint[key] = loc
      editMenuInteraction?.dismissMenu()
    case .ended:
      let start = systemGestureStartPoint.removeValue(forKey: key) ?? loc
      let moved = hypot(loc.x - start.x, loc.y - start.y)
      if moved <= 12.0 {
        let holdLoc = loc
        DispatchQueue.main.async { [weak self] in
          guard let self, let h = self.hostHandle else { return }
          let postSnap = affine_ios_host_document_selection_snapshot(h)
          let isReadonly = affine_ios_host_is_surface_readonly(h)
          if isReadonly {
            if postSnap.is_collapsed || !postSnap.has_selection {
              _ = affine_ios_host_select_word_at_point(h, Float(holdLoc.x), Float(holdLoc.y))
              self.hostView.notifySystemSelectionUpdated()
            } else {
              affine_ios_host_bump_selection_menu_request_seq(h)
            }
          } else if postSnap.has_selection {
            affine_ios_host_bump_selection_menu_request_seq(h)
          }
          self.wakeDisplayLink()
          self.syncDocumentSelectionFromEditor(suppressInputDelegateNotification: false)
        }
      }
    case .cancelled, .failed:
      systemGestureStartPoint.removeValue(forKey: key)
    default:
      break
    }
  }

  func syncDocumentSelectionFromEditor(suppressInputDelegateNotification: Bool = false) {
    guard let handle = hostHandle else {
      return
    }
    syncTextInteractionModeIfNeeded(handle: handle)
    hostView.syncKeyboardInputViewIfNeeded()
    let snap = affine_ios_host_document_selection_snapshot(handle)
    let hideReadonlyCaret = snap.has_selection
      && snap.is_collapsed
      && affine_ios_host_is_surface_readonly(handle)
      && !isSystemSelectionGestureActive
    let desiredTint: UIColor = hideReadonlyCaret ? .clear : .systemBlue
    if hostView.tintColor != desiredTint {
      hostView.tintColor = desiredTint
    }
    let hasVisibleRange = snap.has_selection
      && !snap.is_collapsed
      && (snap.start_visible || snap.end_visible)
    if hasVisibleRange && !hostView.isFirstResponder && hostView.window != nil {
      _ = hostView.becomeFirstResponder()
    }
    let nextSig = SelectionSyncSignature(
      hasSelection: snap.has_selection,
      isCollapsed: snap.is_collapsed,
      isReversed: snap.is_reversed,
      startVisible: snap.start_visible,
      endVisible: snap.end_visible,
      startX: Int((snap.start_caret.x * 4.0).rounded()),
      startY: Int((snap.start_caret.y * 4.0).rounded()),
      startH: Int((snap.start_caret.height * 4.0).rounded()),
      endX: Int((snap.end_caret.x * 4.0).rounded()),
      endY: Int((snap.end_caret.y * 4.0).rounded()),
      endH: Int((snap.end_caret.height * 4.0).rounded()),
      rectCount: snap.rect_count
    )
    if nextSig != lastSelectionSyncSignature {
      lastSelectionSyncSignature = nextSig
      if !suppressInputDelegateNotification
        && !hostView.isInsideImeMutation
        && !hostView.isApplyingSystemSelection
        && !isSystemSelectionGestureActive
        && snap.has_selection
      {
        hostView.notifySystemSelectionUpdated()
      }
    }
    if !snap.has_selection || snap.action_mask == 0 {
      menuSuppressedByMotion = false
      if presentedMenuAnchorRect != nil {
        presentedMenuAnchorRect = nil
        editMenuInteraction?.dismissMenu()
      }
      return
    }
    if !snap.menu_anchor_visible || snap.menu_suppressed_for_motion {
      if !snap.is_collapsed
        && (presentedMenuAnchorRect != nil
          || menuSuppressedByMotion
          || (lastPresentedMenuSeq > 0 && snap.menu_request_seq == lastPresentedMenuSeq))
      {
        menuSuppressedByMotion = true
      } else if snap.is_collapsed {
        menuSuppressedByMotion = false
      }
      if presentedMenuAnchorRect != nil {
        presentedMenuAnchorRect = nil
        editMenuInteraction?.dismissMenu()
      }
      return
    }
    let seqAdvanced = snap.menu_request_seq != lastPresentedMenuSeq && snap.menu_request_seq > 0
    let restoreAfterMotion = menuSuppressedByMotion && !snap.is_collapsed && lastPresentedMenuSeq > 0
    let caretKey = (Int(affine_ios_host_selected_range(handle).location), Int(affine_ios_host_utf16_len(handle)))
    if !seqAdvanced && snap.is_collapsed && (!lastPresentedMenuWasCollapsed || caretKey != lastCollapsedMenuCaretKey) {
      menuSuppressedByMotion = false
      if presentedMenuAnchorRect != nil {
        presentedMenuAnchorRect = nil
        editMenuInteraction?.dismissMenu()
      }
      return
    }
    let rect = CGRect(
      x: CGFloat(snap.menu_anchor_rect.x),
      y: CGFloat(snap.menu_anchor_rect.y),
      width: CGFloat(max(snap.menu_anchor_rect.width, 2.0)),
      height: CGFloat(max(snap.menu_anchor_rect.height, 2.0))
    )
    guard
      !rect.isNull,
      rect.origin.x.isFinite,
      rect.origin.y.isFinite,
      rect.size.width.isFinite,
      rect.size.height.isFinite
    else {
      presentedMenuAnchorRect = nil
      editMenuInteraction?.dismissMenu()
      return
    }
    let anchorMoved = presentedMenuAnchorRect.map {
      abs($0.minX - rect.minX) > 1.0 || abs($0.minY - rect.minY) > 1.0
    } ?? false
    presentedMenuAnchorRect = rect
    if seqAdvanced || restoreAfterMotion {
      if isSystemSelectionGestureActive {
        return
      }
      menuSuppressedByMotion = false
      lastPresentedMenuWasCollapsed = snap.is_collapsed
      lastCollapsedMenuCaretKey = caretKey
      guard let interaction = editMenuInteraction, hostView.window != nil else {
        return
      }
      if seqAdvanced {
        lastPresentedMenuSeq = snap.menu_request_seq
      }
      if !hostView.isFirstResponder {
        _ = hostView.becomeFirstResponder()
      }
      let clampedX = min(max(rect.midX, 1.0), max(hostView.bounds.width - 1.0, 1.0))
      let clampedY = min(max(rect.minY, 1.0), max(hostView.bounds.height - 1.0, 1.0))
      let config = UIEditMenuConfiguration(
        identifier: nil,
        sourcePoint: CGPoint(x: clampedX, y: clampedY)
      )
      DispatchQueue.main.async { [weak self, weak interaction] in
        guard
          let self,
          let interaction,
          self.hostView.window != nil,
          self.presentedMenuAnchorRect != nil
        else {
          return
        }
        interaction.dismissMenu()
        interaction.presentEditMenu(with: config)
      }
    } else if anchorMoved {
      editMenuInteraction?.updateVisibleMenuPosition(animated: false)
    }
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
    nil
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
      syncDocumentSelectionFromEditor(suppressInputDelegateNotification: false)
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
      let preferredWorkspaceId = bootstrapCoordinator.lastSnapshot?.entries["last_workspace_id"]
      let activeWorkspace = preferredWorkspaceId.flatMap { bootstrapCoordinator.workspace(id: $0) }
        ?? bootstrapCoordinator.allowlistedLocalIds
          .compactMap { bootstrapCoordinator.workspace(id: $0) }
          .first
      let ingested = shareExtensionBridge.drainAndIngestIntoHost(
        handle,
        workspace: activeWorkspace
      )
      if ingested > 0 {
        syncDocumentSelectionFromEditor(suppressInputDelegateNotification: false)
      }
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
      syncDocumentSelectionFromEditor(suppressInputDelegateNotification: false)
    }
  }
}
