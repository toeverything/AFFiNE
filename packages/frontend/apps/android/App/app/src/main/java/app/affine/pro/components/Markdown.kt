package app.affine.pro.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.affine.pro.R
import app.affine.pro.theme.AFFiNETheme
import app.affine.pro.theme.ThemeMode
import com.halilibo.richtext.commonmark.Markdown
import com.halilibo.richtext.ui.BasicRichText
import com.halilibo.richtext.ui.BlockQuoteGutter
import com.halilibo.richtext.ui.CodeBlockStyle
import com.halilibo.richtext.ui.HeadingStyle
import com.halilibo.richtext.ui.ListStyle
import com.halilibo.richtext.ui.OrderedMarkers
import com.halilibo.richtext.ui.RichTextStyle
import com.halilibo.richtext.ui.RichTextThemeProvider
import com.halilibo.richtext.ui.TableStyle
import com.halilibo.richtext.ui.UnorderedMarkers
import com.halilibo.richtext.ui.string.RichTextStringStyle

private val LocalMarkdownTextStyle = staticCompositionLocalOf {
    TextStyle(
        fontSize = 16.sp,
        lineHeight = 21.sp,
        fontWeight = FontWeight.Normal,
    )
}

@Composable
fun Markdown(
    modifier: Modifier = Modifier,
    markdown: String,
) {
    RichTextThemeProvider(
        contentColorProvider = { AFFiNETheme.colors.textPrimary },
        textStyleProvider = { LocalMarkdownTextStyle.current },
        textStyleBackProvider = { textStyle, content ->
            CompositionLocalProvider(LocalMarkdownTextStyle provides textStyle, content)
        }
    ) {
        val dividerColor = AFFiNETheme.colors.divider
        BasicRichText(
            modifier = modifier,
            style = RichTextStyle(
                headingStyle = headingStyle,
                listStyle = listStyle,
                blockQuoteGutter = BlockQuoteGutter.BarGutter(
                    startMargin = 0.sp,
                    barWidth = 5.sp,
                    endMargin = 8.sp,
                    color = { dividerColor },
                ),
                codeBlockStyle = CodeBlockStyle(
                    textStyle = AFFiNETheme.typography.body.copy(
                        fontSize = 14.sp, fontFamily = FontFamily.Monospace
                    ),
                    modifier = Modifier
                        .fillMaxWidth(1f)
                        .background(
                            color = AFFiNETheme.colors.backgroundCodeBlock,
                            shape = RoundedCornerShape(8.dp),
                        ),
                    padding = 16.sp,
                    wordWrap = true,
                ),
                tableStyle = TableStyle(borderColor = dividerColor, borderStrokeWidth = 2.dp.value),
                stringStyle = RichTextStringStyle(
                    linkStyle = TextLinkStyles(
                        SpanStyle(color = AFFiNETheme.colors.textEmphasis),
                        SpanStyle(color = AFFiNETheme.colors.textEmphasis),
                        SpanStyle(color = AFFiNETheme.colors.textEmphasis),
                        SpanStyle(color = AFFiNETheme.colors.textEmphasis),
                    ),
                    codeStyle = SpanStyle(
                        fontSize = 13.sp,
                        baselineShift = BaselineShift(0.08f),
                        background = AFFiNETheme.colors.backgroundCodeBlock,
                    )
                )
            ),
        ) {
            Markdown(markdown)
        }
    }
}

private val headingStyle: HeadingStyle = { level, textStyle ->
    when (level) {
        0 -> TextStyle(
            fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.SemiBold
        )

        1 -> TextStyle(
            fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold
        )

        2 -> TextStyle(
            fontSize = 20.sp, lineHeight = 25.sp, fontWeight = FontWeight.SemiBold
        )

        3 -> TextStyle(
            fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold
        )

        4 -> TextStyle(
            fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold
        )

        else -> textStyle.copy(fontWeight = FontWeight.SemiBold)
    }
}

private val listStyle = ListStyle(orderedMarkers = {
    OrderedMarkers { _, index ->
        Text(
            "${index + 1}.",
            modifier = Modifier
                .width(24.dp)
                .padding(start = 4.dp),
            style = AFFiNETheme.typography.body,
            color = AFFiNETheme.colors.textEmphasis,
        )
    }
}, unorderedMarkers = {
    val markers = listOf(
        R.drawable.ic_bulleted_list_01,
        R.drawable.ic_bulleted_list_02,
        R.drawable.ic_bulleted_list_03,
        R.drawable.ic_bulleted_list_04,
    )
    UnorderedMarkers { level ->
        AFFiNEIcon(markers[level % markers.size], tint = AFFiNETheme.colors.textEmphasis)
    }
})

@Preview
@Composable
fun MarkdownPreview() {
    AFFiNETheme(mode = ThemeMode.Dark) {
        Markdown(
            markdown = """
        
        
        当然可以，大熊！下面是一个包含**所有常用 Markdown 格式**的示例内容，您可以直接复制到 AFFiNE 或其他支持 Markdown 的编辑器中体验效果：
        
        ---
        
        # 这是一级标题
        
        ## 这是二级标题
        
        ### 这是三级标题
        
        ---
        
        **加粗文本***斜体文本*~~删除线文本~~`行内代码`
        
        ---
        
        > 这是一个引用块，可以用来高亮重要信息。
        
        ---
        
        - 无序列表项 1
        - 无序列表项 2
          - 嵌套子项
            - 嵌套子项
                - 嵌套子项
          
        1. 有序列表项 1
            1. 有序列表项 1-1
            2. 有序列表项 1-2
        2. 有序列表项 2
        
        ---
        
        | 姓名   | 年龄 | 爱好     |
        | ------ | ---- | -------- |
        | 大熊   | 28   | 阅读     |
        | 阿芬   | ∞    | 帮助你   |
        
        ---
        
        ```kotlin
        // 这是一个 Kotlin 代码块
        fun main() {
            println(\"Hello, Markdown!\")
        }
        ```
        
        ---
        
        ![示例图片](https://affine.pro/_next/static/media/logo.1e7b6b7e.svg)
        
        ---
        
        [这是一个链接，点我访问 AFFiNE 官网](https://affine.pro)
        
        ---
        
        大熊，如果还想体验更多格式或者有特殊内容需求，随时告诉阿芬！
        
    """.trimIndent()
        )
    }
}