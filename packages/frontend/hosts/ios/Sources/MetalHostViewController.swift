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

  private var backingText: NSString = ""
  private var selectedUtf16Range = NSRange(location: 0, length: 0)
  private var markedUtf16Range: NSRange?

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
    .natural
  }

  func setBaseWritingDirection(_ writingDirection: NSWritingDirection, for range: UITextRange) {}

  func firstRect(for range: UITextRange) -> CGRect {
    .zero
  }

  func caretRect(for position: UITextPosition) -> CGRect {
    .zero
  }

  func selectionRects(for range: UITextRange) -> [UITextSelectionRect] {
    []
  }

  func closestPosition(to point: CGPoint) -> UITextPosition? {
    endOfDocument
  }

  func closestPosition(to point: CGPoint, within range: UITextRange) -> UITextPosition? {
    range.end
  }

  func characterRange(at point: CGPoint) -> UITextRange? {
    nil
  }

  private func clampRange(_ range: NSRange) -> NSRange {
    let maxLen = backingText.length
    let loc = max(0, min(range.location, maxLen))
    let len = max(0, min(range.length, maxLen - loc))
    return NSRange(location: loc, length: len)
  }
}

final class MetalHostViewController: UIViewController {
  private let hostView = MetalHostView()
  private let bootstrapCoordinator = HostBootstrapCoordinator()
  private(set) var lastBootstrapError: Error?
  private var bootstrapCompleted = false
  private var hostHandle: OpaquePointer?
  private var metalDevice: MTLDevice?
  private var commandQueue: MTLCommandQueue?
  private var displayLink: CADisplayLink?
  private var displayLinkProxy: DisplayLinkProxy?
  private var keyboardOverlapHeight: CGFloat = 0
  private var lastInsets = AffineWindowInsets(
    safe_top: 0,
    safe_right: 0,
    safe_bottom: 0,
    safe_left: 0,
    ime_bottom: 0
  )

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
    publishInsetsIfChanged()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let scale = view.window?.screen.scale ?? UIScreen.main.scale
    hostView.metalLayer.contentsScale = scale
    hostView.metalLayer.drawableSize = CGSize(
      width: view.bounds.width * scale,
      height: view.bounds.height * scale
    )
    if let handle = hostHandle {
      affine_ios_host_resize(
        handle,
        Float(view.bounds.width),
        Float(view.bounds.height),
        Float(scale)
      )
    }
    publishInsetsIfChanged()
  }

  deinit {
    displayLink?.invalidate()
    NotificationCenter.default.removeObserver(self)
    hostView.hostHandle = nil
    if let handle = hostHandle {
      affine_ios_host_destroy(handle)
      hostHandle = nil
    }
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
    publishInsetsIfChanged()
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
      selector: #selector(handleKeyboardFrameChange(_:)),
      name: UIResponder.keyboardWillChangeFrameNotification,
      object: nil
    )
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

  @objc private func handleKeyboardFrameChange(_ notification: Notification) {
    guard
      let userInfo = notification.userInfo,
      let endFrame = userInfo[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
    else {
      return
    }
    let converted: CGRect
    if let window = view.window {
      converted = view.convert(endFrame, from: window.screen.coordinateSpace)
    } else {
      converted = view.convert(endFrame, from: nil)
    }
    let intersection = view.bounds.intersection(converted)
    keyboardOverlapHeight = intersection.isNull ? 0 : max(0, intersection.height)
    publishInsetsIfChanged()
  }

  private func publishInsetsIfChanged() {
    let safe = view.safeAreaInsets
    let absoluteImeBottom = max(0, keyboardOverlapHeight)
    let next = AffineWindowInsets(
      safe_top: Float(safe.top),
      safe_right: Float(safe.right),
      safe_bottom: Float(safe.bottom),
      safe_left: Float(safe.left),
      ime_bottom: Float(absoluteImeBottom)
    )
    if next.safe_top != lastInsets.safe_top
      || next.safe_right != lastInsets.safe_right
      || next.safe_bottom != lastInsets.safe_bottom
      || next.safe_left != lastInsets.safe_left
      || next.ime_bottom != lastInsets.ime_bottom
    {
      lastInsets = next
      if let handle = hostHandle {
        affine_ios_host_set_insets(handle, next)
      }
    }
  }
}
