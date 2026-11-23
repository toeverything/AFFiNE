package app.affine.pro.plugin

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.affine.pro.AFFiNEApp
import app.affine.pro.service.AuthHttp
import app.affine.pro.service.CookieStore
import app.affine.pro.utils.authDataStore
import app.affine.pro.utils.del
import app.affine.pro.utils.get
import app.affine.pro.utils.set
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.coroutines.executeAsync
import org.json.JSONObject
import timber.log.Timber
import java.security.KeyStore
import java.security.MessageDigest
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlin.math.pow
import kotlin.random.Random

private data class TokenPair(
    val accessToken: String,
    val accessExpiresAt: Long,
    val refreshToken: String,
    val json: String,
)

private class AuthServerException(
    val code: String?,
    val status: Int,
    override val message: String,
) : Exception(message)

private fun authServerException(status: Int, text: String): AuthServerException {
    val body = runCatching { JSONObject(text) }.getOrNull()
    val code = body?.optString("code")?.takeIf { it.isNotEmpty() }
        ?: body?.optString("name")?.takeIf { it.isNotEmpty() }
    val message = body?.optString("message")?.takeIf { it.isNotEmpty() }
        ?: "Authentication request failed with status $status"
    return AuthServerException(code, status, message)
}

private val permanentAuthErrors = setOf(
    "ACCESS_TOKEN_INVALID", "AUTH_SESSION_EXPIRED", "AUTH_SESSION_REVOKED",
    "REFRESH_TOKEN_INVALID", "REFRESH_TOKEN_REUSED", "UNSUPPORTED_CLIENT_VERSION",
)

private val publicAuthErrors = permanentAuthErrors + setOf(
    "ACCESS_TOKEN_EXPIRED", "AUTH_SESSION_TEMPORARILY_UNAVAILABLE", "TOO_MANY_REQUESTS",
)
private val publicInternalAuthErrors = setOf("AUTH_SESSION_EMPTY")

