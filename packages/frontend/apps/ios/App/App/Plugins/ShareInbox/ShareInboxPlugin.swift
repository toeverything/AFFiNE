import Capacitor
import Foundation

@objc(ShareInboxPlugin)
public final class ShareInboxPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "ShareInboxPlugin"
  public let jsName = "ShareInbox"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "listPending", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "updateWorkspaceMode", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "updateTarget", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolveAttachment", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "complete", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setError", returnType: CAPPluginReturnPromise),
  ]

  private let store = ShareInboxStore.shared
  private let encoder: JSONEncoder = {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    return encoder
  }()

  @objc func listPending(_ call: CAPPluginCall) {
    do {
      let items = try store.pendingItems().compactMap { item -> [String: Any]? in
        if item.result != nil {
          try? store.remove(item)
          return nil
        }
        let data = try encoder.encode(item)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any]
      }
      call.resolve(["items": items])
    } catch {
      call.reject("Failed to read shared content.", nil, error)
    }
  }

  @objc func updateWorkspaceMode(_ call: CAPPluginCall) {
    do {
      guard let value = call.getString("mode"), let mode = ShareWorkspaceMode(rawValue: value) else {
        throw ShareInboxError.invalidPayload
      }
      try store.updateWorkspaceMode(mode)
      call.resolve()
    } catch {
      call.reject("Failed to update share privacy mode.", nil, error)
    }
  }

  @objc func updateTarget(_ call: CAPPluginCall) {
    do {
      var item = try item(from: call)
      guard let target = call.getObject("target"),
            let workspaceId = target["workspaceId"] as? String,
            let workspaceFlavour = target["workspaceFlavour"] as? String,
            let tagIds = target["tagIds"] as? [String]
      else {
        throw ShareInboxError.invalidPayload
      }
      item.target = ShareInboxTarget(
        workspaceId: workspaceId,
        workspaceFlavour: workspaceFlavour,
        tagIds: tagIds,
        collectionId: target["collectionId"] as? String
      )
      item.lastError = nil
      try store.update(item)
      call.resolve()
    } catch {
      call.reject("Failed to update the share destination.", nil, error)
    }
  }

  @objc func resolveAttachment(_ call: CAPPluginCall) {
    do {
      let item = try item(from: call)
      guard let attachment = item.attachments.first,
            let url = store.attachmentURL(for: attachment),
            FileManager.default.fileExists(atPath: url.path)
      else {
        call.resolve([:])
        return
      }
      call.resolve([
        "path": url.absoluteString,
        "mimeType": attachment.mimeType,
      ])
    } catch {
      call.reject("Failed to resolve the shared attachment.", nil, error)
    }
  }

  @objc func complete(_ call: CAPPluginCall) {
    do {
      var item = try item(from: call)
      guard let docId = call.getString("docId"), !docId.isEmpty else {
        throw ShareInboxError.invalidPayload
      }
      item.result = ShareInboxResult(docId: docId, committedAt: Date())
      item.lastError = nil
      try store.update(item)
      try store.remove(item)
      call.resolve()
    } catch {
      call.reject("Failed to finish importing shared content.", nil, error)
    }
  }

  @objc func setError(_ call: CAPPluginCall) {
    do {
      var item = try item(from: call)
      guard let error = call.getString("error"), !error.isEmpty else {
        throw ShareInboxError.invalidPayload
      }
      item.lastError = error
      try store.update(item)
      call.resolve()
    } catch {
      call.reject("Failed to update shared content.", nil, error)
    }
  }

  private func item(from call: CAPPluginCall) throws -> ShareInboxItem {
    guard let itemId = call.getString("itemId"),
          let item = store.pendingItems().first(where: { $0.id == itemId })
    else {
      throw ShareInboxError.invalidPayload
    }
    return item
  }
}
