package app.affine.pro

import android.annotation.SuppressLint
import android.app.Application
import android.content.Context
import app.affine.pro.service.CookieStore
import app.affine.pro.utils.dataStore
import app.affine.pro.utils.get
import app.affine.pro.utils.logger.AffineDebugTree
import app.affine.pro.utils.logger.CrashlyticsTree
import com.google.firebase.crashlytics.ktx.crashlytics
import com.google.firebase.crashlytics.setCustomKeys
import com.google.firebase.ktx.Firebase
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import timber.log.Timber

@HiltAndroidApp
class AffineApp : Application() {

    override fun onCreate() {
        super.onCreate()
        _context = applicationContext
        // init logger
        Timber.plant(if (BuildConfig.DEBUG) AffineDebugTree() else CrashlyticsTree())
        // init capacitor config
        CapacitorConfig.init(baseContext)
        // init crashlytics
        Firebase.crashlytics.setCustomKeys {
            key("affine_version", CapacitorConfig.getAffineVersion())
        }
        // init cookies from local
        MainScope().launch(Dispatchers.IO) {
            val sessionCookieStr = applicationContext.dataStore.get(CookieStore.AFFINE_SESSION)
            val userIdCookieStr = applicationContext.dataStore.get(CookieStore.AFFINE_USER_ID)
            if (sessionCookieStr.isEmpty() || userIdCookieStr.isEmpty()) {
                Timber.i("[init] user has not signed in yet.")
                return@launch
            }
            Timber.i("[init] user already signed in.")
            try {
                val cookies = listOf(
                    Cookie.parse(BuildConfig.BASE_URL.toHttpUrl(), sessionCookieStr)
                        ?: error("Parse session cookie fail:[ cookie = $sessionCookieStr ]"),
                    Cookie.parse(BuildConfig.BASE_URL.toHttpUrl(), userIdCookieStr)
                        ?: error("Parse user id cookie fail:[ cookie = $userIdCookieStr ]"),
                )
                CookieStore.saveCookies(BuildConfig.BASE_URL.toHttpUrl().host, cookies)
            } catch (e: Exception) {
                Timber.w(e, "[init] load persistent cookies fail.")
            }
        }
    }

    override fun onTerminate() {
        _context = null
        super.onTerminate()
    }

    companion object {
        @SuppressLint("StaticFieldLeak")
        private var _context: Context? = null

        fun context() = requireNotNull(_context)
    }
}