internal class AuthSessionBroker(
    private val storage: AuthCredentialStorage = AndroidAuthCredentialStorage(),
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val locks = ConcurrentHashMap<String, Mutex>()
    private val refreshes = ConcurrentHashMap<String, Deferred<TokenPair>>()
    private val epochs = ConcurrentHashMap<String, Long>()
    private val pending = ConcurrentHashMap<String, TokenPair>()

    suspend fun store(endpoint: String, response: String) = lock(endpoint).withLock {
        invalidate(endpoint)
        write(endpoint, parsePair(response))
    }

    suspend fun validAccessToken(endpoint: String): String? {
        repeat(2) {
            val current = lock(endpoint).withLock { read(endpoint) } ?: return null
            if (current.accessExpiresAt - System.currentTimeMillis() > 120_000) {
                return current.accessToken
            }
            try {
                return refresh(endpoint).accessToken
            } catch (error: Exception) {
                if (error is CancellationException) currentCoroutineContext().ensureActive()
                val mutationWon = error is CancellationException ||
                    error is IllegalStateException && error.message == "AUTH_SESSION_EMPTY"
                if (!mutationWon) throw error
            }
        }
        return lock(endpoint).withLock { read(endpoint) }?.accessToken
    }

    suspend fun refreshAccessToken(endpoint: String) = refresh(endpoint).accessToken

    suspend fun clear(endpoint: String) = lock(endpoint).withLock {
        invalidate(endpoint)
        storage.delete(endpoint)
    }

    suspend fun signOut(endpoint: String) {
        val pair = lock(endpoint).withLock {
            val current = read(endpoint)
            invalidate(endpoint)
            storage.delete(endpoint)
            current
        } ?: return
        request(endpoint, "/api/auth/session/revoke", JSONObject().put("refreshToken", pair.refreshToken))
    }

    private suspend fun refresh(endpoint: String): TokenPair {
        val canonical = canonical(endpoint)
        refreshes[canonical]?.let { return it.await() }
        return lock(endpoint).withLock {
            refreshes[canonical]?.let { return@withLock it }
            val epoch = epochs[canonical] ?: 0
            val pendingPair = pending[canonical]
            val current = if (pendingPair == null) {
                read(endpoint) ?: throw IllegalStateException("AUTH_SESSION_EMPTY")
            } else {
                null
            }
            scope.async {
                try {
                    if (pendingPair != null) {
                        lock(endpoint).withLock {
                            if ((epochs[canonical] ?: 0) != epoch) throw CancellationException()
                            write(endpoint, pendingPair)
                            if ((epochs[canonical] ?: 0) != epoch) throw CancellationException()
                            pending.remove(canonical, pendingPair)
                        }
                        return@async pendingPair
                    }
                    val response = request(
                        endpoint,
                        "/api/auth/session/refresh",
                        JSONObject().put("refreshToken", current!!.refreshToken),
                    )
                    val pair = parsePair(response)
                    lock(endpoint).withLock {
                        if ((epochs[canonical] ?: 0) != epoch) throw CancellationException()
                        pending[canonical] = pair
                        write(endpoint, pair)
                        if ((epochs[canonical] ?: 0) != epoch) throw CancellationException()
                        pending.remove(canonical, pair)
                    }
                    pair
                } catch (error: AuthServerException) {
                    if (error.code in permanentAuthErrors) {
                        lock(endpoint).withLock {
                            if ((epochs[canonical] ?: 0) == epoch) {
                                storage.delete(endpoint)
                            }
                        }
                    }
                    throw error
                }
            }.also { task ->
                refreshes[canonical] = task
                task.invokeOnCompletion { refreshes.remove(canonical, task) }
            }
        }.await()
    }

    private suspend fun request(endpoint: String, path: String, body: JSONObject): String {
        var last: Exception? = null
        repeat(3) { attempt ->
            try {
                val request = Request.Builder()
                    .url("${canonical(endpoint)}$path")
                    .addHeader("x-affine-client-kind", "native")
                    .post(body.toString().toRequestBody(jsonMediaType))
                    .build()
                AuthHttp.client.newCall(request).executeAsync().use { response ->
                    val text = response.body.string()
                    if (response.code < 400) return text
                    val error = authServerException(response.code, text)
                    if (response.code < 500 || attempt == 2) throw error
                    last = error
                }
            } catch (error: AuthServerException) {
                if (error.status < 500 || attempt == 2) throw error
                last = error
            } catch (error: Exception) {
                if (attempt == 2) throw error
                last = error
            }
            delay((200.0 * 2.0.pow(attempt) + Random.nextInt(151)).toLong())
        }
        throw last ?: IllegalStateException("AUTH_SESSION_TEMPORARILY_UNAVAILABLE")
    }

    private fun parsePair(text: String): TokenPair {
        val value = JSONObject(text)
        val tokenType = value.optString("tokenType")
        val accessToken = value.optString("accessToken")
        val refreshToken = value.optString("refreshToken")
        val expiresIn = value.optLong("expiresIn")
        require(isIso8601(value.getString("refreshExpiresAt")))
        require(isIso8601(value.getJSONObject("session").getString("absoluteExpiresAt")))
        require(tokenType == "Bearer" && accessToken.isNotEmpty() && refreshToken.isNotEmpty())
        require(expiresIn in 1..86_400)
        val storedValue = JSONObject(value.toString())
            .put("version", 1)
            .put("accessExpiresAt", System.currentTimeMillis() + expiresIn * 1000)
        storedValue.remove("expiresIn")
        val stored = storedValue.toString()
        return TokenPair(accessToken, System.currentTimeMillis() + expiresIn * 1000, refreshToken, stored)
    }

    private suspend fun read(endpoint: String): TokenPair? {
        val plaintext = storage.read(endpoint) ?: return null
        return try {
            val value = JSONObject(plaintext)
            require(value.getInt("version") == 1 && value.getString("tokenType") == "Bearer")
            require(isIso8601(value.getString("refreshExpiresAt")))
            require(isIso8601(value.getJSONObject("session").getString("absoluteExpiresAt")))
            TokenPair(
                value.getString("accessToken").also { require(it.isNotEmpty()) },
                value.getLong("accessExpiresAt"),
                value.getString("refreshToken").also { require(it.isNotEmpty()) },
                plaintext,
            )
        } catch (_: Exception) {
            loseCredential(endpoint)
        }
    }

    private suspend fun loseCredential(endpoint: String): TokenPair? {
        storage.delete(endpoint)
        return null
    }

    private suspend fun write(endpoint: String, pair: TokenPair) {
        storage.write(endpoint, pair.json)
    }

    private fun invalidate(endpoint: String) {
        val canonical = canonical(endpoint)
        epochs.compute(canonical) { _, value -> (value ?: 0) + 1 }
        refreshes.remove(canonical)?.cancel()
        pending.remove(canonical)
    }

    private fun lock(endpoint: String) = locks.computeIfAbsent(canonical(endpoint)) { Mutex() }
    companion object {
        private val jsonMediaType = "application/json".toMediaType()
        fun canonical(endpoint: String): String = try {
            val url = endpoint.toHttpUrl()
            val port = if (url.port == HttpUrl.defaultPort(url.scheme)) "" else ":${url.port}"
            "${url.scheme}://${url.host}$port"
        } catch (_: Exception) {
            endpoint
        }

        private fun isIso8601(value: String): Boolean = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
        ).any { pattern ->
            val position = ParsePosition(0)
            val parsed = SimpleDateFormat(pattern, Locale.US).apply {
                isLenient = false
                timeZone = TimeZone.getTimeZone("UTC")
            }.parse(value, position)
            parsed != null && position.index == value.length
        }
    }
}

