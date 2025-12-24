package app.affine.pro.service

import app.affine.pro.AFFiNEApp
import app.affine.pro.CapacitorConfig
import app.affine.pro.utils.dataStore
import app.affine.pro.utils.set
import com.google.firebase.crashlytics.ktx.crashlytics
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import timber.log.Timber
import java.util.concurrent.ConcurrentHashMap

object OkHttp {

    val client = OkHttpClient.Builder()
        .cookieJar(object : CookieJar {

            override fun loadForRequest(url: HttpUrl): List<Cookie> {
                val cookies = CookieStore.getCookies(url.host)
                Timber.d("load cookies: [ url = $url, cookies = $cookies]")
                return cookies
            }

            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                Timber.d("save cookies: [ url = $url, cookies = $cookies]")
                CookieStore.saveCookies(url.host, cookies)
            }
        })
        .addInterceptor {
            it.proceed(
                it.request()
                    .newBuilder()
                    .addHeader("x-affine-version", CapacitorConfig.getAffineVersion())
                    .build()
            )
        }
        .addInterceptor(HttpLoggingInterceptor { msg ->
            Timber.d(msg)
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .build()

}

object CookieStore {

    const val AFFINE_SESSION = "affine_session"
    const val AFFINE_USER_ID = "affine_user_id"

    private val _cookies = ConcurrentHashMap<String, List<Cookie>>()

    fun saveCookies(host: String, cookies: List<Cookie>) {
        _cookies[host] = cookies
        MainScope().launch(Dispatchers.IO) {
            cookies.find { it.name == AFFINE_SESSION }?.let {
                AFFiNEApp.context().dataStore.set(host + AFFINE_SESSION, it.toString())
            }
            cookies.find { it.name == AFFINE_USER_ID }?.let {
                Timber.d("Update user id [${it.value}]")
                AFFiNEApp.context().dataStore.set(host + AFFINE_USER_ID, it.toString())
                Firebase.crashlytics.setUserId(it.value)
            }
        }
    }

    fun getCookies(host: String) = _cookies[host] ?: emptyList()

    fun getCookie(url: HttpUrl, name: String) = url.host
        .let { _cookies[it] }
        ?.find { cookie -> cookie.name == name }
        ?.value
}