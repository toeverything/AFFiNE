package app.affine.pro.service

import android.webkit.CookieManager
import app.affine.pro.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import timber.log.Timber

object OkHttp {

    val client = OkHttpClient.Builder()
        .addInterceptor { chain ->
            chain.proceed(
                chain.request()
                    .newBuilder()
                    .addHeader("Cookie", CookieManager.getInstance().getCookie(BuildConfig.BASE_URL))
                    .build()
            )
        }
        .addInterceptor(HttpLoggingInterceptor { msg ->
            Timber.tag("Affine-Network")
            Timber.d(msg)
        }.apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .build()

}