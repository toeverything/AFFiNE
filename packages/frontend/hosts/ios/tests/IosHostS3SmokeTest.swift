import CoreGraphics
import Foundation
import PDFKit
import UIKit

func requireS3(_ condition: Bool, _ message: String) {
  if !condition {
    fputs("FAIL: \(message)\n", stderr)
    exit(1)
  }
}

/// Build a valid 4-page PDF 1.4 document with exact quadrant colors:
/// - Page 0: Normal 200x300 MediaBox [0 0 200 300]
/// - Page 1: /Rotate 90 on 200x300 (displayed size 300x200)
/// - Page 2: Non-zero MediaBox origin [100 100 300 400] (size 200x300)
/// - Page 3: CropBox top-right quarter [100 150 200 300] (size 100x150, pure yellow)
func buildFourPageGeometryTestPdf() -> Data {
  func quadrantStream(originX: Int, originY: Int) -> String {
    let x0 = originX
    let x1 = originX + 100
    let y0 = originY
    let y1 = originY + 150
    // Bottom-left: Red, Bottom-right: Green, Top-left: Blue, Top-right: Yellow
    return """
      1 0 0 rg \(x0) \(y0) 100 150 re f
      0 1 0 rg \(x1) \(y0) 100 150 re f
      0 0 1 rg \(x0) \(y1) 100 150 re f
      1 1 0 rg \(x1) \(y1) 100 150 re f
      """
  }

  let s0 = quadrantStream(originX: 0, originY: 0)
  let s1 = quadrantStream(originX: 0, originY: 0)
  let s2 = quadrantStream(originX: 100, originY: 100)
  let s3 = quadrantStream(originX: 0, originY: 0)

  let objects: [String] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R] /Count 4 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Contents 4 0 R >>\nendobj\n",
    "4 0 obj\n<< /Length \(s0.utf8.count) >>\nstream\n\(s0)\nendstream\nendobj\n",
    "5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Rotate 90 /Contents 6 0 R >>\nendobj\n",
    "6 0 obj\n<< /Length \(s1.utf8.count) >>\nstream\n\(s1)\nendstream\nendobj\n",
    "7 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [100 100 300 400] /Contents 8 0 R >>\nendobj\n",
    "8 0 obj\n<< /Length \(s2.utf8.count) >>\nstream\n\(s2)\nendstream\nendobj\n",
    "9 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /CropBox [100 150 200 300] /Contents 10 0 R >>\nendobj\n",
    "10 0 obj\n<< /Length \(s3.utf8.count) >>\nstream\n\(s3)\nendstream\nendobj\n",
  ]

  var pdf = "%PDF-1.4\n"
  var offsets: [Int] = [0]
  for obj in objects {
    offsets.append(pdf.utf8.count)
    pdf += obj
  }
  let xrefStart = pdf.utf8.count
  pdf += "xref\n0 \(objects.count + 1)\n"
  pdf += "0000000000 65535 f \n"
  for off in offsets.dropFirst() {
    pdf += String(format: "%010d 00000 n \n", off)
  }
  pdf += "trailer\n<< /Size \(objects.count + 1) /Root 1 0 R >>\nstartxref\n\(xrefStart)\n%%EOF\n"
  return Data(pdf.utf8)
}

func pixelAt(_ rgba: Data, width: Int, x: Int, y: Int) -> (UInt8, UInt8, UInt8, UInt8) {
  let base = (y * width + x) * 4
  return rgba.withUnsafeBytes { raw in
    let bytes = raw.bindMemory(to: UInt8.self)
    return (bytes[base], bytes[base + 1], bytes[base + 2], bytes[base + 3])
  }
}

func assertColor(_ px: (UInt8, UInt8, UInt8, UInt8), r: Bool, g: Bool, b: Bool, _ label: String) {
  let okR = r ? px.0 > 200 : px.0 < 55
  let okG = g ? px.1 > 200 : px.1 < 55
  let okB = b ? px.2 > 200 : px.2 < 55
  requireS3(okR && okG && okB && px.3 == 255, "\(label): unexpected RGBA \(px)")
}

@main
struct IosHostS3SmokeTest {
  @MainActor
  static func main() {
    do {
      try testPdfKitFourPageGeometryAndGuards()
      testTouchOwnershipPartitionAndReadonlyDocPositions()
      testKeyboardAvoidancePerFrameSlideOverAndBackgroundResume()
      testHapticsBridgeDispatchAndBoundedHistory()
      testMetalHostViewControllerEndToEndTextSelectionDragCopyAndMenu()
      testS6NativeEditorMountImeAndStageOneReadonly()
      print("ALL 6 SWIFT+RUST S3/S6-IOS SMOKE TESTS PASSED")
    } catch {
      fputs("UNHANDLED ERROR: \(error)\n", stderr)
      exit(1)
    }
  }

