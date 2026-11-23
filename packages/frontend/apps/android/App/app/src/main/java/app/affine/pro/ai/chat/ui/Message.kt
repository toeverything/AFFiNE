package app.affine.pro.ai.chat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.affine.pro.R
import app.affine.pro.ai.chat.ChatMessage
import app.affine.pro.components.AFFiNEIcon
import app.affine.pro.components.Markdown
import app.affine.pro.theme.AFFiNETheme
import kotlinx.datetime.Clock

@Composable
fun Message(message: ChatMessage) {
    Column(
        Modifier
            .fillMaxWidth()
            .let {
                if (message.role == ChatMessage.Role.User) {
                    it.background(
                        color = Color.White.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(10.dp),
                    )
                } else {
                    it
                }
            }
            .padding(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AFFiNEIcon(
                R.drawable.ic_ai,
                tint = AFFiNETheme.colors.iconActivated
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = when (message.role) {
                    ChatMessage.Role.User -> "You"
                    ChatMessage.Role.AI -> "Affine AI"
                },
                color = AFFiNETheme.colors.textPrimary,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(8.dp))
        when (message.role) {
            ChatMessage.Role.User -> Text(
                text = message.content,
                color = Color.White,
                fontSize = 16.sp,
            )

            ChatMessage.Role.AI -> Markdown(markdown = message.content)
        }
    }
}

@Preview
@Composable
fun UserMessagePreview() {
    Column {
        Message(
            ChatMessage(
                id = null,
                role = ChatMessage.Role.User,
                content = "Feel free to input any text and see how AI ABC responds. Give it a go!",
                createAt = Clock.System.now(),
            )
        )

        Spacer(Modifier.height(16.dp))

        Message(
            ChatMessage(
                id = null,
                role = ChatMessage.Role.AI,
                content = "Go ahead and type in any message to see how our AI system will reply. Try it out!",
                createAt = Clock.System.now(),
            )
        )
    }
}