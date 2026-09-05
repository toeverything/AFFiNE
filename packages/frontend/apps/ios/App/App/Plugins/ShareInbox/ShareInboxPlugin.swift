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
      let items = try store.pendingItems().compactMap { entry -> [String: Any]? in
        switch entry {
        case let .ready(item):
          if item.result != nil {
            try? store.remove(item)
            return nil
          }
          let data = try encoder.encode(item)
          guard let item = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
          }
          return ["status": "ready", "item": item]
        case let .unsupportedVersion(itemId, schemaVersion):
          return [
            "status": "unsupported-version",
            "id": itemId,
            "schemaVersion": schemaVersion,
          ]
        }
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
      guard let attachment = store.resolveAttachment(for: item)
      else {
        call.resolve([:])
        return
      }
      call.resolve([
        "itemId": attachment.itemId,
        "fileUrl": attachment.url.absoluteString,
        "relativePath": attachment.relativePath,
        "name": attachment.name,
        "mimeType": attachment.mimeType,
        "size": attachment.size,
      ])
    } catch {
      call.reject("Failed to resolve the shared attachment.", nil, error)
    }
  }

  @objc func complete(_ call: CAPPluginCall) {
    do {
      guard let itemId = call.getString("itemId"), !itemId.isEmpty else {
        throw ShareInboxError.invalidPayload
      }
      guard let docId = call.getString("docId"), !docId.isEmpty else {
        throw ShareInboxError.invalidPayload
      }
      try store.complete(itemId: itemId, docId: docId, committedAt: Date())
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
          let item = store.pendingItems().compactMap({ entry -> ShareInboxItem? in
            guard case let .ready(item) = entry else { return nil }
            return item
          }).first(where: { $0.id == itemId })
    else {
      throw ShareInboxError.invalidPayload
    }
    return item
  }
}
