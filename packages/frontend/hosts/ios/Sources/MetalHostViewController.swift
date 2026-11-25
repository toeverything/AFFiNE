import Metal
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
  private(set) var lastCopiedText: String?

  private var backingText: NSString = ""
  private var selectedUtf16Range = NSRange(location: 0, length: 0)
  private var markedUtf16Range: NSRange?

  var currentBackingUtf16Units: [UInt16] {
    let len = backingText.length
    guard len > 0 else { return [] }
    var buf = Array(repeating: UInt16(0), count: len)
    backingText.getCharacters(&buf, range: NSRange(location: 0, length: len))
    return buf
  }

  var currentSelectedUtf16Range: NSRange {
    clampRange(selectedUtf16Range)
  }

  var currentWritingDirection: UInt8 {
    guard let handle = hostHandle else {
      return 0
    }
    return affine_ios_host_text_writing_direction(handle)
  }

  func updateSelectedRangeFromOverlay(_ range: NSRange) {
    let clamped = clampRange(range)
    selectedUtf16Range = clamped
    if let handle = hostHandle {
      affine_ios_host_set_selected_range(
        handle,
        AffineUtf16Range(location: UInt32(clamped.location), length: UInt32(clamped.length))
      )
    }
  }

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(copy(_:)) || action == #selector(cut(_:)) {
      return selectedUtf16Range.length > 0
    }
    if action == #selector(paste(_:)) {
      return UIPasteboard.general.hasStrings
    }
    if action == #selector(selectAll(_:)) {
      return backingText.length > 0
    }
    return super.canPerformAction(action, withSender: sender)
  }

  override func copy(_ sender: Any?) {
    let clamped = clampRange(selectedUtf16Range)
    guard clamped.length > 0 else {
      return
    }
    let copied = backingText.substring(with: clamped)
    lastCopiedText = copied
    UIPasteboard.general.string = copied
  }

  override func cut(_ sender: Any?) {
    let clamped = clampRange(selectedUtf16Range)
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
    selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: backingText.length))
  }

  override var canBecomeFirstResponder: Bool {
    true
  }

  var hasText: Bool {
    backingText.length > 0
  }

  func insertText(_ text: String) {
    let replaceRange = clampRange(markedUtf16Range ?? selectedUtf16Range)
    backingText = backingText.replacingCharacters(in: replaceRange, with: text) as NSString
    let utf16 = Array(text.utf16)
    selectedUtf16Range = NSRange(location: replaceRange.location + utf16.count, length: 0)
    markedUtf16Range = nil
    if let handle = hostHandle {
      utf16.withUnsafeBufferPointer { buf in
        affine_ios_host_insert_text(handle, buf.baseAddress, buf.count)
      }
    }
    onSelectedRangeChanged?(selectedUtf16Range)
  }

  func deleteBackward() {
    let clampedSelected = clampRange(selectedUtf16Range)
    var deletedRange: NSRange?
    if clampedSelected.length > 0 {
      backingText = backingText.replacingCharacters(in: clampedSelected, with: "") as NSString
      selectedUtf16Range = NSRange(location: clampedSelected.location, length: 0)
      adjustMarkedRangeAfterDeletion(clampedSelected)
      deletedRange = clampedSelected
    } else if clampedSelected.location > 0 {
      let delRange = backingText.rangeOfComposedCharacterSequence(
        at: clampedSelected.location - 1
      )
      backingText = backingText.replacingCharacters(in: delRange, with: "") as NSString
      selectedUtf16Range = NSRange(location: delRange.location, length: 0)
      adjustMarkedRangeAfterDeletion(delRange)
      deletedRange = delRange
    }
    if let handle = hostHandle, let del = deletedRange {
      affine_ios_host_delete_range(
        handle,
        AffineUtf16Range(location: UInt32(del.location), length: UInt32(del.length))
      )
    }
    if deletedRange != nil {
      onSelectedRangeChanged?(selectedUtf16Range)
    }
  }

  private func adjustMarkedRangeAfterDeletion(_ deleted: NSRange) {
    guard let marked = markedUtf16Range else {
      return
    }
    let markedEnd = marked.location + marked.length
    let deletedEnd = deleted.location + deleted.length
    if deletedEnd <= marked.location {
      markedUtf16Range = NSRange(location: marked.location - deleted.length, length: marked.length)
    } else if deleted.location < markedEnd {
      let overlapStart = max(marked.location, deleted.location)
      let overlapEnd = min(markedEnd, deletedEnd)
      let overlapLen = max(0, overlapEnd - overlapStart)
      let newLen = marked.length - overlapLen
      if newLen <= 0 {
        markedUtf16Range = nil
      } else {
        markedUtf16Range = NSRange(location: min(marked.location, deleted.location), length: newLen)
      }
    }
  }

  func text(in range: UITextRange) -> String? {
    guard let affineRange = range as? AffineTextRange else {
      return nil
    }
    return backingText.substring(with: clampRange(affineRange.utf16Range))
  }

  func replace(_ range: UITextRange, withText text: String) {
    guard let affineRange = range as? AffineTextRange else {
      return
    }
    let clamped = clampRange(affineRange.utf16Range)
    backingText = backingText.replacingCharacters(in: clamped, with: text) as NSString
    let utf16 = Array(text.utf16)
    selectedUtf16Range = NSRange(location: clamped.location + utf16.count, length: 0)
    markedUtf16Range = nil
    if let handle = hostHandle {
      let cRange = AffineUtf16Range(
        location: UInt32(clamped.location),
        length: UInt32(clamped.length)
      )
      utf16.withUnsafeBufferPointer { buf in
        affine_ios_host_replace_range(handle, cRange, buf.baseAddress, buf.count)
      }
    }
    onSelectedRangeChanged?(selectedUtf16Range)
  }

  var selectedTextRange: UITextRange? {
    get {
      AffineTextRange(utf16Range: clampRange(selectedUtf16Range))
    }
    set {
      if let affineRange = newValue as? AffineTextRange {
        let clamped = clampRange(affineRange.utf16Range)
        selectedUtf16Range = clamped
        if let handle = hostHandle {
          affine_ios_host_set_selected_range(
            handle,
            AffineUtf16Range(location: UInt32(clamped.location), length: UInt32(clamped.length))
          )
        }
        onSelectedRangeChanged?(clamped)
      }
    }
  }

  var markedTextRange: UITextRange? {
    markedUtf16Range.map { AffineTextRange(utf16Range: clampRange($0)) }
  }

  var markedTextStyle: [NSAttributedString.Key: Any]?

  func setMarkedText(_ markedText: String?, selectedRange: NSRange) {
    let text = markedText ?? ""
    let targetRange = clampRange(markedUtf16Range ?? selectedUtf16Range)
    backingText = backingText.replacingCharacters(in: targetRange, with: text) as NSString
    let utf16 = Array(text.utf16)
    let utf16Len = utf16.count
    let clampedLoc = max(0, min(selectedRange.location, utf16Len))
    let clampedLen = max(0, min(selectedRange.length, utf16Len - clampedLoc))
    if utf16Len > 0 {
      markedUtf16Range = NSRange(location: targetRange.location, length: utf16Len)
      selectedUtf16Range = NSRange(
        location: targetRange.location + clampedLoc,
        length: clampedLen
      )
    } else {
      markedUtf16Range = nil
      selectedUtf16Range = NSRange(location: targetRange.location, length: 0)
    }
    if let handle = hostHandle {
      let cRange = AffineUtf16Range(location: UInt32(clampedLoc), length: UInt32(clampedLen))
      utf16.withUnsafeBufferPointer { buf in
        affine_ios_host_set_marked_text(handle, buf.baseAddress, buf.count, cRange)
      }
    }
    onSelectedRangeChanged?(selectedUtf16Range)
  }

  func unmarkText() {
    markedUtf16Range = nil
    if let handle = hostHandle {
      affine_ios_host_unmark_text(handle)
    }
  }

  var beginningOfDocument: UITextPosition {
    AffineTextPosition(utf16Offset: 0)
  }

  var endOfDocument: UITextPosition {
    AffineTextPosition(utf16Offset: backingText.length)
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
    let next = pos.utf16Offset + offset
    guard next >= 0 && next <= backingText.length else {
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
    switch direction {
    case .left, .up:
      return AffineTextRange(utf16Range: clampRange(NSRange(location: 0, length: pos.utf16Offset)))
    case .right, .down:
      return AffineTextRange(
        utf16Range: clampRange(
          NSRange(location: pos.utf16Offset, length: max(0, backingText.length - pos.utf16Offset))
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
    let len = backingText.length
    guard len > 0 else {
      return AffineTextRange(utf16Range: NSRange(location: 0, length: 0))
    }
    let idx = min(pos.utf16Offset, len - 1)
    let cluster = backingText.rangeOfComposedCharacterSequence(at: idx)
    return AffineTextRange(utf16Range: cluster)
  }

  private func clampRange(_ range: NSRange) -> NSRange {
    let maxLen = backingText.length
    let loc = max(0, min(range.location, maxLen))
    let len = max(0, min(range.length, maxLen - loc))
    return NSRange(location: loc, length: len)
  }
}

final class MetalHostViewController: UIViewController, UIEditMenuInteractionDelegate {
  private let hostView = MetalHostView()
  private let textPreviewView = HostTextPreviewView()
  private let selectionOverlayView = SelectionOverlayView()
  private let keyboardAvoidanceCoordinator = KeyboardAvoidanceCoordinator()
  private let pdfRendererBridge = PdfRendererBridge()
  private let textRenderingBridge = TextRenderingBridge()
  private let hapticsBridge = HapticsBridge()
  private let bootstrapCoordinator = HostBootstrapCoordinator()
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
  private var metalDevice: MTLDevice?
  private var commandQueue: MTLCommandQueue?
  private var displayLink: CADisplayLink?
  private var displayLinkProxy: DisplayLinkProxy?

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
    view = hostView
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    configureMetalLayer()
    let scale = Float(view.window?.screen.scale ?? UIScreen.main.scale)
    let rawLayer = Unmanaged.passUnretained(hostView.metalLayer).toOpaque()
    let handle = affine_ios_host_create(
      rawLayer,
      Float(view.bounds.width),
      Float(view.bounds.height),
      scale
    )
    hostHandle = handle
    hostView.hostHandle = handle
    applyClearColor(TextRenderingBridge.defaultClearColorRgba)
    textPreviewView.renderer = textRenderingBridge
    textPreviewView.frame = hostView.bounds
    textPreviewView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    hostView.addSubview(textPreviewView)

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
      if let rect = anchorRect {
        let config = UIEditMenuConfiguration(
          identifier: nil,
          sourcePoint: CGPoint(x: rect.midX, y: rect.minY)
        )
        interaction.presentEditMenu(with: config)
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
    sampleInsets(timestamp: CACurrentMediaTime())
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let scale = view.window?.screen.scale ?? UIScreen.main.scale
    hostView.metalLayer.contentsScale = scale
    hostView.metalLayer.drawableSize = CGSize(
      width: view.bounds.width * scale,
      height: view.bounds.height * scale
    )
    textPreviewView.frame = hostView.bounds
    selectionOverlayView.frame = hostView.bounds
    if let handle = hostHandle {
      affine_ios_host_resize(
        handle,
        Float(view.bounds.width),
        Float(view.bounds.height),
        Float(scale)
      )
    }
    sampleInsets(timestamp: CACurrentMediaTime())
    refreshTextPreview()
    let currentRange = hostView.currentSelectedUtf16Range
    if currentRange.length > 0 {
      syncSelectionOverlay(for: currentRange)
    } else {
      selectionOverlayView.refreshFromHost()
    }
  }

  deinit {
    displayLink?.invalidate()
    keyboardAvoidanceCoordinator.stopObserving()
    keyboardAvoidanceCoordinator.hostHandle = nil
    NotificationCenter.default.removeObserver(self)
    hostView.hostHandle = nil
    selectionOverlayView.hostHandle = nil
    if let handle = hostHandle {
      textRenderingBridge.detach()
      pdfRendererBridge.detach(from: handle)
      hapticsBridge.detach(from: handle)
      affine_ios_host_destroy(handle)
      hostHandle = nil
    }
  }

  private func applyClearColor(_ rgba: UInt32) {
    let bg = textRenderingBridge.applyClearColorRgba(rgba)
    if hostView.backgroundColor != bg {
      hostView.backgroundColor = bg
      textPreviewView.setNeedsDisplay()
    }
  }

  private func refreshTextPreview() {
    textPreviewView.utf16Units = hostView.currentBackingUtf16Units
    textPreviewView.selectedRange = hostView.currentSelectedUtf16Range
    textPreviewView.hostInsets = lastSyncedInsets
  }

  private func syncSelectionOverlay(for range: NSRange) {
    refreshTextPreview()
    guard let handle = hostHandle else {
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
    presentedMenuAnchorRect ?? .null
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
      refreshTextPreview()
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

  private func configureMetalLayer() {
    let device = MTLCreateSystemDefaultDevice()
    metalDevice = device
    commandQueue = device?.makeCommandQueue()
    hostView.metalLayer.device = device
    hostView.metalLayer.pixelFormat = .bgra8Unorm
    hostView.metalLayer.framebufferOnly = true
    hostView.metalLayer.isOpaque = true
  }

  private func startDisplayLink() {
    let proxy = DisplayLinkProxy(target: self)
    displayLinkProxy = proxy
    let link = CADisplayLink(target: proxy, selector: #selector(DisplayLinkProxy.onDisplayLink(_:)))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  func handleDisplayLinkTick(_ link: CADisplayLink) {
    sampleInsets(timestamp: link.timestamp)
    guard
      let handle = hostHandle,
      affine_ios_host_is_dirty(handle),
      let queue = commandQueue,
      let drawable = hostView.metalLayer.nextDrawable(),
      let commandBuffer = queue.makeCommandBuffer()
    else {
      return
    }
    let clearRgba = affine_ios_host_render_frame(handle, link.timestamp)
    guard clearRgba != 0 else {
      return
    }
    applyClearColor(clearRgba)
    let red = Double((clearRgba >> 24) & 0xFF) / 255.0
    let green = Double((clearRgba >> 16) & 0xFF) / 255.0
    let blue = Double((clearRgba >> 8) & 0xFF) / 255.0
    let alpha = Double(clearRgba & 0xFF) / 255.0
    let pass = MTLRenderPassDescriptor()
    pass.colorAttachments[0].texture = drawable.texture
    pass.colorAttachments[0].loadAction = .clear
    pass.colorAttachments[0].storeAction = .store
    pass.colorAttachments[0].clearColor = MTLClearColor(
      red: red,
      green: green,
      blue: blue,
      alpha: alpha
    )
    guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: pass) else {
      affine_ios_host_request_frame(handle)
      return
    }
    encoder.endEncoding()
    commandBuffer.present(drawable)
    commandBuffer.commit()
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
  }

  @objc private func handleDidEnterBackground() {
    displayLink?.isPaused = true
    bootstrapCoordinator.checkpointAllPassive()
  }

  @objc private func handleWillEnterForeground() {
    if let handle = hostHandle {
      affine_ios_host_request_frame(handle)
    }
    displayLink?.isPaused = false
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
      refreshTextPreview()
      if let handle = hostHandle,
        selectionOverlayView.currentState.has_selection
          || selectionOverlayView.lastMenuAnchorRect != nil
      {
        selectionOverlayView.applyOverlayState(affine_ios_host_selection_state(handle))
      }
    }
  }
}
