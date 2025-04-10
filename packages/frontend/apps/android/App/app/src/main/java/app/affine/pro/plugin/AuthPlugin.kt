package app.affine.pro.plugin

import android.annotation.SuppressLint
import app.affine.pro.CapacitorConfig
import app.affine.pro.service.CookieStore
import app.affine.pro.service.OkHttp
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.coroutines.executeAsync
import org.json.JSONObject

@OptIn(ExperimentalCoroutinesApi::class)
@CapacitorPlugin(name = "Auth")
class AuthPlugin : Plugin() {

    @PluginMethod
    fun signInMagicLink(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
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

                val request = Request.Builder()
                    .url("$endpoint/api/auth/magic-link")
                    .header("x-affine-version", CapacitorConfig.getAffineVersion())
                    .post(body)
                    .build()
                OkHttp.client.newCall(request).executeAsync().use { response ->
                    if (response.code >= 400) {
                        call.reject(response.body.string())
                        return@launch
                    }
                    CookieStore.getCookie(endpoint, "affine_session")?.let {
                        call.resolve(JSObject().put("token", it))
                    } ?: call.reject("token not found")
                }
            } catch (e: Exception) {
                call.reject("Failed to sign in, $e", null, e)
            }
        }
    }

    @PluginMethod
    fun signInOauth(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
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

                val request = Request.Builder()
                    .url("$endpoint/api/oauth/callback")
                    .header("x-affine-version", CapacitorConfig.getAffineVersion())
                    .post(body)
                    .build()
                OkHttp.client.newCall(request).executeAsync().use { response ->
                    if (response.code >= 400) {
                        call.reject(response.body.string())
                        return@launch
                    }
                    CookieStore.getCookie(endpoint, "affine_session")?.let {
                        call.resolve(JSObject().put("token", it))
                    } ?: call.reject("token not found")
                }
            } catch (e: Exception) {
                call.reject("Failed to sign in, $e", null, e)
            }
        }
    }

    @SuppressLint("BuildListAdds")
    @PluginMethod
    fun signInPassword(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
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
                    .header("x-affine-version", CapacitorConfig.getAffineVersion())
                    .post(body)
                if (verifyToken != null) {
                    requestBuilder.addHeader("x-captcha-token", verifyToken)
                }
                if (challenge != null) {
                    requestBuilder.addHeader("x-captcha-challenge", challenge)
                }
                OkHttp.client.newCall(requestBuilder.build()).executeAsync().use { response ->
                    if (response.code >= 400) {
                        call.reject(response.body.string())
                        return@launch
                    }
                    CookieStore.getCookie(endpoint, "affine_session")?.let {
                        call.resolve(JSObject().put("token", it))
                    } ?: call.reject("token not found")
                }
            } catch (e: Exception) {
                call.reject("Failed to sign in, $e", null, e)
            }
        }
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val endpoint = call.getStringEnsure("endpoint")
                val request = Request.Builder()
                    .url("$endpoint/api/auth/sign-out")
                    .header("x-affine-version", CapacitorConfig.getAffineVersion())
                    .get()
                    .build()
                OkHttp.client.newCall(request).executeAsync().use { response ->
                    if (response.code >= 400) {
                        call.reject(response.body.string())
                        return@launch
                    }
                    call.resolve(JSObject().put("ok", true))
                }
            } catch (e: Exception) {
                call.reject("Failed to sign out, $e", null, e)
            }
        }
    }
}
