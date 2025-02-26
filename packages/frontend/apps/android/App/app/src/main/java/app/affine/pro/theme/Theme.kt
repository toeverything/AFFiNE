package app.affine.pro.theme

import android.annotation.SuppressLint
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

val AffineDarkColorScheme = darkColorScheme()
val AffineLightColorScheme = lightColorScheme()

@SuppressLint("NewApi")
@Composable
fun AffineTheme(
    isDarkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (isDarkTheme) AffineDarkColorScheme else AffineLightColorScheme,
        typography = AffineTypography,
        content = content
    )
}