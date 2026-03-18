package app.affine.pro.plugin

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.Dispatchers
import timber.log.Timber
import uniffi.affine_mobile_native.renderMermaidPreviewSvg
import uniffi.affine_mobile_native.renderTypstPreviewSvg

private fun JSObject.getOptionalString(key: String): String? {
    return if (has(key) && !isNull(key)) getString(key) else null
}

private fun JSObject.getOptionalDouble(key: String): Double? {
    return if (has(key) && !isNull(key)) getDouble(key) else null
}

@CapacitorPlugin(name = "Preview")
class PreviewPlugin : Plugin() {

    @PluginMethod
    fun renderMermaidSvg(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val code = call.getStringEnsure("code")
                val options = call.getObject("options")
                val svg = renderMermaidPreviewSvg(
                    code = code,
                    theme = options?.getOptionalString("theme"),
                    fontFamily = options?.getOptionalString("fontFamily"),
                    fontSize = options?.getOptionalDouble("fontSize"),
                )
                call.resolve(JSObject().apply {
                    put("svg", svg)
                })
            } catch (e: Exception) {
                Timber.e(e, "Failed to render Mermaid preview.")
                call.reject("Failed to render Mermaid preview.", null, e)
            }
        }
    }

    @PluginMethod
    fun renderTypstSvg(call: PluginCall) {
        launch(Dispatchers.IO) {
            try {
                val code = call.getStringEnsure("code")
                val svg = renderTypstPreviewSvg(
                    code = code,
                    fontDirs = null,
                    cacheDir = context.cacheDir.absolutePath,
                )
                call.resolve(JSObject().apply {
                    put("svg", svg)
                })
            } catch (e: Exception) {
                Timber.e(e, "Failed to render Typst preview.")
                call.reject("Failed to render Typst preview.", null, e)
            }
        }
    }
}
