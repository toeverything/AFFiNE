package app.affine.pro.ai.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.affine.pro.repo.GraphQLRepo
import app.affine.pro.repo.SSERepo
import app.affine.pro.repo.WebRepo
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import kotlin.coroutines.coroutineContext

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val webRepo: WebRepo,
    private val graphQLRepo: GraphQLRepo,
    private val sseRepo: SSERepo,
) : ViewModel() {

    private lateinit var sessionId: String

    init {
//        viewModelScope.launch {
//            graphQLRepo.getCopilotSession(
//                workspaceId = webRepo.workspaceId(),
//                docId = webRepo.docId(),
//            ).onSuccess { id ->
//                Timber.d("Get session: $id")
//                sessionId = id
//                graphQLRepo.getCopilotHistories(
//                    workspaceId = webRepo.workspaceId(),
//                    docId = webRepo.docId(),
//                    sessionId = sessionId,
//                ).onSuccess { messageList ->
//                    Timber.d("Histories: $messageList")
//                }
//            }.onFailure {
//                Timber.e(it, "Get session failed.")
//            }
//        }
    }

    fun sendMessage(message: String) {
        val sendMessage = suspend {
            graphQLRepo.createCopilotMessage(
                sessionId = sessionId,
                message = message,
            ).onSuccess { messageId ->
                Timber.d("send message: $messageId")
                sseRepo.messageStream(sessionId, messageId)
                    .onEach {
                        Timber.d("$coroutineContext")
                        Timber.d("on message: ${it.getOrNull()}")
                    }
                    .flowOn(Dispatchers.IO)
                    .onEach {
                        Timber.d("$coroutineContext")
                    }
                    .collect()
            }
        }
        viewModelScope.launch {
            if (!this@ChatViewModel::sessionId.isInitialized) {
                graphQLRepo.getCopilotSession(
                    workspaceId = webRepo.workspaceId(),
                    docId = webRepo.docId(),
                ).onSuccess { id ->
                    sessionId = id
                    Timber.d("Create session: $id")
                    sendMessage()
                }.onFailure {
                    Timber.e(it, "Create session failed.")
                }
            } else {
                sendMessage()
            }
        }
    }
}