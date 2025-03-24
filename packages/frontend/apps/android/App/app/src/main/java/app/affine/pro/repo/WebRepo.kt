package app.affine.pro.repo

import com.getcapacitor.Bridge
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

@Singleton
class WebRepo @Inject constructor() {

    suspend fun init(bridge: Bridge) {
        _workspaceId = eval(bridge, "window.getCurrentWorkspaceId()")
        _docId = eval(bridge, "window.getCurrentDocId()")
        _docContentInMD = eval(bridge, "window.getCurrentDocContentInMarkdown()")
    }

    private suspend fun eval(bridge: Bridge, js: String): String {
        return suspendCoroutine { continuation ->
            bridge.eval(js) { result ->
                continuation.resume(result)
            }
        }
    }

    private lateinit var _workspaceId: String
    private lateinit var _docId: String
    private lateinit var _docContentInMD: String

    fun workspaceId() = _workspaceId

    fun docId() = _docId

    fun docContentInMD() = _docContentInMD
}