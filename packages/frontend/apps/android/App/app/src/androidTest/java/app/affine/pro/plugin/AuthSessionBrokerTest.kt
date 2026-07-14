package app.affine.pro.plugin

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.affine.pro.utils.authDataStoreCorruptionHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.TimeUnit

private val Context.corruptionTestDataStore by preferencesDataStore(
    name = "auth-session-corruption-test",
    corruptionHandler = authDataStoreCorruptionHandler,
)

@RunWith(AndroidJUnit4::class)
class AuthSessionBrokerTest {
    private lateinit var server: MockWebServer
    private lateinit var endpoint: String
    private lateinit var broker: AuthSessionBroker

    @Before
    fun setUp() = runBlocking {
        server = MockWebServer()
        server.start()
        endpoint = server.url("/").toString().removeSuffix("/")
        broker = AuthSessionBroker()
        broker.clear(endpoint)
    }

    @After
    fun tearDown() = runBlocking {
        broker.clear(endpoint)
        server.shutdown()
    }

    @Test
    fun persistsEncryptedPairAcrossBrokerRecreation() = runBlocking {
        broker.store(endpoint, tokenResponse("access-one", refreshToken('a'), 900))

        assertEquals("access-one", AuthSessionBroker().validAccessToken(endpoint))
    }

    @Test
    fun concurrentCallersShareOneRefresh() = runBlocking {
        broker.store(endpoint, tokenResponse("expired", refreshToken('a'), 1))
        Thread.sleep(1_100)
        server.enqueue(MockResponse().setBody(tokenResponse("fresh", refreshToken('b'), 900)))

        val tokens = List(20) { async { broker.validAccessToken(endpoint) } }.awaitAll()

        assertTrue(tokens.all { it == "fresh" })
        assertEquals(1, server.requestCount)
    }

    @Test
    fun retriesPendingRotationBeforeStartingAnotherRefresh() = runBlocking {
        val storage = FakeStorage()
        val testBroker = AuthSessionBroker(storage)
        testBroker.store(endpoint, tokenResponse("expired", refreshToken('a'), 1))
        Thread.sleep(1_100)
        storage.failWrites = 1
        server.enqueue(MockResponse().setBody(tokenResponse("fresh", refreshToken('b'), 900)))

        assertThrows(Exception::class.java) {
            runBlocking { testBroker.refreshAccessToken(endpoint) }
        }
        assertEquals("fresh", testBroker.refreshAccessToken(endpoint))
        assertEquals(1, server.requestCount)
    }

    @Test
    fun corruptedCredentialBecomesLocalCredentialLoss() = runBlocking {
        val storage = FakeStorage().apply { value = "not-json" }

        assertNull(AuthSessionBroker(storage).validAccessToken(endpoint))
        assertNull(storage.value)
    }

    @Test
    fun corruptedDataStoreFileIsReplacedWithEmptyPreferences() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = context.filesDir.resolve("datastore/auth-session-corruption-test.preferences_pb")
        file.parentFile?.mkdirs()
        file.writeBytes(byteArrayOf(0x7f, 0x01, 0x02, 0x03))

