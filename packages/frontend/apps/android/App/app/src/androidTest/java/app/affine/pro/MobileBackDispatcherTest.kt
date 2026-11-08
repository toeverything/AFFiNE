package app.affine.pro

import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MobileBackDispatcherTest {
    @Test
    fun disabledAppCallbackPassesTheSameBackToTheNextCallback() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                var fallbackCalled = false
                activity.onBackPressedDispatcher.addCallback(
                    object : OnBackPressedCallback(true) {
                        override fun handleOnBackPressed() {
                            fallbackCalled = true
                        }
                    },
                )
                val appCallback = object : OnBackPressedCallback(true) {
                    override fun handleOnBackPressed() = Unit
                }
                activity.onBackPressedDispatcher.addCallback(appCallback)

                appCallback.isEnabled = false
                activity.onBackPressedDispatcher.onBackPressed()

                assertTrue(fallbackCalled)
            }
        }
    }

    @Test
    fun predictiveLifecycleTargetsOneEnabledCallback() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val phases = mutableListOf<String>()
                activity.onBackPressedDispatcher.addCallback(
                    object : OnBackPressedCallback(true) {
                        override fun handleOnBackStarted(backEvent: BackEventCompat) {
                            phases.add("begin")
                        }

                        override fun handleOnBackProgressed(backEvent: BackEventCompat) {
                            phases.add("progress")
                        }

                        override fun handleOnBackCancelled() {
                            phases.add("cancel")
                        }

                        override fun handleOnBackPressed() {
                            phases.add("commit")
                        }
                    },
                )
                val event = BackEventCompat(0f, 0f, 0.5f, BackEventCompat.EDGE_LEFT)
                activity.onBackPressedDispatcher.dispatchOnBackStarted(event)
                activity.onBackPressedDispatcher.dispatchOnBackProgressed(event)
                activity.onBackPressedDispatcher.dispatchOnBackCancelled()
                activity.onBackPressedDispatcher.dispatchOnBackStarted(event)
                activity.onBackPressedDispatcher.onBackPressed()

                assertEquals(
                    listOf("begin", "progress", "cancel", "begin", "commit"),
                    phases,
                )
            }
        }
    }
}
