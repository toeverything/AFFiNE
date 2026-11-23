package app.affine.pro.plugin

import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "MobileBack")
class MobileBackPlugin : Plugin() {
    private val callback = object : OnBackPressedCallback(false) {
        override fun handleOnBackStarted(backEvent: BackEventCompat) {
            emit("begin", backEvent.progress)
        }

        override fun handleOnBackProgressed(backEvent: BackEventCompat) {
            emit("progress", backEvent.progress)
        }

        override fun handleOnBackCancelled() {
            emit("cancel")
        }

        override fun handleOnBackPressed() {
            emit("commit")
        }
    }

    override fun load() {
        activity.onBackPressedDispatcher.addCallback(activity, callback)
    }

    @PluginMethod
    fun setEnabled(call: PluginCall) {
        callback.isEnabled = call.getBoolean("enabled", false) ?: false
        call.resolve()
    }

    private fun emit(phase: String, progress: Float? = null) {
        notifyListeners("back", JSObject().apply {
            put("phase", phase)
            progress?.let { put("progress", it) }
        })
    }

    override fun handleOnDestroy() {
        callback.remove()
        super.handleOnDestroy()
    }
}
