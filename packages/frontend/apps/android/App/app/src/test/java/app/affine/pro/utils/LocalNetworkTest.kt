package app.affine.pro.utils

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

class LocalNetworkTest {

    @Test
    fun classifiesHostsLikeTheWebApp() {
        val fixture = javaClass.classLoader!!.getResource("hosts.json")!!.readText()
        val mismatches = Json.parseToJsonElement(fixture).jsonArray
            .map { it.jsonObject }
            .map { it["host"]!!.jsonPrimitive.content to it["local"]!!.jsonPrimitive.boolean }
            .filter { (host, local) -> LocalNetwork.isLocalHost(host) != local }
        assertEquals(emptyList<Pair<String, Boolean>>(), mismatches)
    }

    @Test
    fun okHttpGuardBlocksPublicHttpOnly() {
        val client = OkHttpClient.Builder()
            .addInterceptor(LocalNetwork.cleartextGuard)
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body("".toResponseBody())
                    .build()
            }
            .build()
        fun get(url: String) = client.newCall(Request.Builder().url(url).build()).execute().code

        assertThrows(IOException::class.java) { get("http://affine.home.com/graphql") }
        assertEquals(200, get("http://192.168.1.10:3010/graphql"))
        assertEquals(200, get("http://nas.local/graphql"))
        assertEquals(200, get("https://affine.home.com/graphql"))
    }
}
