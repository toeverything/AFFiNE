package app.affine.pro.ai

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.core.view.ViewCompat
import app.affine.pro.ai.chat.ChatAppBar
import app.affine.pro.ai.chat.UserInput
import app.affine.pro.theme.AffineTheme
import kotlinx.coroutines.launch


@OptIn(ExperimentalMaterial3Api::class)
class AIActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        setupTheme()
        super.onCreate(savedInstanceState)
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets -> insets }
        setContent {
            val scope = rememberCoroutineScope()
            val scrollState = rememberLazyListState()
            val topBarState = rememberTopAppBarState()
            val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior(topBarState)
            AffineTheme(isDarkTheme = true) {
                Scaffold(
                    topBar = {
                        ChatAppBar(
                            scrollBehavior = scrollBehavior,
                            onBackClick = { finish() },
                        )
                    },
                    contentWindowInsets = ScaffoldDefaults
                        .contentWindowInsets
                        .exclude(WindowInsets.navigationBars)
                        .exclude(WindowInsets.ime),
                    modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
                ) { paddingValues ->
                    Column(
                        Modifier
                            .fillMaxSize()
                            .padding(paddingValues)
                    ) {
                        Box(Modifier.weight(1f)) {
                            LazyColumn(
                                state = scrollState,
                                modifier = Modifier.fillMaxSize()
                            ) { }
                        }
                        UserInput(
                            onMessageSent = { content ->

                            },
                            resetScroll = {
                                scope.launch {
                                    scrollState.scrollToItem(0)
                                }
                            },
                            modifier = Modifier
                                .navigationBarsPadding()
                                .imePadding()
                        )
                    }
                }
            }
        }
    }

    private fun setupTheme() {
        enableEdgeToEdge()
        delegate.localNightMode = AppCompatDelegate.MODE_NIGHT_YES
    }

    companion object {
        fun open(activity: AppCompatActivity) {
            with(activity) {
                startActivity(Intent(this, AIActivity::class.java))
            }
        }
    }
}