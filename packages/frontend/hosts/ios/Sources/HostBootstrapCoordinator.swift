import Foundation

struct ParsedLegacyStateSummary: Decodable, Equatable {
  let localWorkspaceIds: [String]
}

struct ParsedLegacyDisposition: Decodable, Equatable {
  let status: String
  let state: ParsedLegacyStateSummary
}

struct LegacyWriteBackPlan: Decodable, Equatable {
  let set: [String: String]
  let remove: [String]
}

enum HostBootstrapError: Error, Equatable {
  case invalidSentinelSnapshot
  case missingImportedState
  case writeBackPlanFailed
  case mountFailures([String])
}

/// Startup coordinator wiring `LegacyLocalStorageProbe` -> Rust sentinel validation ->
/// allowlist-only `WorkspaceStorageBridge` mounting (with eviction on shrink/clear) ->
/// rollback write-back planning -> background `PASSIVE` WAL checkpoints.
@MainActor
final class HostBootstrapCoordinator {
  private let probe = LegacyLocalStorageProbe()
  private let documentsDirectory: URL?
  private(set) var allowlistedLocalIds: [String] = []
  private(set) var lastFailedMountIds: [String] = []
  private(set) var lastSnapshot: LegacyLocalStorageSnapshot?
  private(set) var importedStateJson: String?
  private var activeWorkspaces: [String: WorkspaceStorageBridge] = [:]

  init(documentsDirectory: URL? = nil) {
    self.documentsDirectory = documentsDirectory
  }

  /// Run the one-shot legacy `capacitor://localhost` probe and mount allowlisted local workspaces.
  func bootstrapFromLegacyStorage() async throws -> ParsedLegacyDisposition {
    let snapshot = try await probe.capture()
    return try applySnapshot(snapshot)
  }

  /// Validate a captured sentinel through Rust, retain full imported whitelisted state
  /// (preserving any corrupt raw `affine-local-workspace` verbatim), and reconcile mounted
  /// local workspaces against the parsed allowlist.
  func applySnapshot(_ snapshot: LegacyLocalStorageSnapshot) throws -> ParsedLegacyDisposition {
    let snapshotData = try JSONEncoder().encode(snapshot)
    guard let snapshotJson = String(data: snapshotData, encoding: .utf8) else {
      throw HostBootstrapError.invalidSentinelSnapshot
    }
    let dispositionPtr = snapshotJson.withCString {
      affine_ios_legacy_storage_parse_snapshot_json($0)
    }
    guard let dispositionPtr else {
      throw HostBootstrapError.invalidSentinelSnapshot
    }
    defer { affine_ios_string_free(dispositionPtr) }
    let dispositionData = Data(String(cString: dispositionPtr).utf8)
    let disposition = try JSONDecoder().decode(ParsedLegacyDisposition.self, from: dispositionData)

    guard
      let rootObj = try JSONSerialization.jsonObject(with: dispositionData) as? [String: Any],
      let stateObj = rootObj["state"],
      let stateBytes = try? JSONSerialization.data(withJSONObject: stateObj),
      let stateJson = String(data: stateBytes, encoding: .utf8)
    else {
      throw HostBootstrapError.invalidSentinelSnapshot
    }

    lastSnapshot = snapshot
    importedStateJson = stateJson
    try reconcileActiveWorkspaces(disposition.state.localWorkspaceIds)
    return disposition
  }

  /// Explicitly update the local workspace allowlist after bootstrap:
  /// syncs `importedStateJson` (clearing any prior corrupt raw `affine-local-workspace` so
  /// deleted workspaces never resurrect on rollback), evicts removed handles, mounts all
  /// valid entries, and throws a summarized error if any entry fails to mount.
  func applyLocalWorkspaceAllowlist(_ nextAllowlist: [String]) throws {
    updateImportedLocalWorkspaceIds(nextAllowlist)
    try reconcileActiveWorkspaces(nextAllowlist)
  }

