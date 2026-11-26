package app.affine.pro.host

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.webkit.CookieManager
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Pure-Kotlin RFC 4648 Base64 (`NO_WRAP`, standard alphabet with `=` padding).
 *
 * Works identically on Android API 24+ (where `java.util.Base64` does not exist)
 * and desktop JVM parity tests (where `android.util.Base64` is a stub).
 */
object Rfc4648Base64 {
  private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

  private val DECODE_TABLE = IntArray(128) { -1 }.apply {
    for (i in ALPHABET.indices) {
      this[ALPHABET[i].code] = i
    }
  }

  fun encode(bytes: ByteArray): String {
    if (bytes.isEmpty()) return ""
    val out = StringBuilder(((bytes.size + 2) / 3) * 4)
    var i = 0
    while (i < bytes.size) {
      val b0 = bytes[i].toInt() and 0xFF
      val has1 = i + 1 < bytes.size
      val has2 = i + 2 < bytes.size
      val b1 = if (has1) bytes[i + 1].toInt() and 0xFF else 0
      val b2 = if (has2) bytes[i + 2].toInt() and 0xFF else 0
      val triple = (b0 shl 16) or (b1 shl 8) or b2
      out.append(ALPHABET[(triple ushr 18) and 0x3F])
      out.append(ALPHABET[(triple ushr 12) and 0x3F])
      out.append(if (has1) ALPHABET[(triple ushr 6) and 0x3F] else '=')
      out.append(if (has2) ALPHABET[triple and 0x3F] else '=')
      i += 3
    }
    return out.toString()
  }

  fun decode(input: String): ByteArray {
    if (input.isEmpty()) return ByteArray(0)
    require(input.length % 4 == 0) { "invalid base64 length: ${input.length}" }
    val pad = when {
      input.endsWith("==") -> 2
      input.endsWith("=") -> 1
      else -> 0
    }
    val out = ByteArray((input.length / 4) * 3 - pad)
    var outIdx = 0
    var i = 0
    while (i < input.length) {
      val c0 = decodeChar(input[i])
      val c1 = decodeChar(input[i + 1])
      val ch2 = input[i + 2]
      val ch3 = input[i + 3]
      val c2 = if (ch2 == '=') 0 else decodeChar(ch2)
      val c3 = if (ch3 == '=') 0 else decodeChar(ch3)
      val triple = (c0 shl 18) or (c1 shl 12) or (c2 shl 6) or c3
      out[outIdx++] = ((triple ushr 16) and 0xFF).toByte()
      if (ch2 != '=' && outIdx < out.size) {
        out[outIdx++] = ((triple ushr 8) and 0xFF).toByte()
      }
      if (ch3 != '=' && outIdx < out.size) {
        out[outIdx++] = (triple and 0xFF).toByte()
      }
      i += 4
    }
    return out
  }

  private fun decodeChar(ch: Char): Int {
    val code = ch.code
    val v = if (code < DECODE_TABLE.size) DECODE_TABLE[code] else -1
    require(v >= 0) { "invalid base64 character: $ch" }
    return v
  }
}

/**
 * Clears ONLY the three `0.27.5` auth cookies (`affine_session`,
 * `affine_user_id`, `affine_csrf_token`) for a canonical endpoint origin on
 * sign-out or terminal 401, leaving unrelated same-origin preference cookies
 * untouched.
 */
interface CookieCleaner {
  fun clearAuthCookies(canonicalEndpoint: String)
}

/**
 * Production Android `CookieManager` cleaner matching `OkHttp.kt:70-72,92-100`.
 */
class AndroidCookieCleaner : CookieCleaner {
  override fun clearAuthCookies(canonicalEndpoint: String) {
    runCatching {
      val manager = CookieManager.getInstance()
      val headers = filterClearedCookieHeaders(manager.getCookie(canonicalEndpoint))
      if (headers.isEmpty()) return@runCatching
      for (header in headers) {
        manager.setCookie(canonicalEndpoint, header)
      }
      manager.flush()
    }
  }

