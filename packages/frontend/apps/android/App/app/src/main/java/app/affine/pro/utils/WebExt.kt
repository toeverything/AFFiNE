package app.affine.pro.utils

import com.getcapacitor.Bridge
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

suspend fun Bridge.getCurrentServerBaseUrl() = eval("window.getCurrentServerBaseUrl()").strict()

suspend fun Bridge.getCurrentWorkspaceId() = eval("window.getCurrentWorkspaceId()").strict()

suspend fun Bridge.getCurrentDocId() = eval("window.getCurrentDocId()").strict()

suspend fun Bridge.getCurrentDocContentInMarkdown() =
    eval("window.getCurrentDocContentInMarkdown()").strict()

private suspend fun Bridge.eval(js: String): String {
    return suspendCoroutine { continuation ->
        eval(js) { result ->
            continuation.resume(result)
        }
    }
}

private fun String.strict() = let {
    if (startsWith("\"") && endsWith("\"")) {
        substring(1, lastIndex)
    } else {
        this
    }
}