@CapacitorPlugin(name = "Auth")
class AuthPlugin : Plugin() {
    private val broker = AuthSessionBroker()

    @PluginMethod fun getValidAccessToken(call: PluginCall) = bridge(call) {
        JSObject().put("token", broker.validAccessToken(call.getStringEnsure("endpoint")))
    }

    @PluginMethod fun refreshAccessToken(call: PluginCall) = bridge(call) {
        JSObject().put("token", broker.refreshAccessToken(call.getStringEnsure("endpoint")))
    }

    @PluginMethod fun clearEndpointSession(call: PluginCall) = bridge(call) {
        broker.clear(call.getStringEnsure("endpoint")); JSObject().put("ok", true)
    }

    @PluginMethod fun signOut(call: PluginCall) = bridge(call) {
        val endpoint = call.getStringEnsure("endpoint")
        broker.signOut(endpoint)
        CookieStore.clearAuthCookies(endpoint.toHttpUrl().host)
        JSObject().put("ok", true)
    }

    @PluginMethod fun signInMagicLink(call: PluginCall) = signIn(call, "magic")
    @PluginMethod fun signInOauth(call: PluginCall) = signIn(call, "oauth")
    @PluginMethod fun signInOpenApp(call: PluginCall) = signIn(call, "open-app")
    @PluginMethod fun signInPassword(call: PluginCall) = signIn(call, "password")

    private fun signIn(call: PluginCall, method: String) = bridge(call) {
        val endpoint = call.getStringEnsure("endpoint")
        val (path, body) = when (method) {
            "password" -> "/api/auth/sign-in" to JSONObject()
                .put("email", call.getStringEnsure("email"))
                .put("password", call.getStringEnsure("password"))
            "oauth" -> "/api/oauth/callback" to JSONObject()
                .put("code", call.getStringEnsure("code"))
                .put("state", call.getStringEnsure("state"))
                .put("client_nonce", call.getString("clientNonce"))
            "magic" -> "/api/auth/magic-link" to JSONObject()
                .put("email", call.getStringEnsure("email"))
                .put("token", call.getStringEnsure("token"))
                .put("client_nonce", call.getString("clientNonce"))
            else -> "/api/auth/open-app/sign-in" to JSONObject().put("code", call.getStringEnsure("code"))
        }
        val request = Request.Builder()
            .url("${AuthSessionBroker.canonical(endpoint)}$path")
            .addHeader("x-affine-client-kind", "native")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .apply {
                call.getString("verifyToken")?.let { addHeader("x-captcha-token", it) }
                call.getString("challenge")?.let { addHeader("x-captcha-challenge", it) }
                call.getString("verifyToken")?.let {
                    addHeader(
                        "x-captcha-provider",
                        if (call.getString("challenge") == null) "turnstile" else "hashcash"
                    )
                }
            }
            .build()
        val exchangeCode = AuthHttp.client.newCall(request).executeAsync().use { response ->
            val text = response.body.string()
            if (response.code >= 400) throw authServerException(response.code, text)
            JSONObject(text).getString("exchangeCode")
        }
        val exchangeBody = JSONObject()
            .put("code", exchangeCode)
            .put("installationId", installationId())
            .put("platform", "android")
            .put("deviceName", android.os.Build.MODEL)
        val exchangeRequest = Request.Builder()
            .url("${AuthSessionBroker.canonical(endpoint)}/api/auth/session/exchange")
            .addHeader("x-affine-client-kind", "native")
            .post(exchangeBody.toString().toRequestBody("application/json".toMediaType()))
            .build()
        val tokenResponse = AuthHttp.client.newCall(exchangeRequest).executeAsync().use { response ->
            val text = response.body.string()
            if (response.code >= 400) throw authServerException(response.code, text)
            text
        }
        broker.store(endpoint, tokenResponse)
        CookieStore.clearAuthCookies(endpoint.toHttpUrl().host)
        JSObject().put("ok", true)
    }

