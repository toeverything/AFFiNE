package app.affine.pro.ai.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.affine.pro.components.AffineAppBar
import app.affine.pro.components.AffineDropMenu

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatAppBar(
    modifier: Modifier = Modifier,
    scrollBehavior: TopAppBarScrollBehavior,
    onBackClick: () -> Unit = { },
    onClearHistory: () -> Unit = { },
    onSaveAsChatBlock: () -> Unit = { },
) {
    AffineAppBar(
        modifier = modifier,
        scrollBehavior = scrollBehavior,
        onNavIconPressed = onBackClick,
        title = {
            Row(
                modifier = Modifier.clickable { },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Chat with AI")
                Spacer(Modifier.width(10.dp))
                Icon(imageVector = Icons.Default.KeyboardArrowDown, contentDescription = null)
            }
        },
        actions = {
            AffineDropMenu(
                icon = { Icon(Icons.Default.MoreHoriz, contentDescription = "More actions") },
                menuItems = {
                    DropdownMenuItem(
                        text = { Text("Clear history") },
                        trailingIcon = { Icon(Icons.Default.Delete, contentDescription = null) },
                        onClick = onClearHistory,
                    )
                    DropdownMenuItem(
                        text = { Text("Save as chat block") },
                        trailingIcon = {
                            Icon(
                                Icons.Default.ChatBubble,
                                contentDescription = null
                            )
                        },
                        onClick = onSaveAsChatBlock,
                    )
                }
            )
        }
    )
}