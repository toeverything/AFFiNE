//
//  ShareInboxImporter.swift
//  App
//

import Foundation
import UIKit
import WebKit

@MainActor
final class ShareInboxImporter {
  static let shared = ShareInboxImporter()

  private let store = ShareInboxStore.shared
  private var isProcessing = false

  private init() {}

  func syncWorkspaceCache(from webView: WKWebView?) {
    guard let webView else { return }
    webView.callAsyncJavaScript(
      """
      const list = typeof window.getShareWorkspaceCache === 'function'
        ? await window.getShareWorkspaceCache()
        : null;
      return list;
      """,
      arguments: [:],
      in: nil,
      in: .page
    ) { [weak self] result in
      guard case let .success(value) = result else { return }
      self?.applyWorkspaceCache(value)
    }
  }

  func processPendingItems(using webView: WKWebView?) {
    guard let webView, !isProcessing else { return }
    let items = store.pendingItems()
    guard !items.isEmpty else { return }

    isProcessing = true
    Task { @MainActor in
      defer { isProcessing = false }
      for item in items {
        let success = await importItem(item, using: webView)
        if success {
          store.remove(item)
        }
      }
    }
  }

  private func importItem(_ item: ShareInboxItem, using webView: WKWebView) async -> Bool {
    let markdown = SharePayloadBuilder.resolveMarkdown(item: item, store: store)
    let title = item.title
    let workspaceId = item.workspaceId ?? ""

    return await withCheckedContinuation { continuation in
      webView.callAsyncJavaScript(
        """
        return await window.createNewDocByMarkdownInCurrentWorkspace(markdown, title, workspaceId || undefined);
        """,
        arguments: [
          "markdown": markdown,
          "title": title,
          "workspaceId": workspaceId,
        ],
        in: nil,
        in: .page
      ) { result in
        switch result {
        case let .success(value):
          continuation.resume(returning: value != nil)
        case .failure:
          continuation.resume(returning: false)
        }
      }
    }
  }

  private func applyWorkspaceCache(_ value: Any?) {
    guard let dictionary = value as? [String: Any] else { return }
    let lastWorkspaceId = dictionary["lastWorkspaceId"] as? String
    let rawWorkspaces = dictionary["workspaces"] as? [[String: Any]] ?? []
    let workspaces = rawWorkspaces.compactMap { entry -> ShareWorkspaceInfo? in
      guard let id = entry["id"] as? String, !id.isEmpty else { return nil }
      let name = (entry["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      return ShareWorkspaceInfo(id: id, name: (name?.isEmpty == false ? name! : id))
    }
    store.updateWorkspaceCache(workspaces: workspaces, lastWorkspaceId: lastWorkspaceId)
  }
}