  companion object {
    val AUTH_COOKIE_NAMES: Set<String> = setOf(
      "affine_session",
      "affine_user_id",
      "affine_csrf_token",
    )

    /**
     * Returns `Set-Cookie` expiration headers ONLY for `0.27.5` auth cookies
     * present in [rawCookieHeader]. Non-auth cookies are ignored untouched.
     */
    fun filterClearedCookieHeaders(rawCookieHeader: String?): List<String> {
      if (rawCookieHeader.isNullOrBlank()) return emptyList()
      val matched = LinkedHashSet<String>()
      for (part in rawCookieHeader.split(";")) {
        val name = part.substringBefore("=").trim()
        if (name in AUTH_COOKIE_NAMES) {
          matched.add(name)
        }
      }
      return matched.map { name ->
        "$name=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
      }
    }
  }
}

object NoOpCookieCleaner : CookieCleaner {
  override fun clearAuthCookies(canonicalEndpoint: String) = Unit
}

/**
 * Result of a `/api/auth/session/refresh` transport call.
 */
sealed class RefreshResult {
  data class Success(val serverResponseJson: String, val nowMs: Long) : RefreshResult()
  data class Failure(val errorCode: String?) : RefreshResult()
}

fun interface RefreshTransport {
  fun refresh(canonicalEndpoint: String, refreshToken: String, attemptId: String): RefreshResult
}

fun interface SessionPersistence {
  fun writeEncryptedSession(filesDir: String, key: String, encrypted: String): Boolean
}

/**
 * Production `HttpURLConnection` transport for `POST /api/auth/session/refresh`
 * aligned with `0.27.5` `AuthPlugin.kt:191-195` (sends `refreshToken` ONLY in
 * the JSON body, never as an `Authorization: Bearer` header).
 */
class HttpUrlConnectionRefreshTransport(
  private val appVersion: String = AuthSessionStore.CLIENT_VERSION_VALUE,
  private val connectTimeoutMs: Int = 10_000,
  private val readTimeoutMs: Int = 15_000,
) : RefreshTransport {
  override fun refresh(
    canonicalEndpoint: String,
    refreshToken: String,
    attemptId: String,
  ): RefreshResult {
    var conn: HttpURLConnection? = null
    return try {
      val url = URL("$canonicalEndpoint/api/auth/session/refresh")
      conn = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = connectTimeoutMs
        readTimeout = readTimeoutMs
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
        setRequestProperty(AuthSessionStore.CLIENT_KIND_HEADER, AuthSessionStore.CLIENT_KIND_VALUE)
        setRequestProperty(AuthSessionStore.CLIENT_VERSION_HEADER, appVersion)
        setRequestProperty(AuthSessionStore.REFRESH_ATTEMPT_HEADER, attemptId)
      }
      val payload = """{"refreshToken":${quoteJsonString(refreshToken)}}"""
      conn.outputStream.use { out ->
        out.write(payload.toByteArray(StandardCharsets.UTF_8))
      }
      val status = conn.responseCode
      val stream = if (status in 200..299) conn.inputStream else conn.errorStream
      val body = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() } ?: ""
      if (status in 200..299) {
        RefreshResult.Success(body, System.currentTimeMillis())
      } else {
        val code = NativeBridge.nativeExtractJsonStringField(body, "code")
          ?.takeIf { it.isNotEmpty() }
          ?: NativeBridge.nativeExtractJsonStringField(body, "name")
            ?.takeIf { it.isNotEmpty() }
        RefreshResult.Failure(code)
      }
    } catch (_: Exception) {
      RefreshResult.Failure(null)
    } finally {
      conn?.disconnect()
    }
  }

  private fun quoteJsonString(value: String): String {
    val sb = StringBuilder(value.length + 2)
    sb.append('"')
    for (ch in value) {
      when (ch) {
        '"' -> sb.append("\\\"")
        '\\' -> sb.append("\\\\")
        '\b' -> sb.append("\\b")
        '\u000C' -> sb.append("\\f")
        '\n' -> sb.append("\\n")
        '\r' -> sb.append("\\r")
        '\t' -> sb.append("\\t")
        else -> if (ch.code < 0x20) {
          sb.append("\\u%04x".format(ch.code))
        } else {
          sb.append(ch)
        }
      }
    }
    sb.append('"')
    return sb.toString()
  }
}

/**
 * Key provider backing `AuthTokenCipher`.
 *
 * Production Android builds use [AndroidKeyStoreKeyProvider]; desktop JVM
 * parity checks use [InMemoryAesKeyProvider].
 */
