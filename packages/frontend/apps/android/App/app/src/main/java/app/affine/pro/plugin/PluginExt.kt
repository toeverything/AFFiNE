package app.affine.pro.plugin

import androidx.lifecycle.lifecycleScope
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext

fun Plugin.launch(
    context: CoroutineContext = EmptyCoroutineContext,
    start: CoroutineStart = CoroutineStart.DEFAULT,
    block: suspend CoroutineScope.() -> Unit
) = activity?.lifecycleScope?.launch(context, start, block)

fun PluginCall.getStringEnsure(key: String): String {
    return getString(key) ?: throw IllegalArgumentException("Missing $key parameter")
}

inline fun <reified T> PluginCall.getListEnsure(key: String): List<T> {
    return getArray(key)?.toList() ?: throw IllegalArgumentException("Missing $key parameter")
}

fun PluginCall.getLongEnsure(key: String): Long {
    return getLong(key) ?: throw IllegalArgumentException("Missing $key parameter")
}