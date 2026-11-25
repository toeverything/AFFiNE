import CoreGraphics
import Foundation
import PDFKit

enum PdfRendererError: Error, Equatable {
  case invalidArgument
  case emptyDocument
  case documentTooLarge
  case invalidOrEncryptedPdf
  case pathOutsideAllowedDirectory
  case pageOutOfRange
  case invalidDimensions
  case pixelLimitExceeded
  case renderFailed
}

struct PdfDocumentHandle {
  let document: PDFDocument

  var pageCount: Int {
    document.pageCount
  }
}

struct PdfRenderedPage: Equatable {
  let widthPx: Int
  let heightPx: Int
  let rgba8: Data
}

/// Native iOS `PDFKit` page renderer bridge (zero C++ PDFium dependency).
/// Shares header, page-bounds, and OOM pixel-budget invariants with Rust `src/pdf.rs`
/// and manages explicit open/close document handles with zero persistent cache.
final class PdfRendererBridge {
  static let maxDocumentBytes = 128 * 1024 * 1024

  private let handleLock = NSLock()
  private var nextDocId: UInt64 = 1
  private var openDocuments: [UInt64: PdfDocumentHandle] = [:]

  var openDocumentCount: Int {
    handleLock.lock()
    defer { handleLock.unlock() }
    return openDocuments.count
  }

  func open(data: Data) throws -> PdfDocumentHandle {
    let validationCode = data.withUnsafeBytes { rawBuf -> UInt32 in
      let ptr = rawBuf.bindMemory(to: UInt8.self).baseAddress
      return affine_ios_pdf_validate_bytes(ptr, data.count)
    }
    if validationCode != 0 {
      throw mapErrorCode(validationCode)
    }
    // Check `!doc.isLocked` (not `!doc.isEncrypted`) so PDFs with only an owner
    // permission password and no user reading password still open cleanly.
    guard let doc = PDFDocument(data: data), !doc.isLocked, doc.pageCount > 0 else {
      throw PdfRendererError.invalidOrEncryptedPdf
    }
    return PdfDocumentHandle(document: doc)
  }

  /// Open a PDF from a controlled local file path strictly contained inside `allowedDirectory`.
  func open(fileURL: URL, allowedDirectory: URL) throws -> PdfDocumentHandle {
    guard fileURL.isFileURL, allowedDirectory.isFileURL else {
      throw PdfRendererError.invalidArgument
    }
    let canonicalRoot = allowedDirectory.standardizedFileURL.resolvingSymlinksInPath()
    let canonicalFile = fileURL.standardizedFileURL.resolvingSymlinksInPath()
    let rootPrefix = canonicalRoot.path.hasSuffix("/") ? canonicalRoot.path : canonicalRoot.path + "/"
    guard canonicalFile.path.hasPrefix(rootPrefix) else {
      throw PdfRendererError.pathOutsideAllowedDirectory
    }
    let attrs = try FileManager.default.attributesOfItem(atPath: canonicalFile.path)
    if let fileSize = attrs[.size] as? NSNumber, fileSize.intValue > Self.maxDocumentBytes {
      throw PdfRendererError.documentTooLarge
    }
    let data = try Data(contentsOf: canonicalFile, options: [.mappedIfSafe])
    return try open(data: data)
  }

  /// Return the displayed `.cropBox` size in PDF points after applying `/Rotate`.
  func pageSizePoints(of handle: PdfDocumentHandle, pageIndex: Int) throws -> CGSize {
    guard pageIndex >= 0, pageIndex < handle.pageCount, let page = handle.document.page(at: pageIndex) else {
      throw PdfRendererError.pageOutOfRange
    }
    let shownSize = displayedPageSize(page)
    guard shownSize.width > 0, shownSize.height > 0 else {
      throw PdfRendererError.invalidDimensions
    }
    return shownSize
  }

