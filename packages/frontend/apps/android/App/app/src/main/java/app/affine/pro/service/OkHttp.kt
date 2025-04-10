package app.affine.pro.service

import androidx.core.net.toUri
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
        .addInterceptor(HttpLoggingInterceptor { msg ->
            Timber.tag("Affine-Network")
            Timber.d(msg)
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .build()

}

object CookieStore {

    private val _cookies = ConcurrentHashMap<String, List<Cookie>>()

    fun saveCookies(host: String, cookies: List<Cookie>) {
        _cookies[host] = cookies
    }

    fun getCookies(host: String) = _cookies[host] ?: emptyList()

    fun getCookie(url: String, name: String) = url.toUri().host
        ?.let { _cookies[it] }
        ?.find { cookie -> cookie.name == name }
        ?.value

}