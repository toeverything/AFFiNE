package app.affine.pro.ai.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.affine.pro.repo.GraphQLRepo
import app.affine.pro.repo.SSERepo
import app.affine.pro.repo.WebRepo
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
    private val webRepo: WebRepo,
    private val graphQLRepo: GraphQLRepo,
    private val sseRepo: SSERepo,
) : ViewModel() {

    private lateinit var sessionId: String

    private val _uiState: MutableStateFlow<ChatUiState> =
        MutableStateFlow(MessageUiState(emptyList()))

    val uiState: StateFlow<ChatUiState> = _uiState

    init {
        viewModelScope.launch {
            sessionId = graphQLRepo.createCopilotSession(
                workspaceId = webRepo.workspaceId(),
                docId = webRepo.docId(),
            ).getOrElse {
                Timber.w(it, "Create session failed")
                return@launch
            }
            Timber.i("Create session success:[ sessionId = $sessionId].")
            val historyMessages = graphQLRepo.getCopilotHistories(
                workspaceId = webRepo.workspaceId(),
                docId = webRepo.docId(),
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
            graphQLRepo.createCopilotMessage(
                sessionId = sessionId,
                message = message,
            ).onSuccess { messageId ->
                Timber.i("send message: $messageId")
                sseRepo.messageStream(sessionId, messageId)
                    .onEach {
                        Timber.d("On sse message: ${it.getOrNull()}")
                    }
                    .flowOn(Dispatchers.IO)
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