interface SecretKeyProvider {
  fun getOrCreateKey(alias: String): SecretKey
  fun deleteKey(alias: String)
}

/**
 * Production Android Keystore AES-256-GCM provider aligned with `AuthPlugin.kt`.
 */
class AndroidKeyStoreKeyProvider : SecretKeyProvider {
  override fun getOrCreateKey(alias: String): SecretKey {
    val store = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    (store.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }

  override fun deleteKey(alias: String) {
    val store = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    if (store.containsAlias(alias)) {
      store.deleteEntry(alias)
    }
  }

  companion object {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  }
}

/**
 * Deterministic-test-friendly in-memory AES-256 key provider for JVM parity runs.
 */
class InMemoryAesKeyProvider(
  private val random: SecureRandom = SecureRandom(),
) : SecretKeyProvider {
  private val keys = ConcurrentHashMap<String, SecretKey>()

  override fun getOrCreateKey(alias: String): SecretKey =
    keys.computeIfAbsent(alias) {
      val raw = ByteArray(32)
      random.nextBytes(raw)
      SecretKeySpec(raw, "AES")
    }

  override fun deleteKey(alias: String) {
    keys.remove(alias)
  }
}

/**
 * AES/GCM/NoPadding (12-byte IV, 128-bit GCM tag) session cipher producing the
 * exact `0.27.5` `v1:<base64_iv>:<base64_ciphertext_and_tag>` format.
 */
class AuthTokenCipher(
  private val keyProvider: SecretKeyProvider = AndroidKeyStoreKeyProvider(),
  private val explicitIvForJvm: Boolean = false,
  private val random: SecureRandom = SecureRandom(),
) {
  fun encrypt(endpoint: String, plaintext: String): String {
    val alias = NativeBridge.nativeKeystoreAlias(endpoint)
    return runCatching { encryptWithAlias(alias, plaintext) }.getOrElse {
      keyProvider.deleteKey(alias)
      encryptWithAlias(alias, plaintext)
    }
  }

  private fun encryptWithAlias(alias: String, plaintext: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    val key = keyProvider.getOrCreateKey(alias)
    if (explicitIvForJvm) {
      val iv = ByteArray(GCM_IV_LEN)
      random.nextBytes(iv)
      cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
    } else {
      cipher.init(Cipher.ENCRYPT_MODE, key)
    }
    val ciphertext = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8))
    val ivB64 = Rfc4648Base64.encode(cipher.iv)
    val ctB64 = Rfc4648Base64.encode(ciphertext)
    return "$VERSION_PREFIX:$ivB64:$ctB64"
  }

  fun decrypt(endpoint: String, encoded: String): String? = runCatching {
    if (!NativeBridge.nativeValidateV1Ciphertext(encoded)) return null
    val parts = encoded.split(":")
    val iv = Rfc4648Base64.decode(parts[1])
    val ciphertext = Rfc4648Base64.decode(parts[2])
    val alias = NativeBridge.nativeKeystoreAlias(endpoint)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, keyProvider.getOrCreateKey(alias), GCMParameterSpec(GCM_TAG_BITS, iv))
    String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
  }.getOrNull()

  fun reset(endpoint: String) {
    keyProvider.deleteKey(NativeBridge.nativeKeystoreAlias(endpoint))
  }

  companion object {
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val VERSION_PREFIX = "v1"
    const val GCM_IV_LEN = 12
    const val GCM_TAG_BITS = 128
  }
}

private class InFlightRefresh {
  val latch = CountDownLatch(1)
  @Volatile
  var succeeded: Boolean = false
}

private data class PendingRotatedSession(
  val epoch: Long,
  val serverResponseJson: String,
  val nowMs: Long,
)

private class EndpointCoordination {
  val lock = Any()
  var epoch: Long = 0L
  var inFlight: InFlightRefresh? = null
  var pendingAttemptToken: String? = null
  var pendingAttemptId: String? = null
  var pendingRotated: PendingRotatedSession? = null

  fun clearPendingRotation() {
    pendingAttemptToken = null
    pendingAttemptId = null
    pendingRotated = null
  }
}

