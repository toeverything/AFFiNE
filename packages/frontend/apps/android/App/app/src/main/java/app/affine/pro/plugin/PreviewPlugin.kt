package app.affine.pro.plugin

import android.net.Uri
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.Dispatchers
import timber.log.Timber
import uniffi.affine_mobile_native.renderMermaidPreviewSvg
import uniffi.affine_mobile_native.renderTypstPreviewSvg
import java.io.File

private fun JSObject.getOptionalString(key: String): String? {
    return if (has(key) && !isNull(key)) getString(key) else null
}

private fun JSObject.getOptionalDouble(key: String): Double? {
    return if (has(key) && !isNull(key)) getDouble(key) else null
}

private fun resolveLocalFontDir(fontUrl: String): String? {
    val uri = Uri.parse(fontUrl)
    val path = when {
        uri.scheme == null -> {
            val file = File(fontUrl)
            if (!file.isAbsolute) {
                return null
            }
            file.path
        }
        uri.scheme == "file" -> uri.path
        else -> null
    } ?: return null

    val file = File(path)
    val directory = if (file.isDirectory) file else file.parentFile ?: return null
    return directory.absolutePath
}

private fun JSObject.resolveTypstFontDirs(): List<String>? {
    if (!has("fontUrls") || isNull("fontUrls")) {
        return null
    }

    val fontUrls = optJSONArray("fontUrls")
        ?: throw IllegalArgumentException("Typst preview fontUrls must be an array of strings.")
    val fontDirs = buildList(fontUrls.length()) {
        repeat(fontUrls.length()) { index ->
            val fontUrl = fontUrls.optString(index, null)
                ?: throw IllegalArgumentException("Typst preview fontUrls must be strings.")
            val fontDir = resolveLocalFontDir(fontUrl)
                ?: throw IllegalArgumentException("Typst preview on mobile only supports local font file URLs or absolute font directories.")
            add(fontDir)
        }
    }
    return fontDirs.distinct()
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
                val options = call.getObject("options")
                val svg = renderTypstPreviewSvg(
                    code = code,
                    fontDirs = options?.resolveTypstFontDirs(),
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
