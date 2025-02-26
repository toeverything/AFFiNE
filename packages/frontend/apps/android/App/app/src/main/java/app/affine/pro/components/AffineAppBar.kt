package app.affine.pro.components

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import app.affine.pro.theme.AffineTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AffineAppBar(
    modifier: Modifier = Modifier,
    scrollBehavior: TopAppBarScrollBehavior? = null,
    onNavIconPressed: () -> Unit = { },
    title: @Composable () -> Unit,
    actions: @Composable RowScope.() -> Unit = {}
) {
    CenterAlignedTopAppBar(
        modifier = modifier,
        actions = actions,
        title = title,
        scrollBehavior = scrollBehavior,
        navigationIcon = {
            IconButton(
                onClick = onNavIconPressed
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Default.ArrowBack,
                    contentDescription = "Back",
                    tint = Color.White
                )
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview
@Composable
fun AffineAppBarPreview() {
    AffineTheme {
        AffineAppBar(title = { Text("Preview!") })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview
@Composable
fun AffineAppBarPreviewDark() {
    AffineTheme(isDarkTheme = true) {
        AffineAppBar(title = { Text("Preview!") })
    }
}