package app.affine.pro.service

import app.affine.pro.Prompt
import app.affine.pro.utils.getCurrentServerBaseUrl
import com.affine.pro.graphql.CreateCopilotMessageMutation
import com.affine.pro.graphql.CreateCopilotSessionMutation
import com.affine.pro.graphql.GetCopilotHistoriesQuery
import com.affine.pro.graphql.GetCopilotHistoryIdsQuery
import com.affine.pro.graphql.GetCopilotSessionsQuery
import com.affine.pro.graphql.type.CreateChatMessageInput
import com.affine.pro.graphql.type.CreateChatSessionInput
import com.affine.pro.graphql.type.PaginationInput
import com.affine.pro.graphql.type.QueryChatHistoriesInput
import com.apollographql.apollo.ApolloClient
import com.apollographql.apollo.api.Mutation
import com.apollographql.apollo.api.Optional
import com.apollographql.apollo.api.Query
import com.apollographql.apollo.api.Subscription
import com.apollographql.apollo.network.okHttpClient
import com.getcapacitor.Bridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GraphQLService @Inject constructor() {

    suspend fun getCopilotSession(workspaceId: String, docId: String) = query(
        GetCopilotSessionsQuery(
            workspaceId = workspaceId,
            docId = Optional.present(docId),
            pagination = PaginationInput(
              first = Optional.present(100)
            ),
            options = Optional.present(QueryChatHistoriesInput(action = Optional.present(false)))
        )
    ).mapCatching { data ->
        data.currentUser?.copilot?.chats?.paginatedCopilotChats?.edges?.map { item -> item.node.copilotChatHistory }?.find {
            it.parentSessionId == null
        }?.sessionId ?: error(ERROR_NULL_SESSION_ID)
    }

    suspend fun createCopilotSession(
        workspaceId: String,
        docId: String,
        prompt: Prompt = Prompt.ChatWithAFFiNEAI
    ) = mutation(
        CreateCopilotSessionMutation(
            CreateChatSessionInput(
                docId = Optional.present(docId),
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
    ) = query(
        GetCopilotHistoriesQuery(
            workspaceId = workspaceId,
            pagination = PaginationInput(
              first = Optional.present(100)
            ),
            docId = Optional.present(docId),
        )
    ).mapCatching { data ->
        data.currentUser?.copilot?.chats?.paginatedCopilotChats?.edges?.map { item -> item.node.copilotChatHistory }?.firstOrNull { history ->
          history.sessionId == sessionId
        }?.messages?.map { msg -> msg.copilotChatMessage } ?: emptyList()
    }

    suspend fun getCopilotHistoryIds(
        workspaceId: String,
        docId: String,
        sessionId: String,
    ) = query(
        GetCopilotHistoryIdsQuery(
            workspaceId = workspaceId,
            docId = Optional.present(docId),
            pagination = PaginationInput(
              first = Optional.present(100)
            ),
        )
    ).mapCatching { data ->
        data.currentUser?.copilot?.chats?.edges?.map { item -> item.node }?.firstOrNull { history ->
            history.sessionId == sessionId
        }?.messages ?: emptyList()
    }

    suspend fun createCopilotMessage(
        sessionId: String,
        message: String,
    ) = mutation(
        CreateCopilotMessageMutation(
            CreateChatMessageInput(
                sessionId = sessionId,
                content = Optional.present(message)
            )
        )
    ).mapCatching { data ->
        data.createCopilotMessage
    }

    suspend fun updateServer(bridge: Bridge) {
        val server = bridge.getCurrentServerBaseUrl()
        if (this::_client.isInitialized && _client.newBuilder().httpServerUrl == server) return
        _client = ApolloClient.Builder().serverUrl("$server/graphql")
            .okHttpClient(OkHttp.client)
            .build()
    }

    private lateinit var _client: ApolloClient

    private suspend fun <D : Query.Data> query(query: Query<D>) = withContext(Dispatchers.IO) {
        runCatching {
            withContext(Dispatchers.IO) {
                _client.query(query).execute().dataOrThrow()
            }
        }
    }

    private suspend fun <D : Mutation.Data> mutation(mutation: Mutation<D>) =
        withContext(Dispatchers.IO) {
            runCatching {
                _client.mutation(mutation).execute().dataOrThrow()
            }
        }

    private suspend fun <D : Subscription.Data> subscription(subscription: Subscription<D>) =
        withContext(Dispatchers.IO) {
            runCatching {
                _client.subscription(subscription).execute().dataOrThrow()
            }
        }

    companion object {
        private const val ERROR_NULL_SESSION_ID = "null session id."
    }
}
