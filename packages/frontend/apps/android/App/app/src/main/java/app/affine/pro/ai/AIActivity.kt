package app.affine.pro.ai

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.core.view.ViewCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.affine.pro.ai.chat.ChatViewModel
import app.affine.pro.ai.chat.MessageUiState
import app.affine.pro.ai.chat.ui.ChatAppBar
import app.affine.pro.ai.chat.ui.Message
import app.affine.pro.ai.chat.ui.UserInput
import app.affine.pro.theme.AffineTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch


@OptIn(ExperimentalMaterial3Api::class)
@AndroidEntryPoint
class AIActivity : AppCompatActivity() {

    private val viewModel by viewModels<ChatViewModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        delegate.localNightMode = AppCompatDelegate.MODE_NIGHT_YES
        super.onCreate(savedInstanceState)
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { v, insets ->
            ViewCompat.onApplyWindowInsets(v, insets)
        }
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
                    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
                    Column(
                        Modifier
                            .fillMaxSize()
                            .padding(paddingValues)
                    ) {
                        Box(Modifier.weight(1f)) {
                            with(uiState) {
                                when {
                                    this is MessageUiState -> LazyColumn(
                                        reverseLayout = true,
                                        state = scrollState,
                                        modifier = Modifier.fillMaxSize(),
                                    ) {
                                        items(
                                            items = messages,
                                            key = { it.id ?: "" },
                                            contentType = { it.role }
                                        ) { message ->
                                            Message(message)
                                        }
                                    }
                                }
                            }
                        }
                        val context = LocalContext.current
                        UserInput(
                            onMessageSent = { content ->
                                Toast.makeText(context, "Not implemented.", Toast.LENGTH_SHORT)
                                    .show()
//                                viewModel.sendMessage(content)
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

    companion object {
        fun open(activity: AppCompatActivity) {
            with(activity) {
                startActivity(Intent(this, AIActivity::class.java))
            }
        }
    }
}