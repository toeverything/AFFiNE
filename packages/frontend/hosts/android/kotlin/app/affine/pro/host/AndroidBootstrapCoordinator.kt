package app.affine.pro.host

/**
 * Outcome of the one-shot legacy Android bootstrap sequence.
 */
data class BootstrapOutcome(
  val imported: Boolean,
  val canCreateDefaultWorkspace: Boolean,
  val connectedWorkspaceKeys: List<String>,
  val failedWorkspaceIds: List<String> = emptyList(),
  val preservedLocalWorkspaceRaw: String?,
) {
  val isComplete: Boolean
    get() = imported && failedWorkspaceIds.isEmpty()
}

/**
 * Coordinates the Android startup migration path:
 * `LegacyLocalStorageProbe` -> `nativeImportLegacyLocalStorageProbe` ->
 * mounting allowlisted legacy local workspaces in place via `nativeConnectWorkspace`
 * (zero mounts on empty/corrupt/failed probes so deleted `.db` files never resurrect).
 */
class AndroidBootstrapCoordinator(
  private val handleProvider: () -> Long,
  private val filesDirProvider: () -> String,
) {
  fun start(
    probe: LegacyLocalStorageProbe,
    onComplete: (BootstrapOutcome) -> Unit = {},
  ) {
    probe.capture { raw ->
      onComplete(completeWithProbePayload(raw))
    }
  }

  fun completeWithProbePayload(
    payloadJson: String?,
    allowedKeysCsv: String = "",
  ): BootstrapOutcome {
    val handle = handleProvider()
    if (handle == 0L || payloadJson.isNullOrBlank()) {
      return BootstrapOutcome(
        imported = false,
        canCreateDefaultWorkspace = false,
        connectedWorkspaceKeys = emptyList(),
        failedWorkspaceIds = emptyList(),
        preservedLocalWorkspaceRaw = null,
      )
    }
    val imported = NativeBridge.nativeImportLegacyLocalStorageProbe(
      handle,
      payloadJson,
      allowedKeysCsv,
    )
    if (!imported) {
      return BootstrapOutcome(
        imported = false,
        canCreateDefaultWorkspace = false,
        connectedWorkspaceKeys = emptyList(),
        failedWorkspaceIds = emptyList(),
        preservedLocalWorkspaceRaw = null,
      )
    }

    val canCreateDefault = NativeBridge.nativeCanCreateDefaultWorkspace(handle)
    val preservedRaw = NativeBridge.nativeGetPreservedLocalWorkspaceRaw(handle)
    val allowlistedIds = parseJsonStringArray(
      NativeBridge.nativeGetAllowlistedWorkspaceIdsJson(handle),
    )
    val filesDir = filesDirProvider()
    val connected = mutableListOf<String>()
    val failed = mutableListOf<String>()
    for (workspaceId in allowlistedIds) {
      val key = NativeBridge.nativeConnectWorkspace(handle, filesDir, "local", workspaceId)
      if (key != null) {
        connected.add(key)
      } else {
        failed.add(workspaceId)
      }
    }
    return BootstrapOutcome(
      imported = true,
      canCreateDefaultWorkspace = canCreateDefault,
      connectedWorkspaceKeys = connected,
      failedWorkspaceIds = failed,
      preservedLocalWorkspaceRaw = preservedRaw,
    )
  }

  /**
   * Re-evaluates local workspace mounts against the current allowlist in Rust,
   * dropping obsolete failed IDs removed from the allowlist while preserving
   * already connected healthy workspace handles without reconnecting them.
   */
  fun retryFailedWorkspaces(previous: BootstrapOutcome): BootstrapOutcome {
    if (previous.isComplete || !previous.imported) {
      return previous
    }
    val handle = handleProvider()
    if (handle == 0L) {
      return previous
    }
    val currentAllowlistedIds = parseJsonStringArray(
      NativeBridge.nativeGetAllowlistedWorkspaceIdsJson(handle),
    )
    val filesDir = filesDirProvider()
    val connected = mutableListOf<String>()
    val remainingFailed = mutableListOf<String>()
    for (workspaceId in currentAllowlistedIds) {
      val key = NativeBridge.nativeConnectWorkspace(handle, filesDir, "local", workspaceId)
      if (key != null) {
        if (!connected.contains(key)) {
          connected.add(key)
        }
      } else {
        remainingFailed.add(workspaceId)
      }
    }
    return previous.copy(
      connectedWorkspaceKeys = connected,
      failedWorkspaceIds = remainingFailed,
      preservedLocalWorkspaceRaw = NativeBridge.nativeGetPreservedLocalWorkspaceRaw(handle),
    )
  }

  companion object {
    internal fun parseJsonStringArray(rawJson: String): List<String> {
      val len = NativeBridge.nativeJsonStringArrayLen(rawJson)
      if (len <= 0) return emptyList()
      return List(len) { idx ->
        NativeBridge.nativeJsonStringArrayGet(rawJson, idx) ?: ""
      }
    }
  }
}
