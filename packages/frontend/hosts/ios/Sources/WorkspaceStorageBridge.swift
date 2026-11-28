import Foundation

enum WorkspaceStorageBridgeError: Error, Equatable {
  case documentsDirectoryUnavailable
  case localAllowlistRequired
  case openFailed
  case operationFailed
}

/// Thin Swift wrapper over the in-place 0.27.5 SQLite WAL C ABI in `affine_mobile_host.h`.
final class WorkspaceStorageBridge {
  private var handle: OpaquePointer?

  init(
    spaceType: String,
    peer: String,
    spaceId: String,
    allowlistedLocalIds: [String]? = nil,
    documentsDirectory: URL? = nil
  ) throws {
    let isLocalWorkspace = spaceType == "workspace" && peer == "local"
    if isLocalWorkspace {
      guard let ids = allowlistedLocalIds, ids.contains(spaceId) else {
        throw WorkspaceStorageBridgeError.localAllowlistRequired
      }
    }

    guard
      let docsDir = documentsDirectory
        ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    else {
      throw WorkspaceStorageBridgeError.documentsDirectoryUnavailable
    }

    let allowlistJson: String?
    if let ids = allowlistedLocalIds {
      guard
        let data = try? JSONEncoder().encode(ids),
        let json = String(data: data, encoding: .utf8)
      else {
        throw WorkspaceStorageBridgeError.openFailed
      }
      allowlistJson = json
    } else {
      allowlistJson = nil
    }

    let opened: OpaquePointer? = docsDir.path.withCString { cDocs in
      spaceType.withCString { cType in
        peer.withCString { cPeer in
          spaceId.withCString { cSpace in
            if let allowlistJson {
              return allowlistJson.withCString { cAllow in
                affine_ios_workspace_open(cDocs, cType, cPeer, cSpace, cAllow)
              }
            }
            return affine_ios_workspace_open(cDocs, cType, cPeer, cSpace, nil)
          }
        }
      }
    }
    guard let opened else {
      throw WorkspaceStorageBridgeError.openFailed
    }
    self.handle = opened
  }

  deinit {
    close()
  }

  func close() {
    if let handle {
      affine_ios_workspace_close(handle)
      self.handle = nil
    }
  }

  func readDoc(docId: String) -> Data? {
    guard let handle else { return nil }
    let buffer = docId.withCString { affine_ios_workspace_read_doc(handle, $0) }
    return takeBytes(buffer)
  }

  func readPageSnapshotJson(docId: String, clientId: UInt64) -> String? {
    guard let handle else { return nil }
    let ptr = docId.withCString { affine_ios_workspace_read_page_snapshot_json(handle, $0, clientId) }
    guard let ptr else { return nil }
    defer { affine_ios_string_free(ptr) }
    return String(cString: ptr)
  }

  func editParagraphText(
    docId: String,
    blockId: String,
    utf16Index: UInt64,
    deleteLen: UInt64,
    insertText: String,
    clientId: UInt64,
    nowMs: Int64
  ) -> Data? {
    guard let handle else { return nil }
    let buffer = docId.withCString { cDoc in
      blockId.withCString { cBlock in
        insertText.withCString { cText in
          affine_ios_workspace_edit_paragraph_text(
            handle,
            cDoc,
            cBlock,
            utf16Index,
            deleteLen,
            cText,
            clientId,
            nowMs
          )
        }
      }
    }
    return takeBytes(buffer)
  }

  func exportPendingDiff(docId: String, remoteStateVector: Data? = nil) -> Data? {
    guard let handle else { return nil }
    let buffer: AffineIosByteBuffer = docId.withCString { cDoc in
      if let remoteStateVector, !remoteStateVector.isEmpty {
        return remoteStateVector.withUnsafeBytes { raw in
          let bytes = raw.bindMemory(to: UInt8.self).baseAddress
          return affine_ios_workspace_export_doc_diff(handle, cDoc, bytes, remoteStateVector.count)
        }
      }
      return affine_ios_workspace_export_doc_diff(handle, cDoc, nil, 0)
    }
    return takeBytes(buffer)
  }

  func applyRemoteUpdate(
    docId: String,
    update: Data,
    peer: String,
    remoteClockMs: Int64,
    localNowMs: Int64
  ) -> Data? {
    guard let handle else { return nil }
    let buffer: AffineIosByteBuffer = docId.withCString { cDoc in
      peer.withCString { cPeer in
        update.withUnsafeBytes { raw in
          let bytes = raw.bindMemory(to: UInt8.self).baseAddress
          return affine_ios_workspace_apply_remote_update(
            handle,
            cDoc,
            bytes,
            update.count,
            cPeer,
            remoteClockMs,
            localNowMs
          )
        }
      }
    }
    return takeBytes(buffer)
  }

  func checkpointPassive() -> Bool {
    guard let handle else { return false }
    return affine_ios_workspace_checkpoint_passive(handle)
  }

  func checkpoint() -> Bool {
    guard let handle else { return false }
    return affine_ios_workspace_checkpoint(handle)
  }

  func readBlob(key: String) -> Data? {
    guard let handle else { return nil }
    let buffer = key.withCString { affine_ios_workspace_read_blob(handle, $0) }
    return takeBytes(buffer)
  }

  func ingestShareItem(requestJson: String, blobBytes: Data) -> String? {
    guard let handle else { return nil }
    let ptr: UnsafeMutablePointer<CChar>? = requestJson.withCString { cReq in
      if blobBytes.isEmpty {
        return affine_ios_workspace_ingest_share_item(handle, cReq, nil, 0)
      }
      return blobBytes.withUnsafeBytes { raw in
        let base = raw.bindMemory(to: UInt8.self).baseAddress
        return affine_ios_workspace_ingest_share_item(handle, cReq, base, blobBytes.count)
      }
    }
    guard let ptr else { return nil }
    defer { affine_ios_string_free(ptr) }
    return String(cString: ptr)
  }

  private func takeBytes(_ buffer: AffineIosByteBuffer) -> Data? {
    defer { affine_ios_bytes_free(buffer) }
    guard let ptr = buffer.ptr, buffer.len > 0 else {
      return nil
    }
    return Data(bytes: ptr, count: buffer.len)
  }
}
