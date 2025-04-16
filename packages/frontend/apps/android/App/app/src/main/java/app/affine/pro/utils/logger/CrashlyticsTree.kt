package app.affine.pro.utils.logger

import android.util.Log
import app.affine.pro.BuildConfig
import com.google.firebase.crashlytics.ktx.crashlytics
import com.google.firebase.ktx.Firebase
import timber.log.Timber

class CrashlyticsTree : Timber.Tree() {

    private val crashlytics = Firebase.crashlytics

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {

        if (priority < Log.INFO) {
            return
        }

        if (BuildConfig.DEBUG) {
            crashlytics.isCrashlyticsCollectionEnabled = false
            return
        }

        crashlytics.setCustomKey(CRASHLYTICS_KEY_PRIORITY, priority)

        if (tag != null) {
            crashlytics.setCustomKey(CRASHLYTICS_KEY_TAG, tag)
        }
        crashlytics.setCustomKey(CRASHLYTICS_KEY_MESSAGE, message)

        if (t == null) {
            crashlytics.recordException(Exception(message))
        } else {
            crashlytics.recordException(t)
        }
    }

    companion object {
        private const val CRASHLYTICS_KEY_PRIORITY = "priority"
        private const val CRASHLYTICS_KEY_TAG = "tag"
        private const val CRASHLYTICS_KEY_MESSAGE = "message"
    }
}