  /// 1. Real PDFKit 4-page geometry (Normal, /Rotate 90, non-zero MediaBox, CropBox),
  ///    URL scheme guard, 64-bit overflow guard, and zero-copy C-ABI provider.
  static func testPdfKitFourPageGeometryAndGuards() throws {
    let pdfBytes = buildFourPageGeometryTestPdf()
    let bridge = PdfRendererBridge()

    let handle = try bridge.open(data: pdfBytes)
    requireS3(handle.pageCount == 4, "expected pageCount == 4, got \(handle.pageCount)")

    // Page 0: Normal 200x300 (top-left Blue, top-right Yellow, bottom-left Red, bottom-right Green).
    let size0 = try bridge.pageSizePoints(of: handle, pageIndex: 0)
    requireS3(abs(size0.width - 200) < 0.5 && abs(size0.height - 300) < 0.5, "page 0 size \(size0)")
    let p0 = try bridge.renderPageRgba8(of: handle, pageIndex: 0, targetWidthPx: 100, targetHeightPx: 150)
    assertColor(pixelAt(p0.rgba8, width: 100, x: 25, y: 37), r: false, g: false, b: true, "page0 top-left blue")
    assertColor(pixelAt(p0.rgba8, width: 100, x: 75, y: 37), r: true, g: true, b: false, "page0 top-right yellow")
    assertColor(pixelAt(p0.rgba8, width: 100, x: 25, y: 112), r: true, g: false, b: false, "page0 bottom-left red")
    assertColor(pixelAt(p0.rgba8, width: 100, x: 75, y: 112), r: false, g: true, b: false, "page0 bottom-right green")

    // Page 1: /Rotate 90 -> displayed size 300x200; 90 deg CW:
    // top-left=Red, top-right=Blue, bottom-left=Green, bottom-right=Yellow.
    let size1 = try bridge.pageSizePoints(of: handle, pageIndex: 1)
    requireS3(abs(size1.width - 300) < 0.5 && abs(size1.height - 200) < 0.5, "page 1 rotated size \(size1)")
    let p1 = try bridge.renderPageRgba8(of: handle, pageIndex: 1, targetWidthPx: 150, targetHeightPx: 100)
    assertColor(pixelAt(p1.rgba8, width: 150, x: 37, y: 25), r: true, g: false, b: false, "page1 rotated top-left red")
    assertColor(pixelAt(p1.rgba8, width: 150, x: 112, y: 25), r: false, g: false, b: true, "page1 rotated top-right blue")
    assertColor(pixelAt(p1.rgba8, width: 150, x: 37, y: 75), r: false, g: true, b: false, "page1 rotated bottom-left green")
    assertColor(pixelAt(p1.rgba8, width: 150, x: 112, y: 75), r: true, g: true, b: false, "page1 rotated bottom-right yellow")

    // Page 2: Non-zero MediaBox origin (100, 100) -> all 4 quadrants must match Page 0 (not all-white!).
    let size2 = try bridge.pageSizePoints(of: handle, pageIndex: 2)
    requireS3(abs(size2.width - 200) < 0.5 && abs(size2.height - 300) < 0.5, "page 2 size \(size2)")
    let p2 = try bridge.renderPageRgba8(of: handle, pageIndex: 2, targetWidthPx: 100, targetHeightPx: 150)
    assertColor(pixelAt(p2.rgba8, width: 100, x: 25, y: 37), r: false, g: false, b: true, "page2 origin top-left blue")
    assertColor(pixelAt(p2.rgba8, width: 100, x: 75, y: 37), r: true, g: true, b: false, "page2 origin top-right yellow")
    assertColor(pixelAt(p2.rgba8, width: 100, x: 25, y: 112), r: true, g: false, b: false, "page2 origin bottom-left red")
    assertColor(pixelAt(p2.rgba8, width: 100, x: 75, y: 112), r: false, g: true, b: false, "page2 origin bottom-right green")

    // Page 3: CropBox [100 150 200 300] -> size 100x150, entire page is yellow.
    let size3 = try bridge.pageSizePoints(of: handle, pageIndex: 3)
    requireS3(abs(size3.width - 100) < 0.5 && abs(size3.height - 150) < 0.5, "page 3 cropBox size \(size3)")
    let p3 = try bridge.renderPageRgba8(of: handle, pageIndex: 3, targetWidthPx: 60, targetHeightPx: 90)
    assertColor(pixelAt(p3.rgba8, width: 60, x: 15, y: 20), r: true, g: true, b: false, "page3 cropBox top-left yellow")
    assertColor(pixelAt(p3.rgba8, width: 60, x: 45, y: 70), r: true, g: true, b: false, "page3 cropBox bottom-right yellow")

    // Controlled local file open + non-file URL scheme guard + path traversal guard.
    let tmpDir = FileManager.default.temporaryDirectory.appendingPathComponent("s3-ios-pdf-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmpDir) }
    let fileURL = tmpDir.appendingPathComponent("sample.pdf")
    try pdfBytes.write(to: fileURL)
    let fileHandle = try bridge.open(fileURL: fileURL, allowedDirectory: tmpDir)
    requireS3(fileHandle.pageCount == 4, "file-opened PDF must have pageCount == 4")

    do {
      _ = try bridge.open(fileURL: URL(string: "https://example.com/a.pdf")!, allowedDirectory: tmpDir)
      requireS3(false, "non-file URL must be rejected")
    } catch PdfRendererError.invalidArgument {}

    do {
      _ = try bridge.open(fileURL: tmpDir.appendingPathComponent("../escape.pdf"), allowedDirectory: tmpDir)
      requireS3(false, "path outside allowed directory must be rejected")
    } catch PdfRendererError.pathOutsideAllowedDirectory {}

    // Error guards: negative page index -> pageOutOfRange, >UInt32.max dimension -> pixelLimitExceeded.
    do {
      _ = try bridge.renderPageRgba8(of: handle, pageIndex: -1, targetWidthPx: 64, targetHeightPx: 64)
      requireS3(false, "negative pageIndex must throw pageOutOfRange")
    } catch PdfRendererError.pageOutOfRange {}

    do {
      _ = try bridge.renderPageRgba8(of: handle, pageIndex: 0, targetWidthPx: Int(UInt32.max) + 10, targetHeightPx: 64)
      requireS3(false, "64-bit overflow width must throw pixelLimitExceeded without trapping")
    } catch PdfRendererError.pixelLimitExceeded {}

    do {
      _ = try bridge.open(data: Data())
      requireS3(false, "empty PDF must fail")
    } catch PdfRendererError.emptyDocument {}

    // Zero-copy C-ABI roundtrip via registered AffinePdfProvider.
    let host = affine_ios_host_create(nil, 390.0, 844.0, 3.0)
    requireS3(host != nil, "host create failed")
    defer {
      bridge.detach(from: host!)
      affine_ios_host_destroy(host)
    }
    bridge.attach(to: host!)
    var errCode: UInt32 = 99
    let cCount = pdfBytes.withUnsafeBytes { raw in
      affine_ios_host_pdf_page_count(host, raw.bindMemory(to: UInt8.self).baseAddress, pdfBytes.count, &errCode)
    }
    requireS3(errCode == 0 && cCount == 4, "C-ABI pdf_page_count expected 4, got \(cCount) (err \(errCode))")

    let cBuf = pdfBytes.withUnsafeBytes { raw in
      affine_ios_host_pdf_render_page_rgba8(
        host,
        raw.bindMemory(to: UInt8.self).baseAddress,
        pdfBytes.count,
        1,
        150,
        100,
        &errCode
      )
    }
    defer { affine_ios_bytes_free(cBuf) }
    requireS3(errCode == 0 && cBuf.len == 150 * 100 * 4 && cBuf.ptr != nil, "C-ABI rotated render failed")
    let cRgba = Data(bytes: cBuf.ptr!, count: cBuf.len)
    assertColor(pixelAt(cRgba, width: 150, x: 37, y: 25), r: true, g: false, b: false, "C-ABI page1 rotated top-left red")

    // ABA / same-length, identical-header-and-tail, different-middle-stream cache isolation test.
    func makeSingleColorPdf(colorOp: String) -> Data {
      let padding = String(repeating: " ", count: 80)
      let stream = "\(padding)\n\(colorOp) 0 0 100 100 re f\n\(padding)"
      let objs = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>\nendobj\n",
        "4 0 obj\n<< /Length \(stream.utf8.count) >>\nstream\n\(stream)\nendstream\nendobj\n",
      ]
      var out = "%PDF-1.4\n"
      var offs = [0]
      for o in objs {
        offs.append(out.utf8.count)
        out += o
      }
      let xrefPos = out.utf8.count
      out += "xref\n0 5\n0000000000 65535 f \n"
      for off in offs.dropFirst() {
        out += String(format: "%010d 00000 n \n", off)
      }
      out += "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n\(xrefPos)\n%%EOF\n"
      return Data(out.utf8)
    }

    let pdfRed = makeSingleColorPdf(colorOp: "1 0 0 rg")
    let pdfBlue = makeSingleColorPdf(colorOp: "0 0 1 rg")
    requireS3(pdfRed.count == pdfBlue.count, "ABA test PDFs must have identical byte length")
    requireS3(pdfRed.prefix(64) == pdfBlue.prefix(64) && pdfRed.suffix(64) == pdfBlue.suffix(64), "ABA test PDFs must share identical first & last 64 bytes")

    // Explicit PDF handle lifecycle (open -> doc_page_count -> doc_page_size -> doc_render_page_rgba8 -> close).
    let docId = pdfBytes.withUnsafeBytes { raw in
      affine_ios_host_pdf_open(host, raw.bindMemory(to: UInt8.self).baseAddress, pdfBytes.count, &errCode)
    }
    requireS3(errCode == 0 && docId != 0 && bridge.openDocumentCount == 1, "explicit pdf_open failed")
    let docCount = affine_ios_host_pdf_doc_page_count(host, docId, &errCode)
    requireS3(errCode == 0 && docCount == 4, "explicit doc_page_count expected 4, got \(docCount)")
    var docPageSize = AffinePdfPageSize()
    let gotSize = affine_ios_host_pdf_doc_page_size(host, docId, 1, &docPageSize, &errCode)
    requireS3(gotSize && errCode == 0 && abs(docPageSize.width_pt - 300) < 0.5 && abs(docPageSize.height_pt - 200) < 0.5, "explicit doc_page_size rotated mismatch")
    let docBuf = affine_ios_host_pdf_doc_render_page_rgba8(host, docId, 1, 150, 100, &errCode)
    defer { affine_ios_bytes_free(docBuf) }
    requireS3(errCode == 0 && docBuf.len == 150 * 100 * 4 && docBuf.ptr != nil, "explicit doc_render failed")
    assertColor(pixelAt(Data(bytes: docBuf.ptr!, count: docBuf.len), width: 150, x: 37, y: 25), r: true, g: false, b: false, "explicit doc page1 rotated top-left red")
    affine_ios_host_pdf_close(host, docId)
    requireS3(bridge.openDocumentCount == 0, "pdf_close must release PDFDocument immediately")

    // Reuse the exact same mutable buffer address across both stateless C-ABI calls to prove zero UAF / ABA collision.
    var sharedBuf = Array(pdfRed)
    let bufRed = sharedBuf.withUnsafeBufferPointer { ptr in
      affine_ios_host_pdf_render_page_rgba8(host, ptr.baseAddress, ptr.count, 0, 20, 20, &errCode)
    }
    defer { affine_ios_bytes_free(bufRed) }
    requireS3(errCode == 0 && bufRed.len == 20 * 20 * 4 && bufRed.ptr != nil, "ABA red render failed")
    assertColor(pixelAt(Data(bytes: bufRed.ptr!, count: bufRed.len), width: 20, x: 10, y: 10), r: true, g: false, b: false, "ABA PDF A red")

    sharedBuf.replaceSubrange(0..<sharedBuf.count, with: pdfBlue)
    let bufBlue = sharedBuf.withUnsafeBufferPointer { ptr in
      affine_ios_host_pdf_render_page_rgba8(host, ptr.baseAddress, ptr.count, 0, 20, 20, &errCode)
    }
    defer { affine_ios_bytes_free(bufBlue) }
    requireS3(errCode == 0 && bufBlue.len == 20 * 20 * 4 && bufBlue.ptr != nil, "ABA blue render failed")
    assertColor(pixelAt(Data(bytes: bufBlue.ptr!, count: bufBlue.len), width: 20, x: 10, y: 10), r: false, g: false, b: true, "ABA PDF B blue")
    requireS3(bridge.openDocumentCount == 0, "stateless pdf_render must leave zero retained documents")
    print("PASS [1/5]: PDFKit 4-page geometry, URL/overflow guards, explicit handle lifecycle, and ABA isolation passed")
  }

