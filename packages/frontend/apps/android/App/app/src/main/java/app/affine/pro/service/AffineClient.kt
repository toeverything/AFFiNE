package app.affine.pro.service

import app.affine.pro.BuildConfig
import app.affine.pro.service.interceptor.CookieInterceptor
import com.apollographql.apollo.ApolloClient
import com.apollographql.apollo.api.ApolloResponse
import com.apollographql.apollo.api.Mutation
import com.apollographql.apollo.api.Query
import com.apollographql.apollo.api.Subscription
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AffineClient @Inject constructor() {

    private val _client: ApolloClient by lazy {
        ApolloClient.Builder().serverUrl("${BuildConfig.BASE_URL}/graphql")
            .addHttpInterceptor(CookieInterceptor)
            .build()
    }

    suspend fun <D : Query.Data> query(query: Query<D>): ApolloResponse<D> {
        return _client.query(query).execute()
    }

    suspend fun <D : Mutation.Data> mutation(mutation: Mutation<D>): ApolloResponse<D> {
        return _client.mutation(mutation).execute()
    }

    suspend fun <D : Subscription.Data> subscription(subscription: Subscription<D>): ApolloResponse<D> {
        return _client.subscription(subscription).execute()
    }
}