  /// Rasterize a single PDF page onto a white anti-aliased RGBA8 canvas.
  func renderPageRgba8(
    of handle: PdfDocumentHandle,
    pageIndex: Int,
    targetWidthPx: Int,
    targetHeightPx: Int
  ) throws -> PdfRenderedPage {
    guard pageIndex >= 0, let pageIdx32 = UInt32(exactly: pageIndex) else {
      throw PdfRendererError.pageOutOfRange
    }
    guard targetWidthPx >= 0, targetHeightPx >= 0 else {
      throw PdfRendererError.invalidDimensions
    }
    guard
      let width32 = UInt32(exactly: targetWidthPx),
      let height32 = UInt32(exactly: targetHeightPx)
    else {
      throw PdfRendererError.pixelLimitExceeded
    }
    let plan = affine_ios_pdf_plan_render(
      pageIdx32,
      UInt32(handle.pageCount),
      width32,
      height32
    )
    if plan.error != 0 {
      throw mapErrorCode(plan.error)
    }
    guard let page = handle.document.page(at: pageIndex) else {
      throw PdfRendererError.pageOutOfRange
    }
    var rgba = Data(count: plan.byte_len)
    let ok = rgba.withUnsafeMutableBytes { rawBuf -> Bool in
      guard let base = rawBuf.baseAddress else {
        return false
      }
      return rasterizePage(
        page,
        widthPx: Int(plan.target_width_px),
        heightPx: Int(plan.target_height_px),
        into: base,
        byteLen: plan.byte_len
      )
    }
    guard ok else {
      throw PdfRendererError.renderFailed
    }
    return PdfRenderedPage(
      widthPx: Int(plan.target_width_px),
      heightPx: Int(plan.target_height_px),
      rgba8: rgba
    )
  }

  /// Register this bridge as the explicit-handle C-ABI `AffinePdfProvider` on `host`.
  func attach(to host: OpaquePointer) {
    let provider = AffinePdfProvider(
      open_doc: { pdfPtr, pdfLen, userData in
        guard let pdfPtr, pdfLen > 0, let userData else {
          return 0
        }
        let bridge = Unmanaged<PdfRendererBridge>.fromOpaque(userData).takeUnretainedValue()
        // Copy into owned Data once on open; freed immediately on `close_doc`.
        let owned = Data(bytes: pdfPtr, count: pdfLen)
        guard let handle = try? bridge.open(data: owned) else {
          return 0
        }
        return bridge.insertDocument(handle)
      },
      close_doc: { docId, userData in
        guard docId != 0, let userData else {
          return
        }
        let bridge = Unmanaged<PdfRendererBridge>.fromOpaque(userData).takeUnretainedValue()
        bridge.removeDocument(id: docId)
      },
      doc_page_count: { docId, userData in
        guard docId != 0, let userData else {
          return 0
        }
        let bridge = Unmanaged<PdfRendererBridge>.fromOpaque(userData).takeUnretainedValue()
        guard let handle = bridge.lookupDocument(id: docId) else {
          return 0
        }
        return UInt32(handle.pageCount)
      },
      doc_page_size: { docId, pageIndex, outSize, userData in
        guard docId != 0, let outSize, let userData else {
          return false
        }
        let bridge = Unmanaged<PdfRendererBridge>.fromOpaque(userData).takeUnretainedValue()
        guard
          let handle = bridge.lookupDocument(id: docId),
          let size = try? bridge.pageSizePoints(of: handle, pageIndex: Int(pageIndex))
        else {
          return false
        }
        outSize.pointee = AffinePdfPageSize(
          width_pt: Float(size.width),
          height_pt: Float(size.height)
        )
        return true
      },
      doc_render_rgba8: { docId, pageIndex, widthPx, heightPx, outRgbaPtr, outRgbaLen, userData in
        guard docId != 0, let outRgbaPtr, outRgbaLen > 0, let userData else {
          return false
        }
        let bridge = Unmanaged<PdfRendererBridge>.fromOpaque(userData).takeUnretainedValue()
        guard
          let handle = bridge.lookupDocument(id: docId),
          let page = handle.document.page(at: Int(pageIndex))
        else {
          return false
        }
        return bridge.rasterizePage(
          page,
          widthPx: Int(widthPx),
          heightPx: Int(heightPx),
          into: outRgbaPtr,
          byteLen: outRgbaLen
        )
      },
      user_data: Unmanaged.passUnretained(self).toOpaque()
    )
    affine_ios_host_set_pdf_provider(host, provider)
  }

