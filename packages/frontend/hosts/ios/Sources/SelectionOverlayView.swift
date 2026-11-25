import QuartzCore
import UIKit

/// Pure UIKit/CALayer selection overlay rendering native teardrop handles and a circular
/// magnifier loupe driven deterministically by Rust `AffineSelectionOverlayState`.
final class SelectionOverlayView: UIView {
  var hostHandle: OpaquePointer?
  var onSelectionDragResolved: ((CGPoint) -> (targetOffset: UInt32, startCaret: CGRect, endCaret: CGRect))?
  var onMenuAnchorChanged: ((CGRect?) -> Void)?

  private let accentColor = UIColor(red: 0.118, green: 0.588, blue: 0.922, alpha: 1.0)
  private let startHandleLayer = CAShapeLayer()
  private let endHandleLayer = CAShapeLayer()
  private let loupeContainer = UIView()
  private let loupeImageView = UIImageView()
  private let loupeBorderLayer = CAShapeLayer()
  private let panRecognizer = UIPanGestureRecognizer()

  private(set) var currentState = AffineSelectionOverlayState()
  private(set) var lastMenuAnchorRect: CGRect?
  private(set) var lastResolvedProbePoint: CGPoint?

  var loupeSnapshotImage: UIImage? {
    loupeImageView.image
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    configureLayers()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configureLayers()
  }

