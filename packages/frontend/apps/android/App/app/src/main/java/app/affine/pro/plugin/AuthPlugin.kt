package app.affine.pro.plugin

import android.annotation.SuppressLint
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.affine.pro.AFFiNEApp
import app.affine.pro.service.AuthHttp
import app.affine.pro.service.CookieStore
import app.affine.pro.utils.dataStore
import app.affine.pro.utils.del
import app.affine.pro.utils.get
import app.affine.pro.utils.set
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.coroutines.executeAsync
import org.json.JSONObject
import timber.log.Timber
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@OptIn(ExperimentalCoroutinesApi::class)
@CapacitorPlugin(name = "Auth")
class AuthPlugin : Plugin() {
    private fun canonicalEndpoint(endpoint: String): String = try {
        val url = endpoint.toHttpUrl()
        val port = if (url.port == HttpUrl.defaultPort(url.scheme)) "" else ":${url.port}"
        "${url.scheme}://${url.host}$port"
    } catch (_: Exception) {
        endpoint
    }

    private fun tokenKey(endpoint: String) = "auth-token:${canonicalEndpoint(endpoint)}"
    private fun legacyTokenKey(endpoint: String) = "auth-token:$endpoint"
    private val tokenCipher = TokenCipher()

    @PluginMethod
    fun readEndpointToken(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
                val key = tokenKey(endpoint)
                val legacyKey = legacyTokenKey(endpoint)
                val store = AFFiNEApp.context().dataStore
                val storedKey = key.takeIf { store.get(it).isNotEmpty() }
                    ?: legacyKey.takeIf { it != key && store.get(it).isNotEmpty() }
                val storedToken = storedKey?.let { store.get(it) }?.takeIf { it.isNotEmpty() }
                val token = storedToken?.let {
                    tokenCipher.decrypt(it) ?: tokenCipher.legacyPlaintext(it)
                }
                if (
                    storedToken != null &&
                    token != null &&
                    (storedKey != key || !tokenCipher.isEncrypted(storedToken))
                ) {
                    store.set(key, tokenCipher.encrypt(token))
                    storedKey?.let {
                        if (it != key) {
                            store.del(it)
                        }
                    }
                }
                call.resolve(JSObject().put("token", token))
            } catch (e: Exception) {
                call.reject("Failed to read endpoint token.", null, e)
            }
        }
    }

    @PluginMethod
    fun writeEndpointToken(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
                val token = call.getStringEnsure("token")
                AFFiNEApp.context().dataStore.set(
                    tokenKey(endpoint),
                    tokenCipher.encrypt(token)
                )
                call.resolve(JSObject().put("ok", true))
            } catch (e: Exception) {
                call.reject("Failed to write endpoint token.", null, e)
            }
        }
    }

    @PluginMethod
    fun deleteEndpointToken(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
                AFFiNEApp.context().dataStore.del(tokenKey(endpoint))
                AFFiNEApp.context().dataStore.del(legacyTokenKey(endpoint))
                call.resolve(JSObject().put("ok", true))
            } catch (e: Exception) {
                call.reject("Failed to delete endpoint token.", null, e)
            }
        }
    }

    @PluginMethod
    fun signInMagicLink(call: PluginCall) {
        processSignIn(call, SignInMethod.MagicLink)
    }

    @PluginMethod
    fun signInOauth(call: PluginCall) {
        processSignIn(call, SignInMethod.Oauth)
    }

    @PluginMethod
    fun signInOpenApp(call: PluginCall) {
        processSignIn(call, SignInMethod.OpenApp)
    }

    @SuppressLint("BuildListAdds")
    @PluginMethod
    fun signInPassword(call: PluginCall) {
        processSignIn(call, SignInMethod.Password)
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
                val token = call.getString("token")
                val request = Request.Builder()
                    .url("$endpoint/api/auth/sign-out")
                    .post("".toRequestBody("application/json".toMediaTypeOrNull()))
                    .apply {
                        if (token != null) {
                            addHeader("Authorization", "Bearer $token")
                        }
                    }
                    .build()
                AuthHttp.client.newCall(request).executeAsync().use { response ->
                    if (response.code >= 400) {
                        call.reject(response.body.string())
                        return@launch
                    }
                    CookieStore.clearAuthCookies(endpoint.toHttpUrl().host)
                    Timber.i("Sign out success.")
                    call.resolve(JSObject().put("ok", true))
                }
            } catch (e: Exception) {
                Timber.w(e, "Sign out fail.")
                call.reject("Failed to sign out, $e", null, e)
            }
        }
    }

    private enum class SignInMethod {
        Password, Oauth, MagicLink, OpenApp
    }

    private fun processSignIn(call: PluginCall, method: SignInMethod) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
                val request = when (method) {
                    SignInMethod.Password -> {
                        val email = call.getStringEnsure("email")
                        val password = call.getStringEnsure("password")
                        val verifyToken = call.getString("verifyToken")
                        val challenge = call.getString("challenge")
                        val body = JSONObject()
                            .apply {
                                put("email", email)
                                put("password", password)
                            }
                            .toString()
                            .toRequestBody("application/json".toMediaTypeOrNull())

                        val requestBuilder = Request.Builder()
                            .url("$endpoint/api/auth/sign-in")
                            .addHeader("x-affine-client-kind", "native")
                            .post(body)
                        if (verifyToken != null) {
                            requestBuilder.addHeader("x-captcha-token", verifyToken)
                        }
                        if (challenge != null) {
                            requestBuilder.addHeader("x-captcha-challenge", challenge)
                        }
                        requestBuilder.build()
                    }

                    SignInMethod.Oauth -> {
                        val code = call.getStringEnsure("code")
                        val state = call.getStringEnsure("state")
                        val clientNonce = call.getString("clientNonce")
                        val body = JSONObject()
                            .apply {
                                put("code", code)
                                put("state", state)
                                put("client_nonce", clientNonce)
                            }
                            .toString()
                            .toRequestBody("application/json".toMediaTypeOrNull())

                        Request.Builder()
                            .url("$endpoint/api/oauth/callback")
                            .addHeader("x-affine-client-kind", "native")
                            .post(body)
                            .build()
                    }

                    SignInMethod.MagicLink -> {
                        val email = call.getStringEnsure("email")
                        val token = call.getStringEnsure("token")
                        val clientNonce = call.getString("clientNonce")
                        val body = JSONObject()
                            .apply {
                                put("email", email)
                                put("token", token)
                                put("client_nonce", clientNonce)
                            }
                            .toString()
                            .toRequestBody("application/json".toMediaTypeOrNull())

                        Request.Builder()
                            .url("$endpoint/api/auth/magic-link")
                            .addHeader("x-affine-client-kind", "native")
                            .post(body)
                            .build()
                    }

                    SignInMethod.OpenApp -> {
                        val code = call.getStringEnsure("code")
                        val body = JSONObject()
                            .apply { put("code", code) }
                            .toString()
                            .toRequestBody("application/json".toMediaTypeOrNull())

                        Request.Builder()
                            .url("$endpoint/api/auth/open-app/sign-in")
                            .addHeader("x-affine-client-kind", "native")
                            .post(body)
                            .build()
                    }
                }

                AuthHttp.client.newCall(request).executeAsync().use { response ->
                    if (response.code >= 400) {
                        call.reject(response.body.string())
                        return@launch
                    }
                    val exchangeCode = JSONObject(response.body.string()).optString("exchangeCode").takeIf { it.isNotEmpty() }
                    if (exchangeCode == null) {
                        Timber.w("$method sign in fail, exchange code not found.")
                        call.reject("$method sign in fail, exchange code not found")
                        return@launch
                    }
                    val token = exchangeSession(endpoint, exchangeCode)
                    token.takeIf { it.isNotEmpty() }?.let {
                        CookieStore.clearAuthCookies(endpoint.toHttpUrl().host)
                        Timber.i("$method sign in success.")
                        call.resolve(JSObject().put("token", it))
                    } ?: run {
                        Timber.w("$method sign in fail, token not found.")
                        call.reject("$method sign in fail, token not found")
                    }
                }
            } catch (e: Exception) {
                Timber.w(e, "$method sign in fail.")
                call.reject("$method sign in fail.", null, e)
            }
        }
    }

    private suspend fun exchangeSession(endpoint: String, code: String): String {
        val body = JSONObject()
            .apply { put("code", code) }
            .toString()
            .toRequestBody("application/json".toMediaTypeOrNull())
        val request = Request.Builder()
            .url("$endpoint/api/auth/native/exchange")
            .addHeader("x-affine-client-kind", "native")
            .post(body)
            .build()

        AuthHttp.client.newCall(request).executeAsync().use { response ->
            if (response.code >= 400) {
                throw Exception(response.body.string())
            }
            return JSONObject(response.body.string()).optString("token")
        }
    }
}

private class TokenCipher {
    private val alias = "affine-native-auth-token"
    private val transformation = "AES/GCM/NoPadding"

    fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(transformation)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return listOf(
            "v1",
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            Base64.encodeToString(ciphertext, Base64.NO_WRAP),
        ).joinToString(":")
    }

    fun decrypt(encoded: String): String? {
        val parts = encoded.split(":")
        if (parts.size != 3 || parts[0] != "v1") {
            return null
        }

        return try {
            val iv = Base64.decode(parts[1], Base64.NO_WRAP)
            val ciphertext = Base64.decode(parts[2], Base64.NO_WRAP)
            val cipher = Cipher.getInstance(transformation)
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(),
                GCMParameterSpec(128, iv)
            )
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (e: Exception) {
            Timber.w(e, "Failed to decrypt auth token.")
            null
        }
    }

    fun isEncrypted(value: String) = value.startsWith("v1:")

    fun legacyPlaintext(value: String) =
        value.takeIf { !isEncrypted(it) && it.isNotBlank() }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let {
            return it.secretKey
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )
        val spec = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }
}
