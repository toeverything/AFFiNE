package app.affine.pro.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable

object AFFiNETheme {
    val colors: AFFiNEColorScheme
        @ReadOnlyComposable
        @Composable
        get() = LocalAFFiNEColors.current

    val typography: AFFiNETypography
        @ReadOnlyComposable
        @Composable
        get() = LocalAFFiNETypography.current
}

@Composable
fun AFFiNETheme(
    mode: ThemeMode = ThemeMode.System,
    content: @Composable () -> Unit
) {
    val colors = when (mode) {
        ThemeMode.Light -> affineLightScheme
        ThemeMode.Dark -> affineDarkScheme
        ThemeMode.System -> if (isSystemInDarkTheme()) affineDarkScheme else affineLightScheme
    }

    CompositionLocalProvider(LocalAFFiNEColors provides colors) {
        MaterialTheme {
            content()
        }
    }
}

enum class ThemeMode(name: String) {
    Light("light"),
    Dark("dark"),
    System("system");

    fun of(name: String) = when (name) {
        "light" -> Light
        "dark" -> Dark
        else -> System
    }
}