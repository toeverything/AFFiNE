package app.affine.pro.plugin

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.Dispatchers
import uniffi.affine_mobile_native.hashcashMint

@CapacitorPlugin(name = "HashCash")
class HashCashPlugin : Plugin() {

    @PluginMethod
    fun hash(call: PluginCall) {
        launch(Dispatchers.IO) {
            val challenge = call.getString("challenge") ?: ""
            val bits = call.getInt("bits") ?: 20
            call.resolve(JSObject().apply {
                put("value", hashcashMint(resource = challenge, bits = bits.toUInt()))
            })
        }
    }
}