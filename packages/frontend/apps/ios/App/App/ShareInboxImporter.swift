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
  private var retryTask: Task<Void, Never>?

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

  /// Drain inbox with retries so cold-start has time for JS bridge + workspace bootstrap.
  func processPendingItems(using webView: WKWebView?) {
    guard let webView else { return }
    guard !store.pendingItems().isEmpty else { return }
    guard !isProcessing else { return }

    retryTask?.cancel()
    retryTask = Task { @MainActor in
      isProcessing = true
      defer { isProcessing = false }

      // ~30s total budget for cold launch (workspace list + doc engine ready).
      let maxAttempts = 20
      var importedThisRun = Set<String>()
      for attempt in 0..<maxAttempts {
        if Task.isCancelled { return }

        syncWorkspaceCache(from: webView)

        let ready = await isBridgeReady(webView)
        if ready {
          let items = store.pendingItems()
          if items.isEmpty { return }

          var remaining = false
          for item in items {
            if importedThisRun.contains(item.id) || store.isImported(item) {
              do {
                try store.remove(item)
                store.clearImported(item)
              } catch {
                remaining = true
              }
              continue
            }

            let success = await importItem(item, using: webView)
            if success {
              importedThisRun.insert(item.id)
              _ = store.markImported(item)
              do {
                try store.remove(item)
                store.clearImported(item)
              } catch {
                remaining = true
              }
            } else {
              remaining = true
            }
          }
          if !remaining { return }
        }

        let delaySeconds = attempt < 5 ? 1.0 : 2.0
        try? await Task.sleep(nanoseconds: UInt64(delaySeconds * 1_000_000_000))
      }
    }
  }

  private func isBridgeReady(_ webView: WKWebView) async -> Bool {
    await withCheckedContinuation { continuation in
      webView.callAsyncJavaScript(
        """
        return typeof window.createNewDocByMarkdownInCurrentWorkspace === 'function'
          && typeof window.getShareWorkspaceCache === 'function';
        """,
        arguments: [:],
        in: nil,
        in: .page
      ) { result in
        switch result {
        case let .success(value):
          continuation.resume(returning: (value as? Bool) ?? false)
        case .failure:
          continuation.resume(returning: false)
        }
      }
    }
  }

  private func importItem(_ item: ShareInboxItem, using webView: WKWebView) async -> Bool {
    let markdown = SharePayloadBuilder.resolveMarkdown(item: item, store: store)
    let title = item.title
    let workspaceId = item.workspaceId ?? ""
    let workspaceFlavour = item.workspaceFlavour ?? ""

    return await withCheckedContinuation { continuation in
      webView.callAsyncJavaScript(
        """
        return await window.createNewDocByMarkdownInCurrentWorkspace(
          markdown,
          title,
          workspaceId || undefined,
          workspaceFlavour || undefined
        );
        """,
        arguments: [
          "markdown": markdown,
          "title": title,
          "workspaceId": workspaceId,
          "workspaceFlavour": workspaceFlavour,
        ],
        in: nil,
        in: .page
      ) { result in
        switch result {
        case let .success(value):
          // Treat non-empty string docId as success.
          if let docId = value as? String, !docId.isEmpty {
            continuation.resume(returning: true)
          } else {
            continuation.resume(returning: false)
          }
        case .failure:
          continuation.resume(returning: false)
        }
      }
    }
  }

  private func applyWorkspaceCache(_ value: Any?) {
    guard let dictionary = value as? [String: Any] else { return }
    let lastWorkspaceId = dictionary["lastWorkspaceId"] as? String
    let lastWorkspaceFlavour = dictionary["lastWorkspaceFlavour"] as? String
    let rawWorkspaces = dictionary["workspaces"] as? [[String: Any]] ?? []
    let workspaces = rawWorkspaces.compactMap { entry -> ShareWorkspaceInfo? in
      guard let id = entry["id"] as? String, !id.isEmpty else { return nil }
      let flavour = (entry["flavour"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = (entry["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      return ShareWorkspaceInfo(
        id: id,
        flavour: flavour?.isEmpty == false ? flavour : nil,
        name: (name?.isEmpty == false ? name! : id)
      )
    }
    store.updateWorkspaceCache(
      workspaces: workspaces,
      lastWorkspaceId: lastWorkspaceId,
      lastWorkspaceFlavour: lastWorkspaceFlavour
    )
  }
}