  /// 2. Single-owner `UITextInteractionDelegate` touch partition & side-effect-free document `UITextPosition` model.
  @MainActor
  static func testTouchOwnershipPartitionAndReadonlyDocPositions() {
    let vc = MetalHostViewController()
    vc.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vc.loadViewIfNeeded()
    vc.view.layoutIfNeeded()
    guard let handle = vc.hostPointer else {
      requireS3(false, "hostPointer must be initialized")
      return
    }
    _ = affine_ios_host_render_frame(handle, 1.0)
    let textInteraction = vc.textHostView.interactions.compactMap { $0 as? UITextInteraction }.first
    requireS3(textInteraction != nil && textInteraction?.delegate === vc, "UITextInteraction must bind delegate to MetalHostViewController")

    // Topbar buttons (`Page` / `Edgeless` / `Theme` at y = 26) must bypass UITextInteraction (`interactionShouldBegin == false`).
    requireS3(
      !vc.shouldLetTextInteractionOwnTouch(at: CGPoint(x: 252, y: 26))
        && !vc.shouldLetTextInteractionOwnTouch(at: CGPoint(x: 380, y: 26)),
      "Topbar controls must not be claimed by UITextInteraction"
    )
    // Editable prose in body paragraph (`y = 330`) must be owned by UITextInteraction (`interactionShouldBegin == true`).
    requireS3(
      vc.shouldLetTextInteractionOwnTouch(at: CGPoint(x: 200, y: 330)),
      "Editable prose must be owned by UITextInteraction"
    )

    // Side-effect-free `closestPosition(to:)`: probing `(0, 0)` or another block must NEVER mutate focused block or selection!
    affine_ios_host_reset_empty_doc(handle)
    vc.textHostView.insertText("First block\nSecond block")
    _ = affine_ios_host_render_frame(handle, 1.1)
    let focusedBefore = affine_ios_host_focused_block_order(handle)
    let selBefore = vc.textHostView.currentSelectedUtf16Range
    let probeZero = vc.textHostView.closestPosition(to: .zero) as? AffineTextPosition
    requireS3(
      probeZero != nil
        && affine_ios_host_focused_block_order(handle) == focusedBefore
        && vc.textHostView.currentSelectedUtf16Range == selBefore,
      "closestPosition(to: .zero) must never mutate focused block or selection"
    )

    // Cross-block monotonic comparison: earlier block < later block regardless of block-local utf16Offset.
    let earlierPos = AffineTextPosition(utf16Offset: 10, blockOrder: 1, endpointToken: 0)
    let laterPos = AffineTextPosition(utf16Offset: 2, blockOrder: 2, endpointToken: 0)
    requireS3(
      vc.textHostView.compare(earlierPos, to: laterPos) == .orderedAscending
        && vc.textHostView.compare(laterPos, to: earlierPos) == .orderedDescending,
      "AffineTextPosition.compare must order cross-block positions monotonically"
    )
    print("PASS [2/6]: UITextInteractionDelegate touch partition & side-effect-free document UITextPosition model passed")
  }

  /// 3. KeyboardAvoidanceCoordinator: ui::WindowInsets contract, slide-over overlap_w guard, and background resume timestamp.
  @MainActor
  static func testKeyboardAvoidancePerFrameSlideOverAndBackgroundResume() {
    let host = affine_ios_host_create(nil, 390.0, 844.0, 3.0)
    requireS3(host != nil, "host create failed")
    defer { affine_ios_host_destroy(host) }

    let hostView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let coordinator = KeyboardAvoidanceCoordinator()
    coordinator.hostView = hostView
    coordinator.hostHandle = host

    let safe = UIEdgeInsets(top: 59, left: 0, bottom: 34, right: 0)
    let windowBounds = CGRect(x: 0, y: 0, width: 390, height: 844)
    let dockedKb = CGRect(x: 0, y: 542, width: 390, height: 302)

    let metrics = coordinator.applyKeyboardFrame(
      windowBounds: windowBounds,
      keyboardFrameInView: dockedKb,
      safeAreaInsets: safe,
      isHidden: false,
      durationSec: 0.25,
      timestampSec: 10.0
    )
    requireS3(metrics.ime_bottom_pt == 302.0 && metrics.ime_above_safe_bottom_pt == 268.0 && metrics.effective_bottom_pt == 302.0, "docked metrics mismatch")
    let endFrame = coordinator.sampleDisplayLinkFrame(timestamp: 10.25, safeAreaInsets: safe)
    requireS3(endFrame.ime_bottom == 302.0 && affine_ios_host_ime_above_safe_bottom(host) == 268.0, "end frame mismatch")

    // Slide-over full-width keyboard intersecting only 10pt on the right edge must yield ime_bottom == 0.
    let slideOver = coordinator.applyKeyboardFrame(
      windowBounds: windowBounds,
      keyboardFrameInView: CGRect(x: 380, y: 544, width: 390, height: 300),
      safeAreaInsets: safe,
      isHidden: false,
      durationSec: 0.0,
      timestampSec: 11.0
    )
    requireS3(
      slideOver.is_floating_or_split && slideOver.ime_bottom_pt == 0.0 && slideOver.ime_above_safe_bottom_pt == 0.0,
      "slide-over partial horizontal overlap must yield ime_bottom == 0"
    )

    // Background resume: stale lastDisplayTimestamp = 11.0, now = 500.0; notification must start at 500.0 so frame at 500.05 eases smoothly instead of jumping to 302.
    coordinator.currentTimeProvider = { 500.0 }
    coordinator.startObserving()
    NotificationCenter.default.post(
      name: UIResponder.keyboardWillChangeFrameNotification,
      object: nil,
      userInfo: [
        UIResponder.keyboardFrameEndUserInfoKey: NSValue(cgRect: dockedKb),
        UIResponder.keyboardAnimationDurationUserInfoKey: 0.25,
      ]
    )
    coordinator.stopObserving()
    let firstFrameAfterResume = coordinator.sampleDisplayLinkFrame(timestamp: 500.05, safeAreaInsets: safe)
    requireS3(
      firstFrameAfterResume.ime_bottom > 10.0 && firstFrameAfterResume.ime_bottom < 280.0,
      "first frame after background resume must ease smoothly, got \(firstFrameAfterResume.ime_bottom)"
    )
    print("PASS [3/5]: KeyboardAvoidanceCoordinator WindowInsets contract, slide-over overlap_w guard, and background resume timestamp passed")
  }

