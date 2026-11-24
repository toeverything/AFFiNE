package app.affine.pro.utils

import okhttp3.Interceptor
import java.io.IOException

/**
 * Plain-text (http, ws) traffic is only allowed to hosts on the local network,
 * matching iOS NSAllowsLocalNetworking: unqualified names, `.local` names, and
 * loopback, private and link-local IP literals. Names are never resolved, so a
 * public-looking name is rejected even if it points to a private address.
 *
 * The web app enforces the same rules in `@affine/core/utils/local-network`;
 * both are tested against its `fixtures/hosts.json`.
 */
object LocalNetwork {

    private val IPV4_LIKE_LABEL = Regex("^(?:0x[0-9a-f]*|\\d+)$")
    private val IPV4_LITERAL = Regex("^(?:0|[1-9]\\d{0,2})(?:\\.(?:0|[1-9]\\d{0,2})){3}$")
    private val IPV6_GROUP = Regex("^[0-9a-f]{1,4}$")

    fun isLocalHost(host: String): Boolean {
        val name = host.lowercase().removeSurrounding("[", "]").removeSuffix(".")
        if (':' in name) return isLocalIPv6(name)
        val labels = name.split('.')
        if (labels.any { it.isEmpty() }) return false
        if (IPV4_LIKE_LABEL.matches(labels.last())) return isLocalIPv4(name)
        return labels.size == 1 || labels.last() == "local"
    }

    fun blocksCleartext(scheme: String?, host: String?): Boolean {
        val plainText = scheme.equals("http", ignoreCase = true) ||
            scheme.equals("ws", ignoreCase = true)
        return plainText && (host == null || !isLocalHost(host))
    }

    /** Rejects plain-text requests to hosts outside the local network. */
    val cleartextGuard = Interceptor { chain ->
        val url = chain.request().url
        if (blocksCleartext(url.scheme, url.host)) {
            throw IOException(
                "Plain-text connection to ${url.host} is blocked: only local network servers may use http"
            )
        }
        chain.proceed(chain.request())
    }

    private fun isLocalIPv4(address: String): Boolean {
        if (!IPV4_LITERAL.matches(address)) return false
        val octets = address.split('.').map { it.toInt() }
        if (octets.any { it > 255 }) return false
        val (a, b) = octets
        return a == 127 ||
            a == 10 ||
            (a == 172 && b in 16..31) ||
            (a == 192 && b == 168) ||
            (a == 169 && b == 254)
    }

    private fun parseIPv6(address: String): List<Int>? {
        val halves = address.split("::")
        if (halves.size > 2) return null
        val head = if (halves[0].isEmpty()) emptyList() else halves[0].split(':')
        val tail = if (halves.size == 2 && halves[1].isNotEmpty()) halves[1].split(':') else emptyList()
        val missing = 8 - head.size - tail.size
        if (if (halves.size == 1) missing != 0 else missing < 1) return null
        val groups = head + List(if (halves.size == 2) missing else 0) { "0" } + tail
        if (!groups.all { IPV6_GROUP.matches(it) }) return null
        return groups.map { it.toInt(16) }
    }

    private fun isLocalIPv6(address: String): Boolean {
        val groups = parseIPv6(address.substringBefore('%')) ?: return false
        val isLoopback = groups.take(7).all { it == 0 } && groups[7] == 1
        return isLoopback ||
            (groups[0] and 0xfe00) == 0xfc00 ||
            (groups[0] and 0xffc0) == 0xfe80
    }
}