    private suspend fun installationId(): String {
        val key = "auth-installation-id"
        val store = AFFiNEApp.context().authDataStore
        return store.get(key).takeIf { it.isNotEmpty() } ?: UUID.randomUUID().toString().also {
            store.set(key, it)
        }
    }

    private fun bridge(call: PluginCall, block: suspend () -> JSObject) {
        launch(Dispatchers.IO) {
            try { call.resolve(block()) } catch (error: Exception) {
                Timber.w(error, "Auth operation failed")
                val code = when (error) {
                    is AuthServerException -> when {
                        error.code in publicAuthErrors -> error.code!!
                        error.status == 429 -> "TOO_MANY_REQUESTS"
                        else -> "AUTH_SESSION_TEMPORARILY_UNAVAILABLE"
                    }
                    is CancellationException -> "AUTH_OPERATION_CANCELLED"
                    is IllegalStateException -> error.message
                        ?.takeIf { it in publicInternalAuthErrors }
                        ?: "AUTH_SESSION_TEMPORARILY_UNAVAILABLE"
                    else -> "AUTH_SESSION_TEMPORARILY_UNAVAILABLE"
                }
                val message = if (error is AuthServerException) error.message else "Auth operation failed"
                call.reject(message, code, error)
            }
        }
    }
}

internal interface AuthCredentialStorage {
    suspend fun read(endpoint: String): String?
    suspend fun write(endpoint: String, value: String)
    suspend fun delete(endpoint: String)
}

private class AndroidAuthCredentialStorage : AuthCredentialStorage {
    private val cipher = TokenCipher()

    override suspend fun read(endpoint: String): String? {
        val canonical = AuthSessionBroker.canonical(endpoint)
        val encoded = AFFiNEApp.context().authDataStore.get(key(canonical)).takeIf { it.isNotEmpty() }
            ?: return null
        return cipher.decrypt(canonical, encoded) ?: run {
            cipher.reset(canonical)
            delete(canonical)
            null
        }
    }

    override suspend fun write(endpoint: String, value: String) {
        val canonical = AuthSessionBroker.canonical(endpoint)
        AFFiNEApp.context().authDataStore.set(key(canonical), cipher.encrypt(canonical, value))
    }

    override suspend fun delete(endpoint: String) {
        AFFiNEApp.context().authDataStore.del(key(AuthSessionBroker.canonical(endpoint)))
    }

    private fun key(endpoint: String) = "auth-token:$endpoint"
}

internal class TokenCipher {
    fun encrypt(endpoint: String, plaintext: String): String {
        return runCatching { encryptWithAlias(alias(endpoint), plaintext) }.getOrElse {
            reset(endpoint)
            encryptWithAlias(alias(endpoint), plaintext)
        }
    }

    private fun encryptWithAlias(alias: String, plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey(alias))
        return listOf(
            "v1", Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            Base64.encodeToString(cipher.doFinal(plaintext.toByteArray()), Base64.NO_WRAP),
        ).joinToString(":")
    }

    fun decrypt(endpoint: String, encoded: String): String? = runCatching {
        val parts = encoded.split(":")
        require(parts.size == 3 && parts[0] == "v1")
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE, secretKey(alias(endpoint)),
            GCMParameterSpec(128, Base64.decode(parts[1], Base64.NO_WRAP)),
        )
        String(cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)))
    }.getOrNull()

    fun reset(endpoint: String) {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(alias(endpoint))) store.deleteEntry(alias(endpoint))
    }

    private fun alias(endpoint: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(endpoint.toByteArray())
        return "affine-auth-session-${Base64.encodeToString(digest, Base64.NO_WRAP or Base64.URL_SAFE).take(24)}"
    }

    private fun secretKey(alias: String): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    companion object { private const val TRANSFORMATION = "AES/GCM/NoPadding" }
}
