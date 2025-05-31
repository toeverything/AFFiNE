package app.affine.pro.utils

import android.content.Context
import android.util.TypedValue

fun Context.dp2px(dp: Int) = TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_DIP,
    dp.toFloat(),
    resources.displayMetrics
).toInt()

fun Context.px2dp(px: Int): Int {
    return (px / resources.displayMetrics.density).toInt()
}
