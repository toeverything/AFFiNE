package app.affine.pro.host

import android.content.Intent
import android.net.Uri

/**
 * Zero-JNA / zero-UniFFI Android `ACTION_SEND` / `ACTION_SEND_MULTIPLE` narrow bridge.
 * Extracts shared URLs, plain text, or image URIs from incoming Android intents and
 * enqueues them into Rust (`NativeBridge.nativeShareEnqueue`) for atomic main-app drain.
 */
class ShareIntentBridge(
  private val handleProvider: () -> Long,
) {
  companion object {
    const val KIND_URL: Int = 0
    const val KIND_TEXT: Int = 1
    const val KIND_IMAGE: Int = 2
  }

  private var autoBatchSeq: Long = 0L

  private fun nextDefaultPrefix(): String {
    autoBatchSeq += 1L
    return "share-${System.nanoTime()}-$autoBatchSeq"
  }

  /**
   * Parses an incoming `Intent.ACTION_SEND` or `Intent.ACTION_SEND_MULTIPLE` and enqueues
   * accepted payloads into Rust, returning the number of items enqueued.
   * When `idPrefix` is null, generates a unique monotonic batch prefix so repeated shares
   * within the same process never collide in `consumed_ids`.
   */
  fun handleIncomingIntent(intent: Intent?, idPrefix: String? = null): Int {
    if (intent == null) return 0
    val action = intent.action ?: return 0
    val mimeType = intent.type ?: "text/plain"
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)
    val streamUris = mutableListOf<String>()
    if (action == Intent.ACTION_SEND) {
      @Suppress("DEPRECATION")
      val streamUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
      if (streamUri != null) {
        streamUris.add(streamUri.toString())
      }
    } else if (action == Intent.ACTION_SEND_MULTIPLE) {
      @Suppress("DEPRECATION")
      val uris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()
      uris.forEach { uri -> streamUris.add(uri.toString()) }
    }
    return enqueueParsedPayloads(
      action = action,
      mimeType = mimeType,
      subject = subject,
      text = text,
      streamUris = streamUris,
      idPrefix = idPrefix,
    )
  }

  /**
   * Pure-Kotlin payload router shared by `handleIncomingIntent` and JVM parity tests.
   * For `ACTION_SEND`, both `EXTRA_TEXT` and `EXTRA_STREAM` are ingested when present together.
   */
  fun enqueueParsedPayloads(
    action: String,
    mimeType: String,
    subject: String,
    text: String?,
    streamUris: List<String>,
    idPrefix: String? = null,
  ): Int {
    val handle = handleProvider()
    if (handle == 0L) return 0
    val effectivePrefix = idPrefix ?: nextDefaultPrefix()
    var accepted = 0
    if (action == Intent.ACTION_SEND) {
      if (!text.isNullOrBlank()) {
        val trimmed = text.trim()
        val kind = if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
          KIND_URL
        } else {
          KIND_TEXT
        }
        if (NativeBridge.nativeShareEnqueue(handle, "$effectivePrefix-0", kind, subject, trimmed, mimeType)) {
          accepted += 1
        }
      }
      streamUris.forEachIndexed { idx, uriString ->
        if (NativeBridge.nativeShareEnqueue(
            handle,
            "$effectivePrefix-img-$idx",
            KIND_IMAGE,
            subject,
            uriString,
            mimeType,
          )
        ) {
          accepted += 1
        }
      }
    } else if (action == Intent.ACTION_SEND_MULTIPLE) {
      streamUris.forEachIndexed { idx, uriString ->
        if (NativeBridge.nativeShareEnqueue(
            handle,
            "$effectivePrefix-multi-$idx",
            KIND_IMAGE,
            subject,
            uriString,
            mimeType,
          )
        ) {
          accepted += 1
        }
      }
    }
    return accepted
  }

  fun pendingCount(): Int {
    val handle = handleProvider()
    if (handle == 0L) return 0
    return NativeBridge.nativeSharePendingCount(handle)
  }

  fun drainJson(): String {
    val handle = handleProvider()
    if (handle == 0L) return "[]"
    return NativeBridge.nativeShareDrainJson(handle) ?: "[]"
  }
}
