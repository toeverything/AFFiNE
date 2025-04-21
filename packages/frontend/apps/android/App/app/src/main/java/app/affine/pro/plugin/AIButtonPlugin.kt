package app.affine.pro.plugin

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import timber.log.Timber

@CapacitorPlugin(name = "AIButton")
class AIButtonPlugin : Plugin() {

    interface Callback {
        fun present()
        fun dismiss()
    }

    @PluginMethod
    fun present(call: PluginCall) {
        launch {
            Timber.i("present AIButton")
            (activity as? Callback)?.present()
            call.resolve()
        }
    }

    @PluginMethod
    fun dismiss(call: PluginCall) {
        launch {
            Timber.i("dismiss AIButton")
            (activity as? Callback)?.dismiss()
            call.resolve()
        }
    }
}