private object AuthSessionCoordinator {
  private val coords = ConcurrentHashMap<String, EndpointCoordination>()

  fun forEndpoint(filesDir: String, canonicalEndpoint: String): EndpointCoordination {
    val canonicalFile = runCatching {
      File(filesDir, "datastore/auth-sessions.preferences_pb").canonicalPath
    }.getOrElse { File(filesDir, "datastore/auth-sessions.preferences_pb").absolutePath }
    return coords.computeIfAbsent("$canonicalFile|$canonicalEndpoint") { EndpointCoordination() }
  }
}

/**
 * In-place reader/writer for `0.27.5` Jetpack Preferences DataStore
 * (`<filesDir>/datastore/auth-sessions.preferences_pb`) with process-wide
 * per-endpoint single-flight refresh coordination and `CookieCleaner` support.
 */
class AuthSessionStore(
  private val filesDir: String,
  private val cipher: AuthTokenCipher = AuthTokenCipher(),
  private val cookieCleaner: CookieCleaner = AndroidCookieCleaner(),
  private val defaultTransport: RefreshTransport = HttpUrlConnectionRefreshTransport(),
  private val persistence: SessionPersistence = SessionPersistence { dir, key, enc ->
    NativeBridge.nativeDataStoreSetString(dir, key, enc)
  },
) {
  constructor(
    context: Context,
    cipher: AuthTokenCipher = AuthTokenCipher(),
    cookieCleaner: CookieCleaner = AndroidCookieCleaner(),
    defaultTransport: RefreshTransport = HttpUrlConnectionRefreshTransport(
      appVersion = resolveAppVersion(context),
    ),
    persistence: SessionPersistence = SessionPersistence { dir, key, enc ->
      NativeBridge.nativeDataStoreSetString(dir, key, enc)
    },
  ) : this(
    filesDir = context.filesDir.absolutePath,
    cipher = cipher,
    cookieCleaner = cookieCleaner,
    defaultTransport = defaultTransport,
    persistence = persistence,
  )
  private fun coord(canonicalEndpoint: String): EndpointCoordination =
    AuthSessionCoordinator.forEndpoint(filesDir, canonicalEndpoint)

  fun currentEpoch(endpoint: String): Long {
    val canonical = NativeBridge.nativeCanonicalEndpoint(endpoint)
    val c = coord(canonical)
    return synchronized(c.lock) { c.epoch }
  }

  /**
   * Atomically reads `auth-installation-id` or persists [fallbackUuid] inside a
   * single Rust per-file lock critical section. Throws [IllegalStateException]
   * on `"ERROR:..."` so a corrupt DataStore never silently overwrites disk.
   */
  fun getOrCreateInstallationId(fallbackUuid: String = UUID.randomUUID().toString()): String {
    val result = NativeBridge.nativeDataStoreGetOrCreateString(
      filesDir,
      INSTALLATION_ID_KEY,
      fallbackUuid,
    )
    if (result.startsWith("OK:")) {
      val persisted = result.substring(3)
      if (persisted.isNotEmpty()) return persisted
    }
    throw IllegalStateException("Refusing to overwrite installationId on DataStore error: $result")
  }

  fun storeServerResponse(endpoint: String, serverResponseJson: String, nowMs: Long): Boolean {
    val canonical = NativeBridge.nativeCanonicalEndpoint(endpoint)
    val storedJson = NativeBridge.nativePrepareAuthSessionJson(serverResponseJson, nowMs)
      ?: return false
    val encrypted = cipher.encrypt(canonical, storedJson)
    if (!NativeBridge.nativeValidateV1Ciphertext(encrypted)) return false
    val c = coord(canonical)
    return synchronized(c.lock) {
      c.epoch += 1L
      c.clearPendingRotation()
      val written = persistence.writeEncryptedSession(filesDir, NativeBridge.nativeAuthTokenKey(canonical), encrypted)
      if (written) {
        clearPersistedRefreshAttemptUnlocked(canonical)
      }
      written
    }
  }

  fun storeRefreshedSessionIfEpochMatches(
    endpoint: String,
    startEpoch: Long,
    serverResponseJson: String,
    nowMs: Long,
  ): Boolean {
    val canonical = NativeBridge.nativeCanonicalEndpoint(endpoint)
    val storedJson = NativeBridge.nativePrepareAuthSessionJson(serverResponseJson, nowMs)
      ?: return false
    val encrypted = cipher.encrypt(canonical, storedJson)
    if (!NativeBridge.nativeValidateV1Ciphertext(encrypted)) return false
    val c = coord(canonical)
    return synchronized(c.lock) {
      if (c.epoch != startEpoch) {
        return@synchronized false
      }
      val written = persistence.writeEncryptedSession(filesDir, NativeBridge.nativeAuthTokenKey(canonical), encrypted)
      if (written) {
        c.epoch += 1L
        c.clearPendingRotation()
        clearPersistedRefreshAttemptUnlocked(canonical)
      }
      written
    }
  }

  /**
   * Two-argument convenience overload for callers that do not inspect `attemptId`.
   */
  fun refreshSession(
    endpoint: String,
    transport: (canonicalEndpoint: String, refreshToken: String) -> RefreshResult,
  ): Boolean = refreshSession(
    endpoint = endpoint,
    transport = RefreshTransport { canonical, token, _ -> transport(canonical, token) },
  )

  /**
   * Process-wide single-flight refresh per `(datastoreFile, canonicalEndpoint)`.
   *
   * - Concurrent callers share one in-flight transport call.
   * - Retries for the same logical `refreshToken` reuse the same lowercase UUID
   *   `x-affine-refresh-attempt` header so the server can recover idempotently.
   * - If a `200 OK` rotated session fails to persist to disk, it is retained in
   *   memory for the current `epoch` and flushed on the next `refreshSession`
   *   call with zero network requests.
   */
  fun refreshSession(
    endpoint: String,
    transport: RefreshTransport = defaultTransport,
  ): Boolean {
    val canonical = NativeBridge.nativeCanonicalEndpoint(endpoint)
    val c = coord(canonical)
    var waiter: InFlightRefresh? = null
    var owned: InFlightRefresh? = null
    var startEpoch = 0L
    var refreshToken: String? = null
    var attemptId: String? = null
    var pendingToFlush: PendingRotatedSession? = null

    synchronized(c.lock) {
      val existing = c.inFlight
      if (existing != null) {
        waiter = existing
      } else {
        val cached = c.pendingRotated
        if (cached != null && cached.epoch == c.epoch) {
          startEpoch = c.epoch
          pendingToFlush = cached
        } else {
          if (cached != null) {
            c.pendingRotated = null
          }
          val currentJson = readSessionJsonUnlocked(canonical) ?: return false
          val token = NativeBridge.nativeExtractJsonStringField(currentJson, "refreshToken")
            ?.takeIf { it.isNotEmpty() }
            ?: return false
          val reusedAttempt = if (c.pendingAttemptToken == token && c.pendingAttemptId != null) {
            c.pendingAttemptId!!
          } else {
            readPersistedRefreshAttemptUnlocked(canonical, token) ?: run {
              val fresh = UUID.randomUUID().toString().lowercase()
              persistRefreshAttemptUnlocked(canonical, token, fresh)
              fresh
            }
          }
          c.pendingAttemptToken = token
          c.pendingAttemptId = reusedAttempt
          startEpoch = c.epoch
          refreshToken = token
          attemptId = reusedAttempt
        }
        val flight = InFlightRefresh()
        c.inFlight = flight
        owned = flight
      }
    }

    if (waiter != null) {
      waiter!!.latch.await()
      return waiter!!.succeeded
    }

    val flight = owned!!
    var ok = false
    try {
      val flush = pendingToFlush
      if (flush != null) {
        val storedJson = NativeBridge.nativePrepareAuthSessionJson(flush.serverResponseJson, flush.nowMs)
        val encrypted = storedJson?.let { cipher.encrypt(canonical, it) }
        synchronized(c.lock) {
          if (c.epoch == startEpoch && encrypted != null && NativeBridge.nativeValidateV1Ciphertext(encrypted)) {
            val written = persistence.writeEncryptedSession(filesDir, NativeBridge.nativeAuthTokenKey(canonical), encrypted)
            if (written) {
              c.epoch += 1L
              c.clearPendingRotation()
              clearPersistedRefreshAttemptUnlocked(canonical)
              ok = true
            }
          }
        }
      } else {
        when (val res = transport.refresh(canonical, refreshToken!!, attemptId!!)) {
          is RefreshResult.Success -> {
            val storedJson = NativeBridge.nativePrepareAuthSessionJson(res.serverResponseJson, res.nowMs)
            val encrypted = storedJson?.let { cipher.encrypt(canonical, it) }
            synchronized(c.lock) {
              if (c.epoch == startEpoch && encrypted != null && NativeBridge.nativeValidateV1Ciphertext(encrypted)) {
                c.pendingRotated = PendingRotatedSession(startEpoch, res.serverResponseJson, res.nowMs)
                val written = persistence.writeEncryptedSession(filesDir, NativeBridge.nativeAuthTokenKey(canonical), encrypted)
                if (written) {
                  c.epoch += 1L
                  c.clearPendingRotation()
                  clearPersistedRefreshAttemptUnlocked(canonical)
                  ok = true
                }
              }
            }
          }
          is RefreshResult.Failure -> {
            if (!res.errorCode.isNullOrEmpty() && NativeBridge.nativeIsPermanentAuthErrorCode(res.errorCode)) {
              var shouldCleanCookies = false
              synchronized(c.lock) {
                if (c.epoch == startEpoch) {
                  c.epoch += 1L
                  c.clearPendingRotation()
                  clearPersistedRefreshAttemptUnlocked(canonical)
                  NativeBridge.nativeDataStoreDeleteKey(filesDir, NativeBridge.nativeAuthTokenKey(canonical))
                  clearLegacyCookieKeysUnlocked(canonical)
                  shouldCleanCookies = true
                }
              }
              if (shouldCleanCookies) {
                cookieCleaner.clearAuthCookies(canonical)
              }
            }
          }
        }
      }
    } finally {
      synchronized(c.lock) {
        if (c.inFlight === flight) {
          c.inFlight = null
        }
      }
      flight.succeeded = ok
      flight.latch.countDown()
    }
    return ok
  }

  fun readSessionJson(endpoint: String): String? {
    val canonical = NativeBridge.nativeCanonicalEndpoint(endpoint)
    val c = coord(canonical)
    return synchronized(c.lock) { readSessionJsonUnlocked(canonical) }
  }

  private fun readSessionJsonUnlocked(canonical: String): String? {
    val result = NativeBridge.nativeDataStoreReadResult(filesDir, NativeBridge.nativeAuthTokenKey(canonical))
    if (!result.startsWith("OK:")) {
      return null
    }
    val encoded = result.substring(3).takeIf { it.isNotEmpty() } ?: return null
    val plaintext = cipher.decrypt(canonical, encoded) ?: run {
      cipher.reset(canonical)
      NativeBridge.nativeDataStoreDeleteKey(filesDir, NativeBridge.nativeAuthTokenKey(canonical))
      return null
    }
    if (!NativeBridge.nativeValidateAuthSessionJson(plaintext)) {
      NativeBridge.nativeDataStoreDeleteKey(filesDir, NativeBridge.nativeAuthTokenKey(canonical))
      return null
    }
    return plaintext
  }

  fun clearSession(endpoint: String): Boolean = deleteSession(endpoint)

  fun deleteSession(endpoint: String): Boolean {
    val canonical = NativeBridge.nativeCanonicalEndpoint(endpoint)
    val c = coord(canonical)
    val deleted = synchronized(c.lock) {
      c.epoch += 1L
      c.clearPendingRotation()
      clearPersistedRefreshAttemptUnlocked(canonical)
      val removed = NativeBridge.nativeDataStoreDeleteKey(filesDir, NativeBridge.nativeAuthTokenKey(canonical))
      val legacyCleared = clearLegacyCookieKeysUnlocked(canonical)
      removed && legacyCleared
    }
    cookieCleaner.clearAuthCookies(canonical)
    return deleted
  }

  fun handleRefreshFailure(endpoint: String, errorCode: String?): Boolean {
    if (errorCode.isNullOrEmpty() || !NativeBridge.nativeIsPermanentAuthErrorCode(errorCode)) {
      return false
    }
    return deleteSession(endpoint)
  }

  fun handleRefreshFailureIfEpochMatches(
    endpoint: String,
    startEpoch: Long,
    errorCode: String?,
  ): Boolean {
    if (errorCode.isNullOrEmpty() || !NativeBridge.nativeIsPermanentAuthErrorCode(errorCode)) {
      return false
    }
    val canonical = NativeBridge.nativeCanonicalEndpoint(endpoint)
    val c = coord(canonical)
    val deleted = synchronized(c.lock) {
      if (c.epoch != startEpoch) {
        return@synchronized false
      }
      c.epoch += 1L
      c.clearPendingRotation()
      clearPersistedRefreshAttemptUnlocked(canonical)
      val removed = NativeBridge.nativeDataStoreDeleteKey(filesDir, NativeBridge.nativeAuthTokenKey(canonical))
      val legacyCleared = clearLegacyCookieKeysUnlocked(canonical)
      removed && legacyCleared
    }
    if (deleted) {
      cookieCleaner.clearAuthCookies(canonical)
    }
    return deleted
  }

  private fun clearLegacyCookieKeysUnlocked(canonicalEndpoint: String): Boolean {
    val host = runCatching { URI(canonicalEndpoint).host }.getOrNull()?.takeIf { it.isNotEmpty() }
      ?: return true
    val appUser = NativeBridge.nativeLegacyAppDataStoreDeleteKey(filesDir, "${host}affine_user_id")
    val appCsrf = NativeBridge.nativeLegacyAppDataStoreDeleteKey(filesDir, "${host}affine_csrf_token")
    val authUser = NativeBridge.nativeDataStoreDeleteKey(filesDir, "${host}affine_user_id")
    val authCsrf = NativeBridge.nativeDataStoreDeleteKey(filesDir, "${host}affine_csrf_token")
    return appUser && appCsrf && authUser && authCsrf
  }

  private fun attemptKey(canonicalEndpoint: String): String = "$REFRESH_ATTEMPT_KEY_PREFIX$canonicalEndpoint"

  private fun hashTokenDigest(token: String): String {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
      .digest(token.toByteArray(StandardCharsets.UTF_8))
    val sb = StringBuilder(digest.size * 2)
    for (b in digest) {
      sb.append(String.format("%02x", b))
    }
    return sb.toString()
  }

  private fun readPersistedRefreshAttemptUnlocked(
    canonicalEndpoint: String,
    token: String,
  ): String? {
    val raw = NativeBridge.nativeDataStoreGetString(filesDir, attemptKey(canonicalEndpoint))
      ?: return null
    val sep = raw.indexOf('|')
    if (sep <= 0 || sep >= raw.length - 1) {
      return null
    }
    val storedDigest = raw.substring(0, sep)
    val storedAttempt = raw.substring(sep + 1)
    return if (storedDigest == hashTokenDigest(token) && storedAttempt.isNotEmpty()) {
      storedAttempt
    } else {
      null
    }
  }

  private fun persistRefreshAttemptUnlocked(
    canonicalEndpoint: String,
    token: String,
    attemptId: String,
  ) {
    NativeBridge.nativeDataStoreSetString(
      filesDir,
      attemptKey(canonicalEndpoint),
      "${hashTokenDigest(token)}|$attemptId",
    )
  }

  private fun clearPersistedRefreshAttemptUnlocked(canonicalEndpoint: String) {
    NativeBridge.nativeDataStoreDeleteKey(filesDir, attemptKey(canonicalEndpoint))
  }

  companion object {
    const val INSTALLATION_ID_KEY = "auth-installation-id"
    const val REFRESH_ATTEMPT_KEY_PREFIX = "auth-refresh-attempt:"
    const val CLIENT_KIND_HEADER = "x-affine-client-kind"
    const val CLIENT_KIND_VALUE = "native"
    const val CLIENT_VERSION_HEADER = "x-affine-version"
    const val CLIENT_VERSION_VALUE = "0.27.5"
    const val REFRESH_ATTEMPT_HEADER = "x-affine-refresh-attempt"

    @Suppress("DEPRECATION")
    fun resolveAppVersion(context: Context): String = runCatching {
      context.packageManager
        .getPackageInfo(context.packageName, 0)
        .versionName
        ?.takeIf { it.isNotBlank() }
    }.getOrNull() ?: CLIENT_VERSION_VALUE
  }
}
