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
      testSelectionOverlayGrabOffsetOffscreenAndRealLoupe()
      testKeyboardAvoidancePerFrameSlideOverAndBackgroundResume()
      testHapticsBridgeDispatchAndBoundedHistory()
      testMetalHostViewControllerEndToEndTextSelectionDragCopyAndMenu()
      print("ALL 5 SWIFT+RUST S3-IOS SMOKE TESTS PASSED")
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

  /// 2. SelectionOverlayView: 0pt grab_offset zero-jump, offscreen hiding, real magnified loupe snapshot, and RTL.
  @MainActor
  static func testSelectionOverlayGrabOffsetOffscreenAndRealLoupe() {
    let host = affine_ios_host_create(nil, 390.0, 844.0, 3.0)
    requireS3(host != nil, "host create failed")
    defer { affine_ios_host_destroy(host) }

    let container = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    container.backgroundColor = .white
    let marker = UIView(frame: CGRect(x: 195, y: 195, width: 30, height: 30))
    marker.backgroundColor = .systemBlue
    container.addSubview(marker)

    let overlay = SelectionOverlayView(frame: container.bounds)
    overlay.hostHandle = host
    container.addSubview(overlay)

    var lastAnchor: CGRect?
    overlay.onMenuAnchorChanged = { lastAnchor = $0 }

    let initial = affine_ios_host_selection_set(
      host,
      AffineRect(x: 70, y: 200, width: 2, height: 22),
      AffineRect(x: 210, y: 200, width: 2, height: 22),
      AffineUtf16Range(location: 0, length: 14),
      0
    )
    overlay.applyOverlayState(initial)
    requireS3(initial.start_handle.visible && initial.end_handle.visible, "handles must be visible")
    requireS3(lastAnchor != nil, "floating menu anchor must be published")

    // Press exact end teardrop center (213, 228) and move 0pt: probe must stay at caret midpoint (211, 211)!
    let dropCenter = CGPoint(
      x: CGFloat(initial.end_handle.drop_center_x),
      y: CGFloat(initial.end_handle.drop_center_y)
    )
    let began = overlay.processDragStep(phase: .began, point: dropCenter)
    requireS3(began != nil && began!.loupe.visible, "loupe must open on drag begin")
    requireS3(overlay.loupeSnapshotImage != nil, "loupe must capture a real magnified snapshot from superview")

    let zeroMove = overlay.processDragStep(phase: .changed, point: dropCenter)
    requireS3(zeroMove != nil && zeroMove!.loupe.visible, "loupe must stay visible on 0pt drag")
    requireS3(
      abs(zeroMove!.end_handle.stem_top_y - 200.0) < 0.01
        && abs(zeroMove!.end_handle.stem_bottom_y - 222.0) < 0.01
        && abs(zeroMove!.end_handle.stem_x - 210.0) < 0.01,
      "0pt drag on teardrop center must not jump lines (got stem x=\(zeroMove!.end_handle.stem_x) y=\(zeroMove!.end_handle.stem_top_y)..\(zeroMove!.end_handle.stem_bottom_y))"
    )

    let ended = overlay.processDragStep(phase: .ended, point: dropCenter)
    requireS3(ended != nil && !ended!.loupe.visible && ended!.show_floating_menu, "loupe closes and menu returns on end")

    // Offscreen carets must hide handles.
    let offscreen = affine_ios_host_selection_set(
      host,
      AffineRect(x: -40, y: 200, width: 2, height: 22),
      AffineRect(x: 210, y: 900, width: 2, height: 22),
      AffineUtf16Range(location: 0, length: 14),
      0
    )
    requireS3(!offscreen.start_handle.visible && !offscreen.end_handle.visible, "offscreen handles must be hidden")
    print("PASS [2/5]: SelectionOverlayView 0pt grab_offset zero-jump, offscreen hiding, and real loupe snapshot passed")
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

  /// 5. End-to-end MetalHostViewController: insertText -> selectedTextRange -> real glyph handles ->
  ///    drag end handle +2 chars -> copy() -> SelectionChanged haptic -> presentedMenuAnchorRect.
  @MainActor
  static func testMetalHostViewControllerEndToEndTextSelectionDragCopyAndMenu() {
    let vc = MetalHostViewController()
    vc.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vc.loadViewIfNeeded()
    vc.view.layoutIfNeeded()

    let hostView = vc.textHostView
    let overlay = vc.selectionOverlay
    guard let hostPtr = vc.hostPointer else {
      requireS3(false, "MetalHostViewController hostPointer must be initialized")
      return
    }

    hostView.insertText("Hello world")
    hostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 5))

    let stateBefore = overlay.currentState
    requireS3(stateBefore.start_handle.visible && stateBefore.end_handle.visible, "both teardrop handles must be visible for [0, 5]")
    requireS3(
      stateBefore.start_handle.stem_x > 0 && stateBefore.end_handle.stem_x > stateBefore.start_handle.stem_x + 20.0,
      "handles must reflect real glyph advance (start=\(stateBefore.start_handle.stem_x), end=\(stateBefore.end_handle.stem_x))"
    )
    requireS3(vc.presentedMenuAnchorRect != nil, "menu anchor rect must be published on range selection")

    // Measure exact target caret x for offset 7 ("Hello w") and drag the end teardrop handle there.
    let targetCaret7 = hostView.caretRect(for: AffineTextPosition(utf16Offset: 7))
    let endDrop = CGPoint(
      x: CGFloat(stateBefore.end_handle.drop_center_x),
      y: CGFloat(stateBefore.end_handle.drop_center_y)
    )
    let deltaX = targetCaret7.midX - CGFloat(stateBefore.end_handle.stem_x + 1.0)
    let draggedPoint = CGPoint(x: endDrop.x + deltaX, y: endDrop.y)

    let hapticBefore = affine_ios_host_haptic_count(hostPtr, AffineHapticPatternSwift.selectionChanged.rawValue)
    _ = overlay.processDragStep(phase: .began, point: endDrop)
    _ = overlay.processDragStep(phase: .changed, point: draggedPoint)
    let stateAfter = overlay.processDragStep(phase: .ended, point: draggedPoint)
    requireS3(stateAfter != nil && !stateAfter!.loupe.visible, "loupe must hide after drag end")

    let finalRange = (hostView.selectedTextRange as? AffineTextRange)?.utf16Range
    requireS3(
      finalRange == NSRange(location: 0, length: 7),
      "expected selectedTextRange [0, 7] ('Hello w'), got \(String(describing: finalRange))"
    )
    requireS3(hostView.canPerformAction(#selector(UIResponderStandardEditActions.copy(_:)), withSender: nil), "copy action must be enabled")
    hostView.copy(nil)
    requireS3(hostView.lastCopiedText == "Hello w", "expected copied text 'Hello w', got \(String(describing: hostView.lastCopiedText))")

    let hapticAfter = affine_ios_host_haptic_count(hostPtr, AffineHapticPatternSwift.selectionChanged.rawValue)
    requireS3(hapticAfter > hapticBefore, "SelectionChanged haptic count must increase on drag selection change")
    requireS3(vc.presentedMenuAnchorRect != nil, "presentedMenuAnchorRect must be non-nil after drag end")
    requireS3(
      vc.presentedMenuAnchorRect!.minY <= CGFloat(stateAfter!.end_handle.stem_top_y) + 1.0,
      "presentedMenuAnchorRect must anchor at/above the selection top"
    )

    // Cut active selection [0, 7] ("Hello w"): remaining text is "orld", handles hide, menu dismisses.
    hostView.cut(nil)
    let remainingText = hostView.text(in: AffineTextRange(utf16Range: NSRange(location: 0, length: 4)))
    requireS3(remainingText == "orld", "expected remaining text 'orld' after cut, got \(String(describing: remainingText))")
    requireS3(
      !vc.selectionOverlay.currentState.start_handle.visible
        && !vc.selectionOverlay.currentState.end_handle.visible
        && vc.presentedMenuAnchorRect == nil,
      "cut() must hide selection handles and dismiss presentedMenuAnchorRect"
    )

    // 5b. Cross-anchor handle drag sequence on "Hello world": select [6, 11) ("world"), grab End handle,
    //     drag step-by-step 10 -> 8 -> 6 (length == 0!) -> 5 -> 3 => [3, 6) ("lo "), active_drag_handle == 1.
    let vcCross = MetalHostViewController()
    vcCross.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcCross.loadViewIfNeeded()
    vcCross.view.layoutIfNeeded()
    vcCross.textHostView.insertText("Hello world")
    vcCross.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 6, length: 5))
    let crossStart = vcCross.selectionOverlay.currentState
    let crossDrop = CGPoint(
      x: CGFloat(crossStart.end_handle.drop_center_x),
      y: CGFloat(crossStart.end_handle.drop_center_y)
    )
    let caret11 = vcCross.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 11))
    _ = vcCross.selectionOverlay.processDragStep(phase: .began, point: crossDrop)
    var lastCrossState: AffineSelectionOverlayState?
    for stepOffset in [10, 8, 6, 5, 3] {
      let cStep = vcCross.textHostView.caretRect(for: AffineTextPosition(utf16Offset: stepOffset))
      let pt = CGPoint(x: crossDrop.x + (cStep.midX - caret11.midX), y: crossDrop.y)
      lastCrossState = vcCross.selectionOverlay.processDragStep(phase: .changed, point: pt)
      requireS3(
        lastCrossState != nil && lastCrossState!.active_drag_handle != 0,
        "drag must stay alive across stepOffset=\(stepOffset)"
      )
    }
    requireS3(
      lastCrossState?.active_drag_handle == 1,
      "active_drag_handle must flip to Start (1) after crossing anchor 6 -> 3, got \(String(describing: lastCrossState?.active_drag_handle))"
    )
    let c3 = vcCross.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 3))
    _ = vcCross.selectionOverlay.processDragStep(
      phase: .ended,
      point: CGPoint(x: crossDrop.x + (c3.midX - caret11.midX), y: crossDrop.y)
    )
    let crossRange = (vcCross.textHostView.selectedTextRange as? AffineTextRange)?.utf16Range
    requireS3(crossRange == NSRange(location: 3, length: 3), "expected crossed range [3, 6), got \(String(describing: crossRange))")
    vcCross.textHostView.copy(nil)
    requireS3(vcCross.textHostView.lastCopiedText == "lo ", "expected copied 'lo ', got \(String(describing: vcCross.textHostView.lastCopiedText))")

    // 5c. BiDi RTL ("שלום 123 abc", "A אבג B"), ZWJ emoji ("A👨👩👧👦B"), soft-wrap boundary & rotation re-layout.
    let vcRtl = MetalHostViewController()
    vcRtl.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcRtl.loadViewIfNeeded()
    vcRtl.view.layoutIfNeeded()
    let bidiMixed = "שלום 123 abc"
    vcRtl.textHostView.insertText(bidiMixed)
    vcRtl.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 4))
    requireS3(vcRtl.selectionOverlay.currentState.is_rtl, "Hebrew text must set is_rtl == true")
    var prevHebX = CGFloat.greatestFiniteMagnitude
    for offset in 0...3 {
      let c = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: offset))
      requireS3(c.minX < prevHebX, "Hebrew caret x must decrease RTL at offset \(offset) (prev=\(prevHebX), cur=\(c.minX))")
      prevHebX = c.minX
    }
    // Embedded digits "123" (offsets 5,6,7) and Latin "abc" (offsets 9,10,11) must advance LTR (never mirrored to "cba 321").
    let cDigit1 = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 5)).minX
    let cDigit2 = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 6)).minX
    let cDigit3 = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 7)).minX
    requireS3(cDigit1 < cDigit2 && cDigit2 < cDigit3, "embedded digits '123' must increase LTR (\(cDigit1), \(cDigit2), \(cDigit3))")
    let cLatA = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 9)).minX
    let cLatB = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 10)).minX
    let cLatC = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 11)).minX
    requireS3(cLatA < cLatB && cLatB < cLatC, "embedded Latin 'abc' must increase LTR (\(cLatA), \(cLatB), \(cLatC))")

    // Verify 6 BiDi direction-boundary selection rect and handle-edge cases.
    // 1) "שלום 123 abc" [5,8) ("123"): rect.width > 20pt & handles separated > 20pt.
    vcRtl.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 5, length: 3))
    let r123 = vcRtl.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 5, length: 3)))
    let st123 = vcRtl.selectionOverlay.currentState
    requireS3(r123.count == 1 && r123[0].rect.width > 20.0, "'123' rect must be >20pt wide, got \(r123.map { $0.rect.width })")
    requireS3(abs(st123.end_handle.stem_x - st123.start_handle.stem_x) > 20.0, "'123' handles must be >20pt apart (start=\(st123.start_handle.stem_x), end=\(st123.end_handle.stem_x))")

    // 2) "שלום 123 abc" [9,12) ("abc"): rect.width > 20pt & handles separated > 20pt.
    vcRtl.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 9, length: 3))
    let rAbc = vcRtl.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 9, length: 3)))
    let stAbc = vcRtl.selectionOverlay.currentState
    requireS3(rAbc.count == 1 && rAbc[0].rect.width > 20.0, "'abc' rect must be >20pt wide, got \(rAbc.map { $0.rect.width })")
    requireS3(abs(stAbc.end_handle.stem_x - stAbc.start_handle.stem_x) > 20.0, "'abc' handles must not overlap (start=\(stAbc.start_handle.stem_x), end=\(stAbc.end_handle.stem_x))")

    // 3) "שלום 123 abc" [5,7) ("12"): rect.width > 12pt and strictly narrower than "123".
    let r12 = vcRtl.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 5, length: 2)))
    requireS3(r12.count == 1 && r12[0].rect.width > 12.0 && r12[0].rect.width < r123[0].rect.width, "'12' rect width must be >12pt and < '123' (w12=\(r12.first?.rect.width ?? 0), w123=\(r123[0].rect.width))")

    // 4) "שלום 123 abc" [0,4) ("שלום"): rect.width > 25pt & start_handle right of end_handle by >25pt.
    vcRtl.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 4))
    let rHeb = vcRtl.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 0, length: 4)))
    let stHeb = vcRtl.selectionOverlay.currentState
    requireS3(rHeb.count == 1 && rHeb[0].rect.width > 25.0, "'שלום' rect must be >25pt wide, got \(rHeb.map { $0.rect.width })")
    requireS3(stHeb.start_handle.stem_x > stHeb.end_handle.stem_x + 25.0, "'שלום' start_handle must be right of end_handle by >25pt (start=\(stHeb.start_handle.stem_x), end=\(stHeb.end_handle.stem_x))")

    // 5) & 6) Mixed LTR-base BiDi ("A אבג B"):
    // [2,5) ("אבג"): width > 20pt & start_handle right of end_handle by > 20pt.
    // [2,4) ("אב"): single rect minX strictly > [2,5) minX + 5pt (highlights right two letters, never 'ג').
    let vcMixed = MetalHostViewController()
    vcMixed.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcMixed.loadViewIfNeeded()
    vcMixed.view.layoutIfNeeded()
    vcMixed.textHostView.insertText("A אבג B")
    vcMixed.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 2, length: 3))
    let mixedRects = vcMixed.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 2, length: 3)))
    let stMix3 = vcMixed.selectionOverlay.currentState
    requireS3(mixedRects.count == 1 && mixedRects[0].rect.width > 20.0 && mixedRects[0].containsStart && mixedRects[0].containsEnd, "mixed BiDi 'אבג' must emit 1 rect >20pt wide")
    requireS3(stMix3.start_handle.stem_x > stMix3.end_handle.stem_x + 20.0, "'אבג' RTL start_handle must be right of end_handle by >20pt (start=\(stMix3.start_handle.stem_x), end=\(stMix3.end_handle.stem_x))")
    let mixedRects2 = vcMixed.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 2, length: 2)))
    requireS3(mixedRects2.count == 1 && mixedRects2[0].rect.minX > mixedRects[0].rect.minX + 5.0, "'אב' [2,4) minX must lie strictly right of 'ג' (minX2=\(mixedRects2.first?.rect.minX ?? 0), minX3=\(mixedRects[0].rect.minX))")
    vcMixed.textHostView.copy(nil)
    requireS3(vcMixed.textHostView.lastCopiedText == "אבג", "mixed BiDi copy must yield exact 'אבג'")
    // In-place 0pt drag on Start handle at BiDi boundary ("A אבג B" [2, 5)) must preserve [2, 5) "אבג".
    let mixedStartDrop = CGPoint(
      x: CGFloat(stMix3.start_handle.drop_center_x),
      y: CGFloat(stMix3.start_handle.drop_center_y)
    )
    _ = vcMixed.selectionOverlay.processDragStep(phase: .began, point: mixedStartDrop)
    _ = vcMixed.selectionOverlay.processDragStep(phase: .changed, point: mixedStartDrop)
    _ = vcMixed.selectionOverlay.processDragStep(phase: .ended, point: mixedStartDrop)
    let mixedAfterZeroStart = (vcMixed.textHostView.selectedTextRange as? AffineTextRange)?.utf16Range
    requireS3(mixedAfterZeroStart == NSRange(location: 2, length: 3), "0pt Start drag on 'A אבג B' [2,5) must preserve [2,5), got \(String(describing: mixedAfterZeroStart))")
    vcMixed.textHostView.copy(nil)
    requireS3(vcMixed.textHostView.lastCopiedText == "אבג", "0pt Start drag must keep copied 'אבג'")
    // Moving Start handle inward by 1 Hebrew letter shrinks [2,5) -> [3,5) "בג".
    let cMix3 = vcMixed.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 3))
    let mixStartInwardDx = cMix3.midX - CGFloat(stMix3.start_handle.stem_x)
    _ = vcMixed.selectionOverlay.processDragStep(phase: .began, point: mixedStartDrop)
    _ = vcMixed.selectionOverlay.processDragStep(
      phase: .changed,
      point: CGPoint(x: mixedStartDrop.x + mixStartInwardDx, y: mixedStartDrop.y)
    )
    _ = vcMixed.selectionOverlay.processDragStep(
      phase: .ended,
      point: CGPoint(x: mixedStartDrop.x + mixStartInwardDx, y: mixedStartDrop.y)
    )
    vcMixed.textHostView.copy(nil)
    requireS3(vcMixed.textHostView.lastCopiedText == "בג", "inward Start drag on 'A אבג B' must yield 'בג', got \(String(describing: vcMixed.textHostView.lastCopiedText))")
    vcMixed.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 2, length: 3))
    // Drag End handle from offset 5 -> offset 4 inside RTL run of LTR doc: must NOT spuriously flip active_drag_handle!
    let mixedBefore = vcMixed.selectionOverlay.currentState
    let mixedEndDrop = CGPoint(x: CGFloat(mixedBefore.end_handle.drop_center_x), y: CGFloat(mixedBefore.end_handle.drop_center_y))
    let cMix4 = vcMixed.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 4))
    let mixDx = cMix4.midX - CGFloat(mixedBefore.end_handle.stem_x)
    _ = vcMixed.selectionOverlay.processDragStep(phase: .began, point: mixedEndDrop)
    let mixedChanged = vcMixed.selectionOverlay.processDragStep(
      phase: .changed,
      point: CGPoint(x: mixedEndDrop.x + mixDx, y: mixedEndDrop.y)
    )
    requireS3(mixedChanged?.active_drag_handle == 2, "dragging End handle inside RTL run of LTR doc must keep active_drag_handle == 2 (got \(String(describing: mixedChanged?.active_drag_handle)))")
    _ = vcMixed.selectionOverlay.processDragStep(
      phase: .ended,
      point: CGPoint(x: mixedEndDrop.x + mixDx, y: mixedEndDrop.y)
    )
    vcMixed.textHostView.copy(nil)
    requireS3(vcMixed.textHostView.lastCopiedText == "אב", "dragging End handle on 'A אבג B' to offset 4 must yield 'אב', got \(String(describing: vcMixed.textHostView.lastCopiedText))")

    // Unicode canonical equivalence cache regression: replacing precomposed "éB" (2 UTF-16)
    // with decomposed "e\u{0301}B" (3 UTF-16) on the same host must NOT hit stale 2-unit cache.
    let vcNorm = MetalHostViewController()
    vcNorm.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcNorm.loadViewIfNeeded()
    vcNorm.view.layoutIfNeeded()
    vcNorm.textHostView.insertText("\u{00E9}B")
    _ = vcNorm.textHostView.selectionRects(for: AffineTextRange(utf16Range: NSRange(location: 1, length: 1)))
    vcNorm.textHostView.replace(
      AffineTextRange(utf16Range: NSRange(location: 0, length: 2)),
      withText: "e\u{0301}B"
    )
    let decomposedBRects = vcNorm.textHostView.selectionRects(
      for: AffineTextRange(utf16Range: NSRange(location: 2, length: 1))
    )
    requireS3(
      decomposedBRects.count == 1 && decomposedBRects[0].rect.width > 6.0,
      "replacing 'éB' with decomposed 'e\\u{0301}B' must return 1 rect >6pt for [2,3), got \(decomposedBRects.map { $0.rect.width })"
    )

    // In-place 0pt drag on End handle of embedded LTR digits "123" inside RTL doc "שלום 123 abc" must preserve [5, 8) "123".
    vcRtl.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 5, length: 3))
    let rtlNumBefore = vcRtl.selectionOverlay.currentState
    let rtlNumDrop = CGPoint(x: CGFloat(rtlNumBefore.end_handle.drop_center_x), y: CGFloat(rtlNumBefore.end_handle.drop_center_y))
    _ = vcRtl.selectionOverlay.processDragStep(phase: .began, point: rtlNumDrop)
    _ = vcRtl.selectionOverlay.processDragStep(phase: .changed, point: rtlNumDrop)
    _ = vcRtl.selectionOverlay.processDragStep(phase: .ended, point: rtlNumDrop)
    let rtlNumAfterZero = (vcRtl.textHostView.selectedTextRange as? AffineTextRange)?.utf16Range
    requireS3(rtlNumAfterZero == NSRange(location: 5, length: 3), "0pt End drag on 'שלום 123 abc' [5,8) must preserve [5,8), got \(String(describing: rtlNumAfterZero))")
    vcRtl.textHostView.copy(nil)
    requireS3(vcRtl.textHostView.lastCopiedText == "123", "0pt End drag on 'שלום 123 abc' [5,8) must keep '123'")
    // Drag End handle on embedded LTR digits "123" inside RTL doc "שלום 123 abc" -> "12" without spurious flip.
    let cNum7 = vcRtl.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 7))
    let numDx = cNum7.midX - CGFloat(rtlNumBefore.end_handle.stem_x)
    _ = vcRtl.selectionOverlay.processDragStep(phase: .began, point: rtlNumDrop)
    let rtlNumChanged = vcRtl.selectionOverlay.processDragStep(
      phase: .changed,
      point: CGPoint(x: rtlNumDrop.x + numDx, y: rtlNumDrop.y)
    )
    requireS3(rtlNumChanged?.active_drag_handle == 2, "dragging End handle inside LTR digits of RTL doc must keep active_drag_handle == 2 (got \(String(describing: rtlNumChanged?.active_drag_handle)))")
    _ = vcRtl.selectionOverlay.processDragStep(
      phase: .ended,
      point: CGPoint(x: rtlNumDrop.x + numDx, y: rtlNumDrop.y)
    )
    vcRtl.textHostView.copy(nil)
    requireS3(vcRtl.textHostView.lastCopiedText == "12", "dragging End handle on 'שלום 123 abc' digits to offset 7 must yield '12', got \(String(describing: vcRtl.textHostView.lastCopiedText))")

    // Single-line drag with +50pt vertical finger drift must not flip active_drag_handle.
    let vcDrift = MetalHostViewController()
    vcDrift.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcDrift.loadViewIfNeeded()
    vcDrift.view.layoutIfNeeded()
    vcDrift.textHostView.insertText("Hello world")
    vcDrift.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 5))
    let driftBefore = vcDrift.selectionOverlay.currentState
    let driftDrop = CGPoint(x: CGFloat(driftBefore.end_handle.drop_center_x), y: CGFloat(driftBefore.end_handle.drop_center_y))
    let cDr5 = vcDrift.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 5))
    let cDr9 = vcDrift.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 9))
    _ = vcDrift.selectionOverlay.processDragStep(phase: .began, point: driftDrop)
    let driftChanged = vcDrift.selectionOverlay.processDragStep(
      phase: .changed,
      point: CGPoint(x: driftDrop.x + (cDr9.midX - cDr5.midX), y: driftDrop.y + 50.0)
    )
    requireS3(driftChanged?.active_drag_handle == 2, "vertical +50pt finger drift on single line must keep active_drag_handle == 2")
    _ = vcDrift.selectionOverlay.processDragStep(
      phase: .ended,
      point: CGPoint(x: driftDrop.x + (cDr9.midX - cDr5.midX), y: driftDrop.y + 50.0)
    )
    vcDrift.textHostView.copy(nil)
    requireS3(vcDrift.textHostView.lastCopiedText == "Hello wor", "vertical drift drag must select 'Hello wor', got \(String(describing: vcDrift.textHostView.lastCopiedText))")

    // Multi-paragraph "A\nשלום" paragraph 2 must set is_rtl == true.
    let vcPara = MetalHostViewController()
    vcPara.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcPara.loadViewIfNeeded()
    vcPara.view.layoutIfNeeded()
    vcPara.textHostView.insertText("A\nשלום")
    vcPara.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 2, length: 4))
    requireS3(vcPara.selectionOverlay.currentState.is_rtl, "selecting Hebrew paragraph 2 in 'A\\nשלום' must set is_rtl == true")

    // ZWJ family emoji ("A👨👩👧👦B") hit-testing never lands inside the 11-unit composed sequence.
    let vcZwj = MetalHostViewController()
    vcZwj.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcZwj.loadViewIfNeeded()
    vcZwj.view.layoutIfNeeded()
    let zwjStr = "A\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}B"
    vcZwj.textHostView.insertText(zwjStr)
    let emojiStart = 1
    let emojiEnd = (zwjStr as NSString).length - 1
    let cEmoji0 = vcZwj.textHostView.caretRect(for: AffineTextPosition(utf16Offset: emojiStart))
    let cEmoji1 = vcZwj.textHostView.caretRect(for: AffineTextPosition(utf16Offset: emojiEnd))
    for step in 0...6 {
      let frac = CGFloat(step) / 6.0
      let probe = CGPoint(x: cEmoji0.minX + (cEmoji1.minX - cEmoji0.minX) * frac, y: cEmoji0.midY)
      let hit = (vcZwj.textHostView.closestPosition(to: probe) as? AffineTextPosition)?.utf16Offset ?? -1
      requireS3(hit <= emojiStart || hit >= emojiEnd, "ZWJ emoji hit-test must never land inside composed sequence (got \(hit), bounds \(emojiStart)..\(emojiEnd))")
    }

    // Soft-wrap boundary offset ("ABCDZ" in 72pt width) starts line 2 and emits no 2pt sliver on line 1.
    let vcNarrow = MetalHostViewController()
    vcNarrow.view.frame = CGRect(x: 0, y: 0, width: 72, height: 300)
    vcNarrow.loadViewIfNeeded()
    vcNarrow.view.layoutIfNeeded()
    vcNarrow.textHostView.insertText("ABCDZ")
    let cNarrow0 = vcNarrow.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 0))
    var wrapBoundaryOffset = -1
    for off in 1..<5 {
      let cOff = vcNarrow.textHostView.caretRect(for: AffineTextPosition(utf16Offset: off))
      if cOff.minY > cNarrow0.minY + 10.0 {
        wrapBoundaryOffset = off
        break
      }
    }
    requireS3(wrapBoundaryOffset > 0, "narrow 72pt viewport must soft-wrap 'ABCDZ'")
    let tailRects = vcNarrow.textHostView.selectionRects(
      for: AffineTextRange(utf16Range: NSRange(location: wrapBoundaryOffset, length: 5 - wrapBoundaryOffset))
    )
    requireS3(tailRects.count == 1 && tailRects[0].rect.minY > cNarrow0.minY + 10.0, "selecting from soft-wrap boundary must emit 1 rect on line 2 with zero sliver on line 1 (got \(tailRects.count))")

    let vcWrap = MetalHostViewController()
    vcWrap.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcWrap.loadViewIfNeeded()
    vcWrap.view.layoutIfNeeded()
    let longLine = "AFFiNE native iOS CoreText soft line wrapping verification across multiple wrapped visual lines"
    vcWrap.textHostView.insertText(longLine)
    let caret0Wrap = vcWrap.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 0))
    let caretWrapLine2 = vcWrap.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 65))
    requireS3(
      caretWrapLine2.minY > caret0Wrap.minY + 10.0,
      "long English line must soft-wrap onto line 2 (y0=\(caret0Wrap.minY), y65=\(caretWrapLine2.minY))"
    )
    vcWrap.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 10, length: 5))
    let wrapState = vcWrap.selectionOverlay.currentState
    let wrapEndDrop = CGPoint(
      x: CGFloat(wrapState.end_handle.drop_center_x),
      y: CGFloat(wrapState.end_handle.drop_center_y)
    )
    let caret15Wrap = vcWrap.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 15))
    _ = vcWrap.selectionOverlay.processDragStep(phase: .began, point: wrapEndDrop)
    _ = vcWrap.selectionOverlay.processDragStep(
      phase: .changed,
      point: CGPoint(
        x: wrapEndDrop.x + (caretWrapLine2.midX - caret15Wrap.midX),
        y: wrapEndDrop.y + (caretWrapLine2.midY - caret15Wrap.midY)
      )
    )
    _ = vcWrap.selectionOverlay.processDragStep(
      phase: .ended,
      point: CGPoint(
        x: wrapEndDrop.x + (caretWrapLine2.midX - caret15Wrap.midX),
        y: wrapEndDrop.y + (caretWrapLine2.midY - caret15Wrap.midY)
      )
    )
    vcWrap.textHostView.copy(nil)
    let wrapRange = (vcWrap.textHostView.selectedTextRange as? AffineTextRange)?.utf16Range
    requireS3(wrapRange != nil && wrapRange!.length >= 50, "soft-wrap drag must span into line 2, got \(String(describing: wrapRange))")
    let wrapSelRects = vcWrap.textHostView.selectionRects(for: AffineTextRange(utf16Range: wrapRange!))
    requireS3(
      wrapSelRects.count >= 2 && wrapSelRects.first!.containsStart && wrapSelRects.last!.containsEnd,
      "multi-line soft-wrap selectionRects must return >=2 per-line rects with start/end flags (got \(wrapSelRects.count))"
    )
    let expectedWrapSub = (longLine as NSString).substring(with: wrapRange!)
    requireS3(vcWrap.textHostView.lastCopiedText == expectedWrapSub, "soft-wrap copy must match exact substring")

    // Rotation / viewport resize (390x844 -> 844x390) must recompute handle endpoints to match unwrapped line geometry.
    let endYPortrait = vcWrap.selectionOverlay.currentState.end_handle.stem_top_y
    vcWrap.view.frame = CGRect(x: 0, y: 0, width: 844, height: 390)
    vcWrap.view.setNeedsLayout()
    vcWrap.view.layoutIfNeeded()
    let endYLandscape = vcWrap.selectionOverlay.currentState.end_handle.stem_top_y
    requireS3(
      endYLandscape < endYPortrait - 10.0,
      "widening viewport 390->844 must move wrapped end handle up to match unwrapped line (portrait=\(endYPortrait), landscape=\(endYLandscape))"
    )

    // 5d. Production host loupe captures real rendered glyph strokes ("WWWW        ....").
    func countDarkPixels(in image: UIImage) -> Int {
      guard let cg = image.cgImage else { return 0 }
      let w = cg.width
      let h = cg.height
      var buf = [UInt8](repeating: 0, count: w * h * 4)
      let cs = CGColorSpaceCreateDeviceRGB()
      let info = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
      guard let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs, bitmapInfo: info) else {
        return 0
      }
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
      var dark = 0
      for i in 0..<(w * h) {
        let base = i * 4
        if buf[base + 3] > 200 && buf[base] < 128 && buf[base + 1] < 128 && buf[base + 2] < 128 {
          dark += 1
        }
      }
      return dark
    }

    let vcLoupe = MetalHostViewController()
    vcLoupe.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcLoupe.loadViewIfNeeded()
    vcLoupe.view.layoutIfNeeded()
    vcLoupe.textHostView.insertText("WWWW        ....")
    vcLoupe.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 0, length: 16))
    let loupeStartState = vcLoupe.selectionOverlay.currentState
    let loupeDrop = CGPoint(
      x: CGFloat(loupeStartState.end_handle.drop_center_x),
      y: CGFloat(loupeStartState.end_handle.drop_center_y)
    )
    let caret16L = vcLoupe.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 16))
    let caret2W = vcLoupe.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 2))
    let caret10Space = vcLoupe.textHostView.caretRect(for: AffineTextPosition(utf16Offset: 10))
    _ = vcLoupe.selectionOverlay.processDragStep(phase: .began, point: loupeDrop)
    _ = vcLoupe.selectionOverlay.processDragStep(
      phase: .changed,
      point: CGPoint(x: loupeDrop.x + (caret2W.midX - caret16L.midX), y: loupeDrop.y)
    )
    let darkAtW = vcLoupe.selectionOverlay.loupeSnapshotImage.map(countDarkPixels(in:)) ?? 0
    _ = vcLoupe.selectionOverlay.processDragStep(
      phase: .changed,
      point: CGPoint(x: loupeDrop.x + (caret10Space.midX - caret16L.midX), y: loupeDrop.y)
    )
    let darkAtSpace = vcLoupe.selectionOverlay.loupeSnapshotImage.map(countDarkPixels(in:)) ?? 0
    _ = vcLoupe.selectionOverlay.processDragStep(phase: .ended, point: loupeDrop)
    requireS3(
      darkAtW > 0 && darkAtW > darkAtSpace,
      "loupe must capture real rendered glyph strokes (darkAtW=\(darkAtW), darkAtSpace=\(darkAtSpace))"
    )

    // 5e. Keyboard occlusion hides handles & menu at y ~= 710, preserves selection/copy, then restores on dismiss.
    let vcKb = MetalHostViewController()
    vcKb.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    vcKb.loadViewIfNeeded()
    vcKb.view.layoutIfNeeded()
    let fillerLines = String(repeating: "\n", count: 35)
    let bottomWord = "BottomTarget"
    vcKb.textHostView.insertText(fillerLines + bottomWord)
    vcKb.textHostView.selectedTextRange = AffineTextRange(
      utf16Range: NSRange(location: fillerLines.utf16.count, length: bottomWord.utf16.count)
    )
    let kbBefore = vcKb.selectionOverlay.currentState
    requireS3(kbBefore.start_handle.stem_top_y > 650.0, "bottom selection must sit below y=650 (got \(kbBefore.start_handle.stem_top_y))")
    requireS3(kbBefore.start_handle.visible && kbBefore.end_handle.visible && vcKb.presentedMenuAnchorRect != nil, "handles and menu visible before keyboard")

    _ = vcKb.keyboardCoordinator.applyKeyboardFrame(
      windowBounds: CGRect(x: 0, y: 0, width: 390, height: 844),
      keyboardFrameInView: CGRect(x: 0, y: 542, width: 390, height: 302),
      safeAreaInsets: .zero,
      isHidden: false,
      durationSec: 0.0,
      timestampSec: 1.0
    )
    vcKb.sampleInsets(timestamp: 1.0)
    let kbOccluded = vcKb.selectionOverlay.currentState
    requireS3(
      !kbOccluded.start_handle.visible && !kbOccluded.end_handle.visible && vcKb.presentedMenuAnchorRect == nil,
      "keyboard covering selection must hide handles and presentedMenuAnchorRect"
    )
    vcKb.textHostView.copy(nil)
    requireS3(vcKb.textHostView.lastCopiedText == bottomWord, "selection and copy must stay intact while keyboard occludes")

    _ = vcKb.keyboardCoordinator.applyKeyboardFrame(
      windowBounds: CGRect(x: 0, y: 0, width: 390, height: 844),
      keyboardFrameInView: CGRect(x: 0, y: 844, width: 390, height: 302),
      safeAreaInsets: .zero,
      isHidden: true,
      durationSec: 0.0,
      timestampSec: 2.0
    )
    vcKb.sampleInsets(timestamp: 2.0)
    let kbRestored = vcKb.selectionOverlay.currentState
    requireS3(
      kbRestored.start_handle.visible && kbRestored.end_handle.visible && vcKb.presentedMenuAnchorRect != nil,
      "dismissing keyboard must restore handles and presentedMenuAnchorRect"
    )

    // 5f. Optional offscreen visual evidence capture directly from real production host views
    // (using the production `#FAFAFC` clear color with zero test background overrides).
    if let outPath = ProcessInfo.processInfo.environment["AFFINE_IOS_EVIDENCE_PNG"], !outPath.isEmpty {
      let evVcTop = MetalHostViewController()
      evVcTop.view.frame = CGRect(x: 0, y: 0, width: 390, height: 300)
      evVcTop.loadViewIfNeeded()
      evVcTop.view.layoutIfNeeded()
      let topText = "AFFiNE Native iOS — CoreText & Loupe\n\n\n\n\n\nHello world\n\nשלום 123 abc\nسلام 123 abc"
      evVcTop.textHostView.insertText(topText)
      let selStart = ("AFFiNE Native iOS — CoreText & Loupe\n\n\n\n\n\n" as NSString).length
      evVcTop.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: selStart, length: 11))
      let evState = evVcTop.selectionOverlay.currentState
      let evDrop = CGPoint(x: CGFloat(evState.end_handle.drop_center_x), y: CGFloat(evState.end_handle.drop_center_y))
      _ = evVcTop.selectionOverlay.processDragStep(phase: .began, point: evDrop)
      _ = evVcTop.selectionOverlay.processDragStep(phase: .changed, point: evDrop)

      let evVcBidi = MetalHostViewController()
      evVcBidi.view.frame = CGRect(x: 0, y: 0, width: 390, height: 80)
      evVcBidi.loadViewIfNeeded()
      evVcBidi.view.layoutIfNeeded()
      evVcBidi.textHostView.insertText("A אבג B")
      evVcBidi.textHostView.selectedTextRange = AffineTextRange(utf16Range: NSRange(location: 2, length: 3))

      let fmt = UIGraphicsImageRendererFormat()
      fmt.scale = 2.0
      fmt.opaque = true
      let renderer = UIGraphicsImageRenderer(size: CGSize(width: 390, height: 380), format: fmt)
      let shot = renderer.image { ctx in
        evVcTop.view.layer.render(in: ctx.cgContext)
        ctx.cgContext.saveGState()
        ctx.cgContext.translateBy(x: 0, y: 300)
        evVcBidi.view.layer.render(in: ctx.cgContext)
        ctx.cgContext.restoreGState()
      }
      if let png = shot.pngData() {
        try? png.write(to: URL(fileURLWithPath: outPath))
      }
    }
    print("PASS [5/5]: MetalHostViewController E2E selection, crossover, RTL/soft-wrap, real loupe glyphs, and keyboard occlusion/restore passed")
  }
}