  func detach(from host: OpaquePointer) {
    let empty = AffinePdfProvider(
      open_doc: nil,
      close_doc: nil,
      doc_page_count: nil,
      doc_page_size: nil,
      doc_render_rgba8: nil,
      user_data: nil
    )
    affine_ios_host_set_pdf_provider(host, empty)
    handleLock.lock()
    openDocuments.removeAll()
    handleLock.unlock()
  }

  private func insertDocument(_ handle: PdfDocumentHandle) -> UInt64 {
    handleLock.lock()
    defer { handleLock.unlock() }
    let id = nextDocId
    nextDocId &+= 1
    if nextDocId == 0 {
      nextDocId = 1
    }
    openDocuments[id] = handle
    return id
  }

  private func lookupDocument(id: UInt64) -> PdfDocumentHandle? {
    handleLock.lock()
    defer { handleLock.unlock() }
    return openDocuments[id]
  }

  private func removeDocument(id: UInt64) {
    handleLock.lock()
    openDocuments.removeValue(forKey: id)
    handleLock.unlock()
  }

  private func displayedPageSize(_ page: PDFPage) -> CGSize {
    let box = page.bounds(for: .cropBox)
    let rot = ((page.rotation % 360) + 360) % 360
    return (rot == 90 || rot == 270)
      ? CGSize(width: box.height, height: box.width)
      : box.size
  }

  private func rasterizePage(
    _ page: PDFPage,
    widthPx: Int,
    heightPx: Int,
    into buffer: UnsafeMutableRawPointer,
    byteLen: Int
  ) -> Bool {
    let expectedBytes = widthPx * heightPx * 4
    guard widthPx > 0, heightPx > 0, byteLen == expectedBytes else {
      return false
    }
    let shownSize = displayedPageSize(page)
    guard shownSize.width > 0, shownSize.height > 0 else {
      return false
    }
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo =
      CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
    guard let ctx = CGContext(
      data: buffer,
      width: widthPx,
      height: heightPx,
      bitsPerComponent: 8,
      bytesPerRow: widthPx * 4,
      space: colorSpace,
      bitmapInfo: bitmapInfo
    ) else {
      return false
    }
    ctx.setFillColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0)
    ctx.fill(CGRect(x: 0, y: 0, width: widthPx, height: heightPx))
    ctx.setAllowsAntialiasing(true)
    ctx.setShouldAntialias(true)
    ctx.interpolationQuality = .high

    // `PDFPage.draw(with: .cropBox, to:)` already applies `-cropBox.origin` translation
    // and `/Rotate` transforms; apply only the target pixel scale factor here.
    ctx.saveGState()
    ctx.scaleBy(
      x: CGFloat(widthPx) / shownSize.width,
      y: CGFloat(heightPx) / shownSize.height
    )
    page.draw(with: .cropBox, to: ctx)
    ctx.restoreGState()
    return true
  }

  private func mapErrorCode(_ code: UInt32) -> PdfRendererError {
    switch code {
    case 1: return .invalidArgument
    case 2: return .emptyDocument
    case 3: return .documentTooLarge
    case 4: return .invalidOrEncryptedPdf
    case 5: return .pageOutOfRange
    case 6: return .invalidDimensions
    case 7: return .pixelLimitExceeded
    default: return .renderFailed
    }
  }
}
