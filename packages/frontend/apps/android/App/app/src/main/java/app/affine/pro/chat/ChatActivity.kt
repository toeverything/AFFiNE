package app.affine.pro.chat

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat


class ChatActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets -> insets }
        setContent(

        ) {

        }
    }

    companion object {
        fun open(activity: AppCompatActivity) {
            with(activity) {
                startActivity(Intent(this, ChatActivity::class.java))
            }
        }
    }
}