  /// Generate a rollback write-back plan preserving all imported whitelisted entries
  /// (including server configs, theme, preferences, and any corrupt raw `affine-local-workspace`).
  func buildRollbackWriteBackPlan() throws -> LegacyWriteBackPlan {
    guard lastFailedMountIds.isEmpty else {
      throw HostBootstrapError.mountFailures(lastFailedMountIds)
    }
    guard let stateJson = importedStateJson, let snapshot = lastSnapshot else {
      throw HostBootstrapError.missingImportedState
    }
    let prevKeysData = try JSONEncoder().encode(snapshot.keys)
    guard let prevKeysJson = String(data: prevKeysData, encoding: .utf8) else {
      throw HostBootstrapError.writeBackPlanFailed
    }
    let planPtr = stateJson.withCString { cState in
      prevKeysJson.withCString { cKeys in
        affine_ios_legacy_storage_plan_write_back_json(cState, cKeys)
      }
    }
    guard let planPtr else {
      throw HostBootstrapError.writeBackPlanFailed
    }
    defer { affine_ios_string_free(planPtr) }
    let planData = Data(String(cString: planPtr).utf8)
    return try JSONDecoder().decode(LegacyWriteBackPlan.self, from: planData)
  }

  func registerActiveWorkspace(id: String, bridge: WorkspaceStorageBridge) {
    activeWorkspaces[id] = bridge
  }

  func workspace(id: String) -> WorkspaceStorageBridge? {
    activeWorkspaces[id]
  }

  /// Non-blocking `PRAGMA wal_checkpoint(PASSIVE)` across all active workspaces on background entry.
  @discardableResult
  func checkpointAllPassive() -> Bool {
    var allSucceeded = true
    for bridge in activeWorkspaces.values {
      if !bridge.checkpointPassive() {
        allSucceeded = false
      }
    }
    return allSucceeded
  }

  func closeAll() {
    for bridge in activeWorkspaces.values {
      bridge.close()
    }
    activeWorkspaces.removeAll()
  }

  private func reconcileActiveWorkspaces(_ nextAllowlist: [String]) throws {
    let nextSet = Set(nextAllowlist)
    let removedIds = activeWorkspaces.keys.filter { !nextSet.contains($0) }
    for id in removedIds {
      activeWorkspaces[id]?.close()
      activeWorkspaces.removeValue(forKey: id)
    }

    allowlistedLocalIds = nextAllowlist
    var failedIds: [String] = []
    for workspaceId in allowlistedLocalIds where activeWorkspaces[workspaceId] == nil {
      do {
        let bridge = try WorkspaceStorageBridge(
          spaceType: "workspace",
          peer: "local",
          spaceId: workspaceId,
          allowlistedLocalIds: allowlistedLocalIds,
          documentsDirectory: documentsDirectory
        )
        activeWorkspaces[workspaceId] = bridge
      } catch {
        failedIds.append(workspaceId)
      }
    }
    lastFailedMountIds = failedIds
    if !failedIds.isEmpty {
      throw HostBootstrapError.mountFailures(failedIds)
    }
  }

  private func updateImportedLocalWorkspaceIds(_ nextAllowlist: [String]) {
    guard
      let currentJson = importedStateJson,
      let data = currentJson.data(using: .utf8),
      var stateObj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else {
      return
    }
    let previousLocalIds = (stateObj["localWorkspaceIds"] as? [String]) ?? allowlistedLocalIds
    let removedLocalIds = Set(previousLocalIds).subtracting(Set(nextAllowlist))
    stateObj["localWorkspaceIds"] = nextAllowlist
    if var rawEntries = stateObj["rawUnparsedEntries"] as? [String: String] {
      rawEntries.removeValue(forKey: LegacyLocalStorageProbe.localWorkspaceKey)
      stateObj["rawUnparsedEntries"] = rawEntries
    }
    let currentFlavour = (stateObj["lastWorkspaceFlavour"] as? String) ?? "local"
    if let lastId = stateObj["lastWorkspaceId"] as? String,
      removedLocalIds.contains(lastId),
      currentFlavour == "local"
    {
      stateObj["lastWorkspaceId"] = NSNull()
      stateObj["lastWorkspaceFlavour"] = NSNull()
    }
    if let updatedData = try? JSONSerialization.data(withJSONObject: stateObj),
      let updatedJson = String(data: updatedData, encoding: .utf8)
    {
      importedStateJson = updatedJson
    }
  }
}