  /// 4. HapticsBridge: all 7 patterns dispatch + bounded recordedPatterns ring buffer.
  @MainActor
  static func testHapticsBridgeDispatchAndBoundedHistory() {
    let host = affine_ios_host_create(nil, 390.0, 844.0, 3.0)
    requireS3(host != nil, "host create failed")
    defer { affine_ios_host_destroy(host) }

    let bridge = HapticsBridge()
    bridge.prepareAll()
    bridge.attach(to: host!)
    defer { bridge.detach(from: host!) }

    for pattern in AffineHapticPatternSwift.allCases {
      requireS3(affine_ios_host_trigger_haptic(host, pattern.rawValue), "trigger \(pattern) failed")
      requireS3(affine_ios_host_haptic_count(host, pattern.rawValue) == 1, "count mismatch for \(pattern)")
    }
    requireS3(!affine_ios_host_trigger_haptic(host, 99), "invalid pattern 99 must return false")
    requireS3(affine_ios_host_haptic_total_count(host) == 7, "expected total == 7")
    requireS3(bridge.dispatchedPatterns == AffineHapticPatternSwift.allCases, "recorded patterns mismatch")

    // Verify bounded history cap (never grows beyond maxRecordedPatterns = 64).
    for _ in 0..<80 {
      _ = affine_ios_host_trigger_haptic(host, AffineHapticPatternSwift.selectionChanged.rawValue)
    }
    requireS3(
      bridge.dispatchedPatterns.count == HapticsBridge.maxRecordedPatterns,
      "dispatchedPatterns must stay bounded at \(HapticsBridge.maxRecordedPatterns), got \(bridge.dispatchedPatterns.count)"
    )
    print("PASS [4/5]: HapticsBridge dispatched all 7 patterns and enforced bounded history cap (64)")
  }

