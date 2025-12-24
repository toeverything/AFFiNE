package app.affine.pro

import android.annotation.SuppressLint
import android.app.Application
import android.content.Context
import app.affine.pro.utils.logger.AffineDebugTree
import app.affine.pro.utils.logger.CrashlyticsTree
import app.affine.pro.utils.logger.FileTree
import com.google.firebase.crashlytics.ktx.crashlytics
import com.google.firebase.crashlytics.setCustomKeys
import com.google.firebase.ktx.Firebase
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber

@HiltAndroidApp
class AFFiNEApp : Application() {

    override fun onCreate() {
        super.onCreate()
        _context = applicationContext
        // init logger
        if (BuildConfig.DEBUG) {
            Timber.plant(AffineDebugTree())
        } else {
            Timber.plant(CrashlyticsTree(), FileTree(applicationContext))
        }
        Timber.i("Application started.")
        // init capacitor config
        CapacitorConfig.init(baseContext)
        // init crashlytics
        Firebase.crashlytics.setCustomKeys {
            key("affine_version", CapacitorConfig.getAffineVersion())
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