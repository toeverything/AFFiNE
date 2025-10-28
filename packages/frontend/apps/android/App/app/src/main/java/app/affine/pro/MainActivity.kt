package app.affine.pro

import android.content.res.ColorStateList
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.WebSettings
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.DrawableCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateMargins
import androidx.lifecycle.lifecycleScope
import androidx.vectordrawable.graphics.drawable.VectorDrawableCompat
import app.affine.pro.ai.AIActivity
import app.affine.pro.plugin.AIButtonPlugin
import app.affine.pro.plugin.AFFiNEThemePlugin
import app.affine.pro.plugin.AuthPlugin
import app.affine.pro.plugin.HashCashPlugin
import app.affine.pro.plugin.NbStorePlugin
import app.affine.pro.service.GraphQLService
import app.affine.pro.service.SSEService
import app.affine.pro.service.WebService
import app.affine.pro.utils.px2dp
import app.affine.pro.utils.dp2px
import com.getcapacitor.BridgeActivity
import com.google.android.material.floatingactionbutton.FloatingActionButton
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject


@AndroidEntryPoint
class MainActivity : BridgeActivity(), AIButtonPlugin.Callback, AFFiNEThemePlugin.Callback,
    View.OnClickListener {

    @Inject
    lateinit var webService: WebService

    @Inject
    lateinit var sseService: SSEService

    @Inject
    lateinit var graphQLService: GraphQLService

    init {
        registerPlugins(
            listOf(
                AFFiNEThemePlugin::class.java,
                AIButtonPlugin::class.java,
                AuthPlugin::class.java,
                HashCashPlugin::class.java,
                NbStorePlugin::class.java,
            )
        )
    }

    private val fab: FloatingActionButton by lazy {
        FloatingActionButton(this).apply {
            visibility = View.GONE
            layoutParams = CoordinatorLayout.LayoutParams(dp2px(52), dp2px(52)).apply {
                gravity = Gravity.END or Gravity.BOTTOM
                updateMargins(0, 0, dp2px(24), dp2px(86))
            }
            customSize = dp2px(52)
            setImageResource(R.drawable.ic_ai)
            setImageDrawable(
                VectorDrawableCompat.create(resources, R.drawable.ic_ai, theme)?.apply {
                    DrawableCompat.setTint(
                        this,
                        ContextCompat.getColor(context, R.color.affine_primary)
                    )
                })
            setOnClickListener(this@MainActivity)
            val parent = bridge.webView.parent as CoordinatorLayout
            parent.addView(this)
        }
    }

    private var navHeight = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { v, insets ->
            navHeight = px2dp(insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom)
            ViewCompat.onApplyWindowInsets(v, insets)
        }
    }

    override fun load() {
        super.load()
        AuthInitializer.initialize(bridge)
        bridge.webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    }

    override fun present() {
        lifecycleScope.launch {
            fab.show()
        }
    }

    override fun dismiss() {
        lifecycleScope.launch {
            fab.hide()
        }
    }

    override fun onThemeChanged(darkMode: Boolean) {
        lifecycleScope.launch {
            fab.backgroundTintList = ColorStateList.valueOf(
                ContextCompat.getColor(
                    this@MainActivity,
                    if (darkMode) {
                        R.color.layer_background_primary_dark
                    } else {
                        R.color.layer_background_primary
                    }
                )
            )
        }
    }

    override fun getSystemNavBarHeight(): Int {
        return navHeight
    }

    override fun onClick(v: View) {
        lifecycleScope.launch {
            webService.update(bridge)
            sseService.updateServer(bridge)
            graphQLService.updateServer(bridge)
            AIActivity.open(this@MainActivity)
        }
    }

}
