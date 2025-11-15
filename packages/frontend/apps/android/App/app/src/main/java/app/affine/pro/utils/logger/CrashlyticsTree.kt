package app.affine.pro.utils.logger

import android.util.Log
import com.google.firebase.crashlytics.ktx.crashlytics
import com.google.firebase.ktx.Firebase
import timber.log.Timber

class CrashlyticsTree : Timber.Tree() {

    private val crashlytics = Firebase.crashlytics

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {

        if (priority < Log.INFO) {
            return
        }

        val level = when (priority) {
            Log.ASSERT -> "[assert]"
            Log.ERROR -> "[error]"
            Log.WARN -> "[warn]"
            else -> "[info]"
        }

        crashlytics.log(
            StringBuilder(level)
                .append(tag?.let { "[$tag]" } ?: "")
                .append(" ")
                .append(message)
                .toString()
        )

        if (t == null) return
        crashlytics.recordException(t)
    }
}