  private func configureLayers() {
    backgroundColor = .clear
    isOpaque = false

    for shape in [startHandleLayer, endHandleLayer] {
      shape.fillColor = accentColor.cgColor
      shape.strokeColor = accentColor.cgColor
      shape.lineWidth = 0
      shape.shadowColor = UIColor.black.cgColor
      shape.shadowOpacity = 0.18
      shape.shadowRadius = 2.0
      shape.shadowOffset = CGSize(width: 0, height: 1)
      shape.isHidden = true
      layer.addSublayer(shape)
    }

    loupeContainer.backgroundColor = UIColor(white: 1.0, alpha: 0.96)
    loupeContainer.layer.shadowColor = UIColor.black.cgColor
    loupeContainer.layer.shadowOpacity = 0.22
    loupeContainer.layer.shadowRadius = 8.0
    loupeContainer.layer.shadowOffset = CGSize(width: 0, height: 4)
    loupeContainer.isUserInteractionEnabled = false
    loupeContainer.isHidden = true

    loupeImageView.contentMode = .scaleToFill
    loupeImageView.clipsToBounds = true
    loupeImageView.isUserInteractionEnabled = false
    loupeContainer.addSubview(loupeImageView)

    loupeBorderLayer.strokeColor = accentColor.withAlphaComponent(0.85).cgColor
    loupeBorderLayer.fillColor = UIColor.clear.cgColor
    loupeBorderLayer.lineWidth = 2.0
    loupeContainer.layer.addSublayer(loupeBorderLayer)
    addSubview(loupeContainer)

    panRecognizer.addTarget(self, action: #selector(handlePanGesture(_:)))
    panRecognizer.maximumNumberOfTouches = 1
    addGestureRecognizer(panRecognizer)
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    guard let handle = hostHandle else {
      return false
    }
    let hit = affine_ios_host_selection_hit_test(
      handle,
      AffinePoint(x: Float(point.x), y: Float(point.y)),
      22.0
    )
    return hit != 0 || currentState.active_drag_handle != 0
  }

  /// Sync UIKit layers from the latest Rust `AffineSelectionOverlayState`.
  func refreshFromHost() {
    guard let handle = hostHandle else {
      return
    }
    applyOverlayState(affine_ios_host_selection_state(handle))
  }

  /// Apply a computed Rust overlay state snapshot to the teardrop and loupe layers.
  func applyOverlayState(_ state: AffineSelectionOverlayState) {
    currentState = state
    updateHandleLayer(startHandleLayer, layout: state.start_handle)
    updateHandleLayer(endHandleLayer, layout: state.end_handle)
    updateLoupe(layout: state.loupe)

    let nextAnchor: CGRect? = state.show_floating_menu
      ? CGRect(
        x: CGFloat(state.menu_anchor_rect.x),
        y: CGFloat(state.menu_anchor_rect.y),
        width: CGFloat(state.menu_anchor_rect.width),
        height: CGFloat(state.menu_anchor_rect.height)
      )
      : nil
    if nextAnchor != lastMenuAnchorRect {
      lastMenuAnchorRect = nextAnchor
      onMenuAnchorChanged?(nextAnchor)
    }
  }

  /// Deterministic drag step entry point used by both `UIPanGestureRecognizer` and smoke tests.
  @discardableResult
  func processDragStep(
    phase: UIGestureRecognizer.State,
    point: CGPoint
  ) -> AffineSelectionOverlayState? {
    guard let handle = hostHandle else {
      return nil
    }
    let cPoint = AffinePoint(x: Float(point.x), y: Float(point.y))
    switch phase {
    case .began:
      let hit = affine_ios_host_selection_hit_test(handle, cPoint, 22.0)
      guard hit != 0 else {
        return nil
      }
      _ = affine_ios_host_selection_begin_drag(handle, hit, cPoint)
      let state = affine_ios_host_selection_state(handle)
      lastResolvedProbePoint = CGPoint(
        x: CGFloat(state.drag_probe_point.x),
        y: CGFloat(state.drag_probe_point.y)
      )
      applyOverlayState(state)
      return state

    case .changed:
      // Apply Rust's recorded `grab_offset` so holding the teardrop center with 0pt
      // movement probes the exact caret midpoint without jumping to the adjacent line.
      let cProbe = affine_ios_host_selection_drag_probe(handle, cPoint)
      let probePoint = CGPoint(x: CGFloat(cProbe.x), y: CGFloat(cProbe.y))
      lastResolvedProbePoint = probePoint
      let state: AffineSelectionOverlayState
      if let resolver = onSelectionDragResolved {
        let resolved = resolver(probePoint)
        let cStart = AffineRect(
          x: Float(resolved.startCaret.origin.x),
          y: Float(resolved.startCaret.origin.y),
          width: Float(resolved.startCaret.size.width),
          height: Float(resolved.startCaret.size.height)
        )
        let cEnd = AffineRect(
          x: Float(resolved.endCaret.origin.x),
          y: Float(resolved.endCaret.origin.y),
          width: Float(resolved.endCaret.size.width),
          height: Float(resolved.endCaret.size.height)
        )
        state = affine_ios_host_selection_apply_drag_endpoints(
          handle,
          cPoint,
          resolved.targetOffset,
          cStart,
          cEnd
        )
      } else {
        let activeHeight = max(
          1.0,
          CGFloat(
            currentState.active_drag_handle == 1
              ? (currentState.start_handle.stem_bottom_y - currentState.start_handle.stem_top_y)
              : (currentState.end_handle.stem_bottom_y - currentState.end_handle.stem_top_y)
          )
        )
        let cCaret = AffineRect(
          x: Float(probePoint.x - 1.0),
          y: Float(probePoint.y - activeHeight * 0.5),
          width: 2.0,
          height: Float(activeHeight)
        )
        state = affine_ios_host_selection_update_drag(handle, cPoint, cCaret, currentState.range)
      }
      applyOverlayState(state)
      return state

    case .ended, .cancelled, .failed:
      let state = affine_ios_host_selection_end_drag(handle)
      lastResolvedProbePoint = nil
      applyOverlayState(state)
      return state

    default:
      return nil
    }
  }

  @objc private func handlePanGesture(_ recognizer: UIPanGestureRecognizer) {
    let location = recognizer.location(in: self)
    _ = processDragStep(phase: recognizer.state, point: location)
  }

  private func updateHandleLayer(_ shape: CAShapeLayer, layout: AffineTeardropHandleLayout) {
    guard layout.visible else {
      shape.isHidden = true
      shape.path = nil
      return
    }
    shape.isHidden = false
    let path = CGMutablePath()
    let stemW = CGFloat(max(layout.stem_width, 1.0))
    let stemX = CGFloat(layout.stem_x)
    let stemTopY = CGFloat(layout.stem_top_y)
    let stemBottomY = CGFloat(layout.stem_bottom_y)
    let stemRect = CGRect(
      x: stemX - stemW * 0.5,
      y: stemTopY,
      width: stemW,
      height: max(1.0, stemBottomY - stemTopY)
    )
    path.addRoundedRect(in: stemRect, cornerWidth: stemW * 0.5, cornerHeight: stemW * 0.5)

    // Native iOS handle bulb aligned cleanly on `stem_x` and fused to the stem tip.
    let r = CGFloat(max(layout.drop_radius, 1.0))
    let dropCenterY = layout.drop_above ? (stemTopY - r + 1.0) : (stemBottomY + r - 1.0)
    let dropRect = CGRect(
      x: stemX - r,
      y: dropCenterY - r,
      width: r * 2.0,
      height: r * 2.0
    )
    path.addEllipse(in: dropRect)
    shape.path = path
  }

  private func updateLoupe(layout: AffineLoupeLayout) {
    guard layout.visible else {
      loupeContainer.isHidden = true
      loupeImageView.image = nil
      return
    }
    let diameter = CGFloat(max(layout.diameter, 1.0))
    let radius = diameter * 0.5
    let zoom = max(layout.zoom_scale, 1.0)
    loupeContainer.isHidden = false
    loupeContainer.frame = CGRect(
      x: CGFloat(layout.center_x) - radius,
      y: CGFloat(layout.center_y) - radius,
      width: diameter,
      height: diameter
    )
    loupeContainer.layer.cornerRadius = radius
    let inset: CGFloat = 2.0
    loupeImageView.frame = CGRect(
      x: inset,
      y: inset,
      width: max(1.0, diameter - inset * 2.0),
      height: max(1.0, diameter - inset * 2.0)
    )
    loupeImageView.layer.cornerRadius = max(0.0, radius - inset)
    loupeBorderLayer.path = UIBezierPath(
      ovalIn: CGRect(x: 1.0, y: 1.0, width: max(1.0, diameter - 2.0), height: max(1.0, diameter - 2.0))
    ).cgPath

    // Render Retina-resolution anti-aliased loupe via Rust C-ABI + native CoreText provider.
    if let handle = hostHandle {
      let scale = max(window?.screen.scale ?? UIScreen.main.scale, 2.0)
      let dimPx = max(32, min(512, UInt32((diameter * scale).rounded())))
      let effectiveZoom = zoom * Float(scale)
      let buf = affine_ios_host_render_loupe_rgba8(
        handle,
        layout.focus_x,
        layout.focus_y,
        dimPx,
        effectiveZoom
      )
      defer { affine_ios_bytes_free(buf) }
      if let ptr = buf.ptr, buf.len == Int(dimPx * dimPx * 4) {
        let data = Data(bytes: ptr, count: buf.len)
        if let provider = CGDataProvider(data: data as CFData),
          let cgImage = CGImage(
            width: Int(dimPx),
            height: Int(dimPx),
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: Int(dimPx) * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(
              rawValue: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
            ),
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
          )
        {
          loupeImageView.image = UIImage(cgImage: cgImage, scale: scale, orientation: .up)
        }
      }
    }
  }
}
