package app.affine.pro.ai.chat

import android.widget.Toast
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.affine.pro.AFFiNEApp
import app.affine.pro.service.GraphQLService
import app.affine.pro.service.SSEService
import app.affine.pro.service.WebService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.update
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

    private val _messagesUiState: MutableStateFlow<MessageUiState> =
        MutableStateFlow(MessageUiState(emptyList()))

    private val _sendBtnUiState: MutableStateFlow<Boolean> = MutableStateFlow(false)

    val messagesUiState: StateFlow<MessageUiState> = _messagesUiState

    val sendBtnUiState: StateFlow<Boolean> = _sendBtnUiState

    init {
        viewModelScope.launch {
            sessionId = graphQLService.getCopilotSession(
                webService.workspaceId(),
                webService.docId()
            ).getOrNull() ?: graphQLService.createCopilotSession(
                workspaceId = webService.workspaceId(),
                docId = webService.docId(),
            ).getOrElse {
                Timber.w(it, "Create session failed")
                return@launch
            }
            _sendBtnUiState.value = true
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
            _messagesUiState.value = MessageUiState(historyMessages)
        }
    }

    fun sendMessage(message: String) {
        viewModelScope.launch {
            _sendBtnUiState.value = false
            val messageId = graphQLService.createCopilotMessage(
                sessionId = sessionId,
                message = message,
            ).getOrElse {
                Timber.e(it, "Send message fail.")
                Toast.makeText(AFFiNEApp.context(), "Loading.", Toast.LENGTH_SHORT).show()
                return@launch
            }
            Timber.i("Send message: $messageId")
            _messagesUiState.update {
                it.addMessage(ChatMessage.newUserMessage(messageId, message))
            }
            sseService.messageStream(sessionId, messageId)
                .onStart {
                    _messagesUiState.update {
                        it.addMessage(ChatMessage.newAIMessage())
                    }
                }
                .onEach {
                    val event = it.getOrThrow()
                    Timber.d("On sse event: $event")
                    when (event.type) {
                        "message" -> _messagesUiState.update { state ->
                            state.updateMessageAt(0) { message ->
                                message.copy(content = message.content + event.data)
                            }
                        }
                        "error" -> Timber.e(event.data)
                    }
                }
                .catch {
                    Timber.e(it, "Receive message fail.")
                }
                .flowOn(Dispatchers.IO)
                .collect()
            val ids = graphQLService.getCopilotHistoryIds(
                webService.workspaceId(),
                webService.docId(),
                sessionId,
            ).getOrElse { emptyList() }
            if (ids.isNotEmpty() && ids.size == _messagesUiState.value.messages.size) {
                _messagesUiState.update { state ->
                    state.updateMessageAt(0) { message ->
                        message.copy(id = ids.last().id)
                    }
                }
            }
            _sendBtnUiState.value = true
        }
    }
}