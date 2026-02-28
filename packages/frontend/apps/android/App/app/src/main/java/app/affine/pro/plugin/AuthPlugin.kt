package app.affine.pro.plugin

import android.annotation.SuppressLint
import app.affine.pro.service.CookieStore
import app.affine.pro.service.OkHttp
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.coroutines.executeAsync
import org.json.JSONObject
import timber.log.Timber

@OptIn(ExperimentalCoroutinesApi::class)
@CapacitorPlugin(name = "Auth")
class AuthPlugin : Plugin() {

    @PluginMethod
    fun signInMagicLink(call: PluginCall) {
        processSignIn(call, SignInMethod.MagicLink)
    }

    @PluginMethod
    fun signInOauth(call: PluginCall) {
        processSignIn(call, SignInMethod.Oauth)
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
                val request = Request.Builder()
                    .url("$endpoint/api/auth/sign-out")
                    .get()
                    .build()
                OkHttp.client.newCall(request).executeAsync().use { response ->
                    if (response.code >= 400) {
                        call.reject(response.body.string())
                        return@launch
                    }
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
        Password, Oauth, MagicLink
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
                            .post(body)
                            .build()
                    }
                }

                OkHttp.client.newCall(request).executeAsync().use { response ->
                    if (response.code >= 400) {
                        call.reject(response.body.string())
                        return@launch
                    }
                    CookieStore.getCookie(endpoint.toHttpUrl(), CookieStore.AFFINE_SESSION)?.let {
                        Timber.i("$method sign in success.")
                        Timber.d("Update session [$it]")
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
}
