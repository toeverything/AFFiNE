package app.affine.pro.service

import app.affine.pro.BuildConfig
import com.apollographql.apollo.ApolloClient
import com.apollographql.apollo.api.Mutation
import com.apollographql.apollo.api.Query
import com.apollographql.apollo.api.Subscription
import com.apollographql.apollo.network.okHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GraphQLClient @Inject constructor() {

    private val _client: ApolloClient by lazy {
        ApolloClient.Builder().serverUrl("${BuildConfig.BASE_URL}/graphql")
            .okHttpClient(OkHttp.client)
            .build()
    }

    suspend fun <D : Query.Data> query(query: Query<D>) = withContext(Dispatchers.IO) {
        runCatching {
            withContext(Dispatchers.IO) {
                _client.query(query).execute().dataOrThrow()
            }
        }
    }

    suspend fun <D : Mutation.Data> mutation(mutation: Mutation<D>) = withContext(Dispatchers.IO) {
        runCatching {
            _client.mutation(mutation).execute().dataOrThrow()
        }
    }

    suspend fun <D : Subscription.Data> subscription(subscription: Subscription<D>) =
        withContext(Dispatchers.IO) {
            runCatching {
                _client.subscription(subscription).execute().dataOrThrow()
            }
        }
}