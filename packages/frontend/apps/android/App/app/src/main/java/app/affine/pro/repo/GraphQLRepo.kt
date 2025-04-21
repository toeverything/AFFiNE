package app.affine.pro.repo

import app.affine.pro.Prompt
import app.affine.pro.service.GraphQLClient
import com.affine.pro.graphql.CreateCopilotMessageMutation
import com.affine.pro.graphql.CreateCopilotSessionMutation
import com.affine.pro.graphql.GetCopilotHistoriesQuery
import com.affine.pro.graphql.GetCopilotSessionsQuery
import com.affine.pro.graphql.type.CreateChatMessageInput
import com.affine.pro.graphql.type.CreateChatSessionInput
import com.apollographql.apollo.api.Optional
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GraphQLRepo @Inject constructor(
    private val client: GraphQLClient
) {

    suspend fun getCopilotSession(workspaceId: String, docId: String) = client.query(
        GetCopilotSessionsQuery(
            workspaceId = workspaceId,
            docId = Optional.present(docId)
        )
    ).mapCatching { data ->
        data.currentUser?.copilot?.sessions?.firstOrNull()?.id ?: error(ERROR_NULL_SESSION_ID)
    }

    suspend fun createCopilotSession(
        workspaceId: String,
        docId: String,
        prompt: Prompt = Prompt.ChatWithAFFiNEAI
    ) = client.mutation(
        CreateCopilotSessionMutation(
            CreateChatSessionInput(
                docId = docId,
                workspaceId = workspaceId,
                promptName = prompt.value
            )
        )
    ).mapCatching { data ->
        data.createCopilotSession
    }

    suspend fun getCopilotHistories(
        workspaceId: String,
        docId: String,
        sessionId: String,
    ) = client.query(
        GetCopilotHistoriesQuery(
            workspaceId = workspaceId,
            docId = Optional.present(docId),
        )
    ).mapCatching { data ->
        data.currentUser?.copilot?.histories?.firstOrNull { history ->
            history.sessionId == sessionId
        }?.messages ?: emptyList()
    }

    suspend fun createCopilotMessage(
        sessionId: String,
        message: String,
    ) = client.mutation(CreateCopilotMessageMutation(
        CreateChatMessageInput(
            sessionId = sessionId,
            content = Optional.present(message)
        )
    )).mapCatching { data ->
        data.createCopilotMessage
    }

    companion object {
        private const val ERROR_NULL_SESSION_ID = "null session id."
    }
}