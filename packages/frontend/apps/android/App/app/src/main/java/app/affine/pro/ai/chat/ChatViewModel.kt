package app.affine.pro.ai.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.affine.pro.service.GraphQLService
import app.affine.pro.service.SSEService
import app.affine.pro.service.WebService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val webService: WebService,
    private val graphQLService: GraphQLService,
    private val sseService: SSEService,
) : ViewModel() {

    private lateinit var sessionId: String

    private val _uiState: MutableStateFlow<ChatUiState> =
        MutableStateFlow(MessageUiState(emptyList()))

    val uiState: StateFlow<ChatUiState> = _uiState

    init {
        viewModelScope.launch {
            sessionId = graphQLService.createCopilotSession(
                workspaceId = webService.workspaceId(),
                docId = webService.docId(),
            ).getOrElse {
                Timber.w(it, "Create session failed")
                return@launch
            }
            Timber.i("Create session success:[ sessionId = $sessionId].")
            val historyMessages = graphQLService.getCopilotHistories(
                workspaceId = webService.workspaceId(),
                docId = webService.docId(),
                sessionId = sessionId,
            ).getOrDefault(emptyList()).map {
                ChatMessage.from(it)
            }.sortedByDescending {
                it.createAt
            }
            _uiState.value = MessageUiState(historyMessages)
        }
    }

    fun sendMessage(message: String) {
        val sendMessage = suspend {
            graphQLService.createCopilotMessage(
                sessionId = sessionId,
                message = message,
            ).onSuccess { messageId ->
                Timber.i("send message: $messageId")
                sseService.messageStream(sessionId, messageId)
                    .onEach {
                        Timber.d("On sse message: ${it.getOrNull()}")
                    }
                    .flowOn(Dispatchers.IO)
                    .collect()
            }
        }
        viewModelScope.launch {
            if (!this@ChatViewModel::sessionId.isInitialized) {
                graphQLService.getCopilotSession(
                    workspaceId = webService.workspaceId(),
                    docId = webService.docId(),
                ).onSuccess { id ->
                    sessionId = id
                    Timber.i("Create session: $id")
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