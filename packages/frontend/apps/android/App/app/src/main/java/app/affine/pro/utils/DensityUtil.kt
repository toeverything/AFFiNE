package app.affine.pro.utils

import android.content.Context
import android.util.TypedValue

fun Context.dp(dp: Int) = TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_DIP,
    dp.toFloat(),
    resources.displayMetrics
).toInt()