  /// 5. End-to-end MetalHostViewController: system UITextInteraction mounted (zero SelectionOverlayView
  ///    subview), document-level GPU selection snapshot, cross-block drag, multi-MIME UIPasteboard
  ///    copy/cut/paste, readonly action_mask gating, BiDi RTL/mixed selectionRects, soft-wrap, and keyboard scroll.
  @MainActor
  static func testMetalHostViewControllerEndToEndTextSelectionDragCopyAndMenu() {
    func makeEmptyEditorVC(width: CGFloat = 390, height: CGFloat = 844) -> MetalHostViewController {
      let controller = MetalHostViewController()
      controller.view.frame = CGRect(x: 0, y: 0, width: width, height: height)
      controller.loadViewIfNeeded()
      controller.view.layoutIfNeeded()
      if let ptr = controller.hostPointer {
        affine_ios_host_reset_empty_doc(ptr)
      }
      return controller
    }

    let vc = makeEmptyEditorVC()
    let hostView = vc.textHostView
    guard let hostPtr = vc.hostPointer else {
      requireS3(false, "MetalHostViewController hostPointer must be initialized")
      return
    }

    // Verify system UITextInteraction is mounted and zero legacy subviews exist on MetalHostView.
    let hasTextInteraction = hostView.interactions.contains { $0 is UITextInteraction }
    requireS3(hasTextInteraction, "MetalHostView must mount system UITextInteraction")
    requireS3(hostView.subviews.isEmpty, "MetalHostView must mount zero custom overlay subviews")

    hostView.insertText("Hello world")
    hostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 5))

    let snapBefore = affine_ios_host_document_selection_snapshot(hostPtr)
    requireS3(snapBefore.has_selection && !snapBefore.is_collapsed, "document snapshot must report active range selection")
    requireS3(snapBefore.start_visible && snapBefore.end_visible, "start and end carets must be visible")
    requireS3(
      snapBefore.start_caret.x > 0 && snapBefore.end_caret.x > snapBefore.start_caret.x + 20.0,
      "document carets must reflect real glyph advance (start=\(snapBefore.start_caret.x), end=\(snapBefore.end_caret.x))"
    )
    requireS3(vc.presentedMenuAnchorRect != nil, "menu anchor rect must be published on range selection")

    // Drag end handle to offset 7 ("Hello w") via document-level drag API.
    let targetCaret7 = hostView.caretRect(for: AffineTextPosition(utf16Offset: 7))
    requireS3(affine_ios_host_doc_selection_begin_drag(hostPtr, 2), "begin end-handle drag must succeed")
    requireS3(
      affine_ios_host_doc_selection_update_drag(hostPtr, Float(targetCaret7.midX), Float(targetCaret7.midY)),
      "update end-handle drag must succeed"
    )
    let snapDuring = affine_ios_host_document_selection_snapshot(hostPtr)
    requireS3(snapDuring.menu_suppressed_for_motion && !snapDuring.menu_anchor_visible, "menu must hide during drag")
    affine_ios_host_doc_selection_end_drag(hostPtr)

    let finalRange = (hostView.selectedTextRange as? AffineTextRange)?.utf16Range
    requireS3(
      finalRange == NSRange(location: 0, length: 7),
      "expected selectedTextRange [0, 7] ('Hello w'), got \(String(describing: finalRange))"
    )
    requireS3(hostView.canPerformAction(#selector(UIResponderStandardEditActions.copy(_:)), withSender: nil), "copy action must be enabled")
    hostView.copy(nil)
    requireS3(hostView.lastCopiedText == "Hello w", "expected copied text 'Hello w', got \(String(describing: hostView.lastCopiedText))")

    // Cut active selection [0, 7] ("Hello w"): remaining text is "orld", copy/cut disabled on collapsed caret.
    hostView.cut(nil)
    let remainingText = hostView.text(in: AffineTextRange(utf16Range: NSRange(location: 0, length: 4)))
    requireS3(remainingText == "orld", "expected remaining text 'orld' after cut, got \(String(describing: remainingText))")
    requireS3(!hostView.canPerformAction(#selector(UIResponderStandardEditActions.copy(_:)), withSender: nil), "copy must be disabled on collapsed caret")
    requireS3(!hostView.canPerformAction(#selector(UIResponderStandardEditActions.cut(_:)), withSender: nil), "cut must be disabled on collapsed caret")

    // External paste from system/host pasteboard inserts into editor.
    MetalHostViewController.seedExternalPasteboard(["text/plain": "EXT"])
    requireS3(hostView.canPerformAction(#selector(UIResponderStandardEditActions.paste(_:)), withSender: nil), "paste must be enabled when pasteboard has text")
    hostView.paste(nil)
    let afterPaste = hostView.text(in: AffineTextRange(utf16Range: NSRange(location: 0, length: 7)))
    requireS3(afterPaste == "EXTorld", "expected 'EXTorld' after external paste, got \(String(describing: afterPaste))")

    // Clearing system/host pasteboard must immediately disable Paste and never resurrect stale text.
    MetalHostViewController.seedExternalPasteboard([:])
    requireS3(
      !hostView.canPerformAction(#selector(UIResponderStandardEditActions.paste(_:)), withSender: nil),
      "paste must be disabled when system pasteboard is cleared"
    )
    hostView.paste(nil)
    let afterEmptyPaste = hostView.text(in: AffineTextRange(utf16Range: NSRange(location: 0, length: 7)))
    requireS3(
      afterEmptyPaste == "EXTorld",
      "paste() on cleared pasteboard must be a no-op (got \(String(describing: afterEmptyPaste)))"
    )
    MetalHostViewController.seedExternalPasteboard(["text/plain": "EXT"])

    // Read-only gating: COPY + SELECT_ALL allowed, CUT + PASTE strictly forbidden,
    // and inputView suppresses the software keyboard while keeping firstResponder active.
    hostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 3))
    affine_ios_host_set_page_readonly(hostPtr, true)
    requireS3(hostView.inputView != nil, "readonly mode must return zero-size empty inputView to suppress software keyboard")
    requireS3(hostView.canPerformAction(#selector(UIResponderStandardEditActions.copy(_:)), withSender: nil), "readonly must allow copy")
    requireS3(!hostView.canPerformAction(#selector(UIResponderStandardEditActions.cut(_:)), withSender: nil), "readonly must forbid cut")
    requireS3(!hostView.canPerformAction(#selector(UIResponderStandardEditActions.paste(_:)), withSender: nil), "readonly must forbid paste")
    affine_ios_host_set_page_readonly(hostPtr, false)
    requireS3(hostView.inputView == nil, "editable mode must restore default system keyboard (inputView == nil)")

    // 5b. BiDi RTL ("שלום 123 abc", "A אבג B") multi-line selectionRects and per-endpoint RTL.
    let vcRtl = makeEmptyEditorVC()
    let bidiMixed = "שלום 123 abc"
    vcRtl.textHostView.insertText(bidiMixed)
    vcRtl.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 4))
    let snapRtl = affine_ios_host_document_selection_snapshot(vcRtl.hostPointer!)
    requireS3(snapRtl.start_is_rtl && snapRtl.end_is_rtl, "Hebrew text must report start_is_rtl & end_is_rtl")
    let rHeb = vcRtl.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 0, length: 4)))
    requireS3(rHeb.count == 1 && rHeb[0].rect.width > 20.0 && rHeb[0].writingDirection == .rightToLeft, "'שלום' rect must be >20pt wide and RTL")

    vcRtl.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 5, length: 3))
    let r123 = vcRtl.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 5, length: 3)))
    requireS3(r123.count == 1 && r123[0].rect.width > 12.0, "'123' rect must be >12pt wide, got \(r123.map { $0.rect.width })")

    vcRtl.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 9, length: 3))
    let rAbc = vcRtl.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 9, length: 3)))
    requireS3(rAbc.count == 1 && rAbc[0].rect.width > 12.0, "'abc' rect must be >12pt wide, got \(rAbc.map { $0.rect.width })")

    let vcMixed = makeEmptyEditorVC()
    vcMixed.textHostView.insertText("A אבג B")
    vcMixed.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 2, length: 3))
    let mixedRects = vcMixed.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 2, length: 3)))
    requireS3(mixedRects.count == 1 && mixedRects[0].rect.width > 15.0 && mixedRects[0].containsStart && mixedRects[0].containsEnd, "mixed BiDi 'אבג' must emit 1 rect >15pt wide")
    vcMixed.textHostView.copy(nil)
    requireS3(vcMixed.textHostView.lastCopiedText == "אבג", "mixed BiDi copy must yield exact 'אבג'")

    // Monotonic BiDi caretRect (RTL Hebrew decreasing, embedded digits & Latin increasing) + NFD equivalence.
    var prevHebX = CGFloat.greatestFiniteMagnitude
    for offset in 0...3 {
      let c = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: offset))
      requireS3(c.minX < prevHebX, "Hebrew caret x must decrease RTL at offset \(offset)")
      prevHebX = c.minX
    }
    let d1 = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 5)).minX
    let d2 = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 6)).minX
    let d3 = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 7)).minX
    requireS3(d1 < d2 && d2 < d3, "embedded digits '123' must increase LTR (\(d1), \(d2), \(d3))")

    let vcNorm = makeEmptyEditorVC()
    vcNorm.textHostView.insertText("\u{00E9}B")
    _ = vcNorm.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 1, length: 1)))
    vcNorm.textHostView.replace(AffineTextRange(utf16Range: NSRange(location: 0, length: 2)), withText: "e\u{0301}B")
    let decompRects = vcNorm.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 2, length: 1)))
    requireS3(decompRects.count == 1 && decompRects[0].rect.width > 5.0, "NFD 'e\\u{0301}B' [2,3) must yield valid rect")

    // UIKit single-handle cross-block drag (`textRange(from: selectedTextRange.start, to: closestPosition(to:))`)
    // AND cross-block selection ending on an empty paragraph (`end <= endOfDocument`).
    let vcCross = makeEmptyEditorVC()
    vcCross.textHostView.insertText("First block\nSecond block\n")
    if let crossPtr = vcCross.hostPointer {
      _ = affine_ios_host_render_frame(crossPtr, 1.0)
      let snapP3 = affine_ios_host_document_selection_snapshot(crossPtr)
      let baseX = CGFloat(snapP3.start_caret.x)
      let p3MidY = CGFloat(snapP3.start_caret.y + snapP3.start_caret.height * 0.5)
      // Select "First" from offset 0 of paragraph 1 via two-point viewport selection, then drag ONLY the End handle into paragraph 2!
      let p1Pt = CGPoint(x: baseX, y: p3MidY - 68.0)
      let p1EndPt = CGPoint(x: baseX + 46.0, y: p3MidY - 68.0)
      let p2Pt = CGPoint(x: baseX + 70.0, y: p3MidY - 34.0)
      let p3EmptyPt = CGPoint(x: baseX + 4.0, y: p3MidY)
      let initRange = vcCross.textHostView.textRange(
        from: vcCross.textHostView.closestPosition(to: p1Pt)!,
        to: vcCross.textHostView.closestPosition(to: p1EndPt)!
      )!
      vcCross.textHostView.selectedTextRange = initRange
      let fixedStart = vcCross.textHostView.selectedTextRange!.start
      let draggedToP2 = vcCross.textHostView.textRange(
        from: fixedStart,
        to: vcCross.textHostView.closestPosition(to: p2Pt)!
      )!
      vcCross.textHostView.selectedTextRange = draggedToP2
      vcCross.textHostView.copy(nil)
      let crossCopied = vcCross.textHostView.lastCopiedText ?? ""
      requireS3(
        crossCopied.contains("First block") && crossCopied.contains("Second"),
        "UIKit single-handle cross-block drag must preserve paragraph 1 start and extend into paragraph 2 (got '\(crossCopied)')"
      )
      // Drag into empty paragraph 3 (`maxLen == 0`): `selectedTextRange.end` must NOT exceed `endOfDocument`.
      let draggedToEmptyP3 = vcCross.textHostView.textRange(
        from: fixedStart,
        to: vcCross.textHostView.closestPosition(to: p3EmptyPt)!
      )!
      vcCross.textHostView.selectedTextRange = draggedToEmptyP3
      if let activeEmptySel = vcCross.textHostView.selectedTextRange {
        let cmp = vcCross.textHostView.compare(activeEmptySel.end, to: vcCross.textHostView.endOfDocument)
        requireS3(
          cmp != .orderedDescending,
          "cross-block selection ending on empty block must never exceed endOfDocument (cmp=\(cmp.rawValue))"
        )
      }
    }

    // Cross-anchor single-handle reversal on "Hello world": [6, 11) ("world") -> drag End handle to offset 3 -> "lo ".
    let vcRev = makeEmptyEditorVC()
    vcRev.textHostView.insertText("Hello world")
    vcRev.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 6, length: 5))
    let c3 = vcRev.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 3))
    let fixedAnchor6 = vcRev.textHostView.selectedTextRange!.start
    let reversedRange = vcRev.textHostView.textRange(
      from: fixedAnchor6,
      to: vcRev.textHostView.closestPosition(to: CGPoint(x: c3.midX, y: c3.midY))!
    )!
    vcRev.textHostView.selectedTextRange = reversedRange
    vcRev.textHostView.copy(nil)
    requireS3(
      vcRev.textHostView.lastCopiedText == "lo ",
      "single-handle cross-anchor reversal [6,11)->3 must select 'lo ', got '\(vcRev.textHostView.lastCopiedText ?? "")'"
    )

    // 5c. Soft-wrap multi-line selectionRects and rotation/resize recomputation.
    let vcWrap = makeEmptyEditorVC()
    let longLine = "AFFiNE native iOS GPU soft line wrapping verification across multiple wrapped visual lines"
    vcWrap.textHostView.insertText(longLine)
    vcWrap.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 10, length: 60))
    let wrapSelRects = vcWrap.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 10, length: 60)))
    requireS3(
      wrapSelRects.count >= 2 && wrapSelRects.first!.containsStart && wrapSelRects.last!.containsEnd,
      "multi-line soft-wrap selectionRects must return >=2 per-line rects with start/end flags (got \(wrapSelRects.count))"
    )
    let endYPortrait = affine_ios_host_document_selection_snapshot(vcWrap.hostPointer!).end_caret.y
    vcWrap.view.frame = CGRect(x: 0, y: 0, width: 844, height: 390)
    vcWrap.view.setNeedsLayout()
    vcWrap.view.layoutIfNeeded()
    let endYLandscape = affine_ios_host_document_selection_snapshot(vcWrap.hostPointer!).end_caret.y
    requireS3(
      endYLandscape < endYPortrait - 10.0,
      "widening viewport 390->844 must move wrapped end caret up (portrait=\(endYPortrait), landscape=\(endYLandscape))"
    )

    // 5d. Keyboard auto-scroll keeps bottom selection visible and copyable.
    let vcKb = makeEmptyEditorVC()
    let fillerLines = String(repeating: "\n", count: 35)
    let bottomWord = "BottomTarget"
    vcKb.textHostView.insertText(fillerLines + bottomWord)
    let kbLen = vcKb.textHostView.currentAuthoritativeUtf16Units.count
    let kbStart = max(0, kbLen - bottomWord.utf16.count)
    vcKb.textHostView.selectedTextRange = AffineTextRange(
      utf16Range: NSRange(location: kbStart, length: bottomWord.utf16.count)
    )
    let kbBefore = affine_ios_host_document_selection_snapshot(vcKb.hostPointer!)
    requireS3(kbBefore.start_caret.y > 650.0, "bottom selection must sit below y=650 (got \(kbBefore.start_caret.y))")
    _ = vcKb.keyboardCoordinator.applyKeyboardFrame(
      windowBounds: CGRect(x: 0, y: 0, width: 390, height: 844),
      keyboardFrameInView: CGRect(x: 0, y: 542, width: 390, height: 302),
      safeAreaInsets: .zero,
      isHidden: false,
      durationSec: 0.0,
      timestampSec: 1.0
    )
    vcKb.sampleInsets(timestamp: 1.0)
    let kbRevealed = affine_ios_host_document_selection_snapshot(vcKb.hostPointer!)
    requireS3(
      kbRevealed.start_visible && kbRevealed.end_visible && kbRevealed.start_caret.y < kbBefore.start_caret.y,
      "page must auto-scroll selection above keyboard (before=\(kbBefore.start_caret.y), after=\(kbRevealed.start_caret.y))"
    )
    vcKb.textHostView.copy(nil)
    requireS3(vcKb.textHostView.lastCopiedText == bottomWord, "selection and copy must stay intact while keyboard is open")

    // 5e. Unfocused CJK/Emoji `closestPosition` + dual `endpointToken` `selectedTextRange` read-write roundtrip + ordinary-scroll menu restore.
    let vcCjk = makeEmptyEditorVC()
    vcCjk.textHostView.insertText("甲乙丙丁🚀")
    vcCjk.textHostView.insertText("\n")
    vcCjk.textHostView.insertText("Second")
    if let cjkPtr = vcCjk.hostPointer {
      _ = affine_ios_host_render_frame(cjkPtr, 1.0)
      let snapP2 = affine_ios_host_document_selection_snapshot(cjkPtr)
      let baseX = CGFloat(snapP2.start_caret.x)
      let p1Y = CGFloat(snapP2.start_caret.y + snapP2.start_caret.height * 0.5) - 34.0
      let p2Y = CGFloat(snapP2.start_caret.y + snapP2.start_caret.height * 0.5)
      // Focus starts in paragraph 2 ("Second"); hit-testing unfocused CJK paragraph 1 must return identical UTF-16 offset on 1st and 2nd call.
      let probeCjkPt = CGPoint(x: baseX + 48.0, y: p1Y)
      let posFirst = vcCjk.textHostView.closestPosition(to: probeCjkPt) as? AffineTextPosition
      let posSecond = vcCjk.textHostView.closestPosition(to: probeCjkPt) as? AffineTextPosition
      requireS3(
        posFirst != nil && posFirst?.utf16Offset == posSecond?.utf16Offset && (posFirst?.utf16Offset ?? 0) >= 2,
        "unfocused CJK closestPosition must match focused UTF-16 offset on first query (first=\(String(describing: posFirst?.utf16Offset)), second=\(String(describing: posSecond?.utf16Offset)))"
      )
      // Select cross-block "甲乙丙丁🚀\nSec", read `selectedTextRange` (two `.endpointToken`s), write it straight back, and verify text is preserved!
      let crossStart = vcCjk.textHostView.position(from: posFirst!, offset: -(posFirst?.utf16Offset ?? 0))!
      let crossEnd = vcCjk.textHostView.closestPosition(to: CGPoint(x: baseX, y: p2Y))!
      vcCjk.textHostView.selectedTextRange = vcCjk.textHostView.textRange(from: crossStart, to: crossEnd)
      vcCjk.textHostView.copy(nil)
      let expectedCross = vcCjk.textHostView.lastCopiedText ?? ""
      requireS3(
        expectedCross.hasPrefix("甲乙丙丁🚀\nS"),
        "cross-block CJK selection setup must span both paragraphs (got '\(expectedCross)')"
      )
      let readBackRange = vcCjk.textHostView.selectedTextRange!
      vcCjk.textHostView.selectedTextRange = readBackRange
      vcCjk.textHostView.copy(nil)
      let afterRoundtrip = vcCjk.textHostView.lastCopiedText ?? ""
      requireS3(
        afterRoundtrip == expectedCross,
        "writing back dual-endpointToken selectedTextRange must preserve cross-block selection '\(expectedCross)', got '\(afterRoundtrip)'"
      )
    }

    print("PASS [5/5]: MetalHostViewController E2E UITextInteraction, document drag, multi-MIME clipboard, readonly mask, BiDi, soft-wrap, and keyboard scroll passed")
  }

  /// 6. S6 native GPU PlaygroundView mount: zero HostTextPreviewView, live CAMetalLayer,
  ///    H-S1 zero backingText copy (Markdown `# ` + `[[` -> `@`), H-S2 inputDelegate notifications,
  ///    newline block split & block-start deleteBackward merge, and T1 Stage-1 touch readonly.
  @MainActor
  static func testS6NativeEditorMountImeAndStageOneReadonly() {
    let vc = MetalHostViewController()
    vc.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vc.loadViewIfNeeded()
    vc.view.layoutIfNeeded()
    guard let handle = vc.hostPointer else {
      requireS3(false, "MetalHostViewController must initialize hostHandle")
      return
    }

    // Verify Metal GPU layer is attached directly to hostView (zero HostTextPreviewView class exists).
    let hasMetalSublayer = (vc.textHostView.layer.sublayers ?? []).contains { $0 is CAMetalLayer }
    requireS3(hasMetalSublayer, "MetalRenderer CAMetalLayer must be attached to MetalHostView")

    // Live MetalRenderer CAMetalLayer attached as sublayer on iOS.
    let rawMetal = affine_ios_host_metal_layer(handle)
    requireS3(rawMetal != nil, "affine_ios_host_metal_layer must return MetalRenderer CAMetalLayer")

    // Stage-1 touch defaults: Phone & Tablet default to edgeless_readonly + database_readonly.
    requireS3(affine_ios_host_edgeless_readonly(handle), "iOS touch host must default edgeless_readonly = true")
    requireS3(affine_ios_host_database_readonly(handle), "iOS touch host must default database_readonly = true")

    // Reset to empty doc for authoritative H-S1 / H-S2 IME verification.
    affine_ios_host_reset_empty_doc(handle)
    let seqBefore = affine_ios_host_text_input_change_seq(handle)
    vc.textHostView.insertText("# Heading")
    let seqAfter = affine_ios_host_text_input_change_seq(handle)
    requireS3(seqAfter > seqBefore, "H-S2: editor text mutation must advance text_input_change_seq")
    let fullRange = vc.textHostView.textRange(
      from: vc.textHostView.beginningOfDocument,
      to: vc.textHostView.endOfDocument
    )
    let readBack = fullRange.flatMap { vc.textHostView.text(in: $0) } ?? ""
    requireS3(readBack.contains("Heading"), "H-S1: UITextInput must read authoritative editor text, got '\(readBack)'")

    // Block split on newline + block-start deleteBackward merge.
    vc.textHostView.insertText("\n")
    requireS3(
      vc.textHostView.currentAuthoritativeUtf16Units.isEmpty,
      "insertText(\"\\n\") must split into an empty focused next block"
    )
    let afterSplitRange = vc.textHostView.textRange(
      from: vc.textHostView.beginningOfDocument,
      to: vc.textHostView.endOfDocument
    )
    let afterSplit = afterSplitRange.flatMap { vc.textHostView.text(in: $0) } ?? ""
    requireS3(
      afterSplit.contains("Heading"),
      "full-document beginningOfDocument..endOfDocument must span all blocks after split, got '\(afterSplit)'"
    )
    // Value equality & hashing on AffineTextPosition / AffineTextRange (NSObject equivalence contract).
    let pA = AffineTextPosition(utf16Offset: 3, blockOrder: 1, endpointToken: 42)
    let pB = AffineTextPosition(utf16Offset: 3, blockOrder: 1, endpointToken: 42)
    let pSameTokMovedBlock = AffineTextPosition(utf16Offset: 3, blockOrder: 2, endpointToken: 42)
    let pDiffTokSameCoords = AffineTextPosition(utf16Offset: 3, blockOrder: 1, endpointToken: 99)
    let pZeroTok = AffineTextPosition(utf16Offset: 3, blockOrder: 1, endpointToken: 0)
    let pC = AffineTextPosition(utf16Offset: 4, blockOrder: 1, endpointToken: 43)
    requireS3(pA.isEqual(pB) && pA.hash == pB.hash && !pA.isEqual(pC), "AffineTextPosition must implement value isEqual/hash")
    requireS3(
      pA.isEqual(pSameTokMovedBlock) && pA.hash == pSameTokMovedBlock.hash,
      "AffineTextPosition with identical non-zero endpointToken must stay equal with equal hash across blockOrder changes"
    )
    requireS3(
      !pA.isEqual(pDiffTokSameCoords) && !pA.isEqual(pZeroTok),
      "AffineTextPosition with distinct endpointTokens must never compare equal even at same coordinates"
    )
    let rA = AffineTextRange(startPos: pA, endPos: pC)
    let rB = AffineTextRange(startPos: pB, endPos: pC)
    requireS3(rA.isEqual(rB) && rA.hash == rB.hash, "AffineTextRange must implement value isEqual/hash")

    // Surrogate pair / grapheme cluster characterUnitRange & characterRange(at:) must not split 🚀.
    affine_ios_host_reset_empty_doc(handle)
    vc.textHostView.insertText("甲🚀乙")
    _ = affine_ios_host_render_frame(handle, 1.0)
    if let caretEnd = vc.textHostView.selectedTextRange?.start,
      let emojiPos = vc.textHostView.position(from: caretEnd, offset: -3) as? AffineTextPosition,
      let unitRange = vc.textHostView.characterUnitRange(at: emojiPos)
    {
      let unitText = vc.textHostView.text(in: unitRange) ?? ""
      requireS3(
        unitText == "🚀" && unitRange.utf16Range.length == 2,
        "characterUnitRange at 🚀 must return full 2-UTF16 surrogate pair, got '\(unitText)' len=\(unitRange.utf16Range.length)"
      )
    } else {
      requireS3(false, "characterUnitRange must resolve 🚀 surrogate pair position")
    }

    // Code block focus must switch autocorrectionType to .no (wantsCodeInput regression guard).
    affine_ios_host_reset_empty_doc(handle)
    requireS3(vc.textHostView.autocorrectionType == .default, "Prose block must default autocorrectionType to .default")
    vc.textHostView.insertText("``` ")
    requireS3(
      vc.textHostView.autocorrectionType == .no && vc.textHostView.autocapitalizationType == .none,
      "Code block focus must set autocorrectionType == .no and autocapitalizationType == .none"
    )
    affine_ios_host_reset_empty_doc(handle)
    vc.textHostView.insertText("# Heading")
    vc.textHostView.insertText("\n")

    vc.textHostView.deleteBackward()
    let afterMergeRange = vc.textHostView.textRange(
      from: vc.textHostView.beginningOfDocument,
      to: vc.textHostView.endOfDocument
    )
    let afterMerge = afterMergeRange.flatMap { vc.textHostView.text(in: $0) } ?? ""
    requireS3(afterMerge.contains("Heading"), "deleteBackward at block start must merge back, got '\(afterMerge)'")

    // Verify non-zero safe-area insets (top=59pt, bottom=34pt) keep hostView,
    // selectionOverlayView, and caretRect in one shared (0, 0) safe-area frame.
    let safeWindow = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let vcSafe = MetalHostViewController()
    vcSafe.additionalSafeAreaInsets = UIEdgeInsets(top: 59, left: 0, bottom: 34, right: 0)
    safeWindow.rootViewController = vcSafe
    safeWindow.isHidden = false
    safeWindow.layoutIfNeeded()
    vcSafe.view.layoutIfNeeded()
    requireS3(
      abs(vcSafe.textHostView.frame.origin.y - vcSafe.view.safeAreaInsets.top) < 0.5
        && vcSafe.view.safeAreaInsets.top >= 59.0
        && abs(
          vcSafe.textHostView.frame.height
            - (vcSafe.view.bounds.height - vcSafe.view.safeAreaInsets.top - vcSafe.view.safeAreaInsets.bottom)
        ) < 0.5,
      "hostView must be framed inside safeAreaInsets (insets=\(vcSafe.view.safeAreaInsets), got \(vcSafe.textHostView.frame))"
    )
    if let safeHandle = vcSafe.hostPointer {
      affine_ios_host_reset_empty_doc(safeHandle)
      vcSafe.textHostView.insertText("SafeArea")
      let c0 = vcSafe.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 0))
      let c8 = vcSafe.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 8))
      requireS3(c8.minX > c0.minX, "caretRect in safe-area hostView must advance horizontally")

      // UIKit IME contract: Pinyin/Kana setMarkedText -> setMarkedText -> insertText
      // must NOT echo textWillChange/textDidChange back to UITextInputDelegate, whereas
      // editor-initiated/external mutations MUST notify it.
      final class CountingInputDelegate: NSObject, UITextInputDelegate {
        var textWillChangeCount = 0
        var textDidChangeCount = 0
        var selectionWillChangeCount = 0
        var selectionDidChangeCount = 0
        func selectionWillChange(_ textInput: UITextInput?) { selectionWillChangeCount += 1 }
        func selectionDidChange(_ textInput: UITextInput?) { selectionDidChangeCount += 1 }
        func textWillChange(_ textInput: UITextInput?) { textWillChangeCount += 1 }
        func textDidChange(_ textInput: UITextInput?) { textDidChangeCount += 1 }
        @available(iOS 18.4, *)
        func conversationContext(_ context: UIConversationContext?, didChange textInput: (any UITextInput)?) {}
      }
      affine_ios_host_reset_empty_doc(safeHandle)
      let countingDelegate = CountingInputDelegate()
      vcSafe.textHostView.inputDelegate = countingDelegate
      vcSafe.textHostView.setMarkedText("ni", selectedRange: NSRange(location: 2, length: 0))
      vcSafe.textHostView.setMarkedText("nihao", selectedRange: NSRange(location: 5, length: 0))
      vcSafe.textHostView.insertText("你好")
      requireS3(
        countingDelegate.textWillChangeCount == 0 && countingDelegate.textDidChangeCount == 0,
        "IME-originated Pinyin sequence must trigger 0 textWillChange/textDidChange callbacks (got will=\(countingDelegate.textWillChangeCount), did=\(countingDelegate.textDidChangeCount))"
      )
      // Single-Writer contract: UIKit calling setSelectedTextRange must NOT synchronously echo
      // selectionWillChange/selectionDidChange back into inputDelegate.
      let selWillBefore = countingDelegate.selectionWillChangeCount
      let selDidBefore = countingDelegate.selectionDidChangeCount
      vcSafe.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 2))
      requireS3(
        countingDelegate.selectionWillChangeCount == selWillBefore
          && countingDelegate.selectionDidChangeCount == selDidBefore,
        "setSelectedTextRange must not synchronously echo selectionWillChange/selectionDidChange"
      )
      // External editor mutation (reset / shortcut) MUST notify inputDelegate.
      affine_ios_host_reset_empty_doc(safeHandle)
      requireS3(
        countingDelegate.textWillChangeCount > 0 || countingDelegate.selectionDidChangeCount > 0,
        "External editor mutation must notify UITextInputDelegate"
      )
      vcSafe.textHostView.inputDelegate = nil

      // Code input mode disables autocorrection, autocapitalization, smart quotes, and smart dashes.
      affine_ios_host_reset_empty_doc(safeHandle)
      requireS3(
        !affine_ios_host_wants_code_input(safeHandle)
          && vcSafe.textHostView.autocorrectionType == .default
          && vcSafe.textHostView.autocapitalizationType == .sentences,
        "prose paragraph must use default autocorrection and sentence capitalization"
      )
      vcSafe.textHostView.insertText("``` ")
      requireS3(
        affine_ios_host_wants_code_input(safeHandle)
          && vcSafe.textHostView.autocorrectionType == .no
          && vcSafe.textHostView.autocapitalizationType == .none
          && vcSafe.textHostView.smartQuotesType == .no
          && vcSafe.textHostView.smartDashesType == .no,
        "code block must disable autocorrection, autocapitalization, smart quotes, and smart dashes"
      )

      // Forwarded empty-tail tap regression guard (5 consecutive rounds):
      // tapping below the last block must route to Rust (shouldLetTextInteractionOwnTouch == false),
      // append/focus the trailing paragraph, and raise software keyboard (isFirstResponder == true).
      safeWindow.makeKeyAndVisible()
      for round in 1...5 {
        affine_ios_host_reset_empty_doc(safeHandle)
        vcSafe.textHostView.insertText("First paragraph \(round)")
        _ = affine_ios_host_render_frame(safeHandle, Double(round))
        _ = vcSafe.textHostView.resignFirstResponder()
        requireS3(!vcSafe.textHostView.isFirstResponder, "round \(round): must resign before empty-tail tap")
        let tailPoint = CGPoint(x: 195.0, y: 620.0)
        requireS3(
          !vcSafe.shouldLetTextInteractionOwnTouch(at: tailPoint),
          "round \(round): empty page tail tap must forward immediately to Rust"
        )
        affine_ios_host_touch_event(safeHandle, UInt64(900 + round), 0, Float(tailPoint.x), Float(tailPoint.y))
        affine_ios_host_touch_event(safeHandle, UInt64(900 + round), 2, Float(tailPoint.x), Float(tailPoint.y))
        vcSafe.textHostView.handleForwardedTouchCompletion(endedEditableTap: true)
        requireS3(
          affine_ios_host_wants_software_keyboard(safeHandle)
            && vcSafe.textHostView.isFirstResponder
            && vcSafe.textHostView.inputView == nil,
          "round \(round): empty-tail tap must raise software keyboard (wantsKb=\(affine_ios_host_wants_software_keyboard(safeHandle)), isFR=\(vcSafe.textHostView.isFirstResponder))"
        )
        vcSafe.textHostView.insertText("Tail line \(round)")
        let docRange = vcSafe.textHostView.textRange(
          from: vcSafe.textHostView.beginningOfDocument,
          to: vcSafe.textHostView.endOfDocument
        )
        let fullText = docRange.flatMap { vcSafe.textHostView.text(in: $0) } ?? ""
        requireS3(
          fullText.contains("Tail line \(round)"),
          "round \(round): typing after empty-tail tap must write into newly focused paragraph, got '\(fullText)'"
        )
      }
    }

    // Reload showcase document and trigger a real GPU Metal frame render.
    affine_ios_host_load_showcase_doc(handle)
    let renderedColor = affine_ios_host_render_frame(handle, 1.0)
    requireS3(renderedColor != 0, "GPU editor frame render must succeed on showcase doc")

    print("PASS [6/6]: S6 iOS native GPU editor mount, safe-area alignment, H-S1/H-S2 IME, block split/merge, UITextInteraction selection, empty-tail tap keyboard raise, and T1 readonly passed")
  }
}