        val preferences = withTimeout(5_000) {
            context.corruptionTestDataStore.data.first()
        }
        assertTrue(preferences.asMap().isEmpty())
    }

    @Test
    fun transientRefreshFailurePreservesStoredCredential() = runBlocking {
        val storage = FakeStorage()
        val testBroker = AuthSessionBroker(storage)
        testBroker.store(endpoint, tokenResponse("expired", refreshToken('a'), 1))
        Thread.sleep(1_100)
        repeat(3) { server.enqueue(MockResponse().setResponseCode(503)) }

        assertThrows(Exception::class.java) {
            runBlocking { testBroker.refreshAccessToken(endpoint) }
        }
        assertTrue(storage.value?.contains("expired") == true)
    }

    @Test
    fun clearWinsAgainstInflightRefresh() = runBlocking {
        broker.store(endpoint, tokenResponse("expired", refreshToken('a'), 1))
        Thread.sleep(1_100)
        server.enqueue(
            MockResponse()
                .setBody(tokenResponse("stale", refreshToken('b'), 900))
                .setBodyDelay(500, TimeUnit.MILLISECONDS),
        )

        val refresh = async { broker.refreshAccessToken(endpoint) }
        assertNotNull(withContext(Dispatchers.IO) { server.takeRequest(5, TimeUnit.SECONDS) })
        broker.clear(endpoint)

        assertThrows(Exception::class.java) { runBlocking { refresh.await() } }
        assertNull(broker.validAccessToken(endpoint))
    }

    @Test
    fun newLoginWinsAgainstInflightRefresh() = runBlocking {
        broker.store(endpoint, tokenResponse("expired", refreshToken('a'), 1))
        Thread.sleep(1_100)
        server.enqueue(
            MockResponse()
                .setBody(tokenResponse("stale", refreshToken('b'), 900))
                .setBodyDelay(500, TimeUnit.MILLISECONDS),
        )

        val refresh = async { broker.refreshAccessToken(endpoint) }
        assertNotNull(withContext(Dispatchers.IO) { server.takeRequest(5, TimeUnit.SECONDS) })
        broker.store(endpoint, tokenResponse("new-login", refreshToken('c'), 900))

        assertThrows(Exception::class.java) { runBlocking { refresh.await() } }
        assertEquals("new-login", broker.validAccessToken(endpoint))
    }

    @Test
    fun signOutWinsAgainstInflightRefresh() = runBlocking {
        broker.store(endpoint, tokenResponse("expired", refreshToken('a'), 1))
        Thread.sleep(1_100)
        server.enqueue(
            MockResponse()
                .setBody(tokenResponse("stale", refreshToken('b'), 900))
                .setBodyDelay(500, TimeUnit.MILLISECONDS),
        )
        server.enqueue(MockResponse().setBody("{}"))

        val refresh = async { broker.refreshAccessToken(endpoint) }
        assertNotNull(withContext(Dispatchers.IO) { server.takeRequest(5, TimeUnit.SECONDS) })
        broker.signOut(endpoint)

        assertThrows(Exception::class.java) { runBlocking { refresh.await() } }
        assertNull(broker.validAccessToken(endpoint))
    }

    @Test
    fun invalidatedEndpointKeyIsRecreatedWithoutPlaintextFallback() {
        val cipher = TokenCipher()
        val value = cipher.encrypt(endpoint, "secret")
        assertEquals("secret", cipher.decrypt(endpoint, value))

        cipher.reset(endpoint)
        assertNull(cipher.decrypt(endpoint, value))
        assertEquals("replacement", cipher.decrypt(endpoint, cipher.encrypt(endpoint, "replacement")))
    }

    private fun tokenResponse(access: String, refresh: String, expiresIn: Int) =
        JSONObject()
            .put("tokenType", "Bearer")
            .put("accessToken", access)
            .put("expiresIn", expiresIn)
            .put("refreshToken", refresh)
            .put("refreshExpiresAt", isoAfter(86_400))
            .put(
                "session",
                JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("absoluteExpiresAt", isoAfter(172_800)),
            )
            .toString()

    private fun refreshToken(seed: Char) =
        "aff_rt_v1.${seed.toString().repeat(24)}.${seed.toString().repeat(43)}"

    private fun isoAfter(seconds: Long) =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(System.currentTimeMillis() + seconds * 1000))

    private class FakeStorage : AuthCredentialStorage {
        var value: String? = null
        var failWrites = 0

        override suspend fun read(endpoint: String) = value

        override suspend fun write(endpoint: String, value: String) {
            if (failWrites > 0) {
                failWrites--
                throw IllegalStateException("storage unavailable")
            }
            this.value = value
        }

        override suspend fun delete(endpoint: String) {
            value = null
        }
    }
}
