package app.affine.pro

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.affine_mobile_native.hashcashMint

@RunWith(AndroidJUnit4::class)
class NativeBindingsTest {
    @Test
    fun nativeLibraryMintsAHashcashStamp() {
        val stamp = hashcashMint("android-instrumentation", 0u).split(':')

        assertEquals("1", stamp[0])
        assertEquals("0", stamp[1])
        assertEquals("android-instrumentation", stamp[3])
    }
}
