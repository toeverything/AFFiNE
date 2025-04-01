package app.affine.pro.ai.chat

import com.affine.pro.graphql.GetCopilotHistoriesQuery
import kotlinx.datetime.Instant

sealed class ChatUiState

data class MessageUiState(
    val messages: List<ChatMessage>
) : ChatUiState()

data class ChatMessage(
    val id: String?,
    val role: Role,
    val content: String,
    val createAt: Instant,
) {
    enum class Role(val value: String) {
        User("user"),
        AI("assistant");

        companion object {
            fun fromValue(role: String): Role {
                return entries.first { it.value == role }
            }
        }
    }

    companion object {
        fun from(message: GetCopilotHistoriesQuery.Message) = ChatMessage(
            id = message.id,
            role = Role.fromValue(message.role),
            content = message.content,
            createAt = message.createdAt
        )
    }
}