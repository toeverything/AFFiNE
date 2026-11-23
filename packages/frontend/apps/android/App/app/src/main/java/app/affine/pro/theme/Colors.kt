package app.affine.pro.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

@Immutable
data class AFFiNEColorScheme(
    val textPrimary: Color,
    val textSecondary: Color,
    val textDisable: Color,
    val textEmphasis: Color,
    val backgroundPrimary: Color,
    val backgroundSecondary: Color,
    val backgroundOverlayPanel: Color,
    val backgroundTertiary: Color,
    val backgroundCodeBlock: Color,
    val backgroundModal: Color,
    val backgroundSuccess: Color,
    val backgroundError: Color,
    val backgroundWarning: Color,
    val backgroundProgressing: Color,
    val iconPrimary: Color,
    val iconSecondary: Color,
    val iconTertiary: Color,
    val iconDisable: Color,
    val iconActivated: Color,
    val divider: Color,
)

val affineLightScheme = AFFiNEColorScheme(
    textPrimary = AFFiNEColorTokens.Grey900,
    textSecondary = AFFiNEColorTokens.Grey600,
    textDisable = AFFiNEColorTokens.Grey400,
    textEmphasis = AFFiNEColorTokens.AFFiNE600,
    backgroundPrimary = AFFiNEColorTokens.BaseWhite,
    backgroundSecondary = AFFiNEColorTokens.Grey100,
    backgroundOverlayPanel = AFFiNEColorTokens.Grey50,
    backgroundTertiary = AFFiNEColorTokens.Grey300,
    backgroundCodeBlock = AFFiNEColorTokens.Grey50,
    backgroundModal = AFFiNEColorTokens.TransparentBlack700,
    backgroundSuccess = AFFiNEColorTokens.Emerald50,
    backgroundError = AFFiNEColorTokens.Rose50,
    backgroundWarning = AFFiNEColorTokens.Orange25,
    backgroundProgressing = AFFiNEColorTokens.Indigo50,
    iconPrimary = AFFiNEColorTokens.Grey600,
    iconSecondary = AFFiNEColorTokens.Grey400,
    iconTertiary = AFFiNEColorTokens.Grey300,
    iconDisable = AFFiNEColorTokens.Grey400,
    iconActivated = AFFiNEColorTokens.AFFiNE600,
    divider = AFFiNEColorTokens.TransparentGrey400,
)

val affineDarkScheme = AFFiNEColorScheme(
    textPrimary = AFFiNEColorTokens.Grey200,
    textSecondary = AFFiNEColorTokens.Grey500,
    textDisable = AFFiNEColorTokens.Grey700,
    textEmphasis = AFFiNEColorTokens.AFFiNE500,
    backgroundPrimary = AFFiNEColorTokens.Grey950,
    backgroundSecondary = AFFiNEColorTokens.Grey900,
    backgroundOverlayPanel = AFFiNEColorTokens.Grey900,
    backgroundTertiary = AFFiNEColorTokens.Grey700,
    backgroundCodeBlock = AFFiNEColorTokens.Grey900,
    backgroundModal = AFFiNEColorTokens.TransparentBlack400,
    backgroundSuccess = AFFiNEColorTokens.Emerald950,
    backgroundError = AFFiNEColorTokens.Rose950,
    backgroundWarning = AFFiNEColorTokens.Orange950,
    backgroundProgressing = AFFiNEColorTokens.Indigo950,
    iconPrimary = AFFiNEColorTokens.Grey100,
    iconSecondary = AFFiNEColorTokens.Grey300,
    iconTertiary = AFFiNEColorTokens.Grey700,
    iconDisable = AFFiNEColorTokens.Grey800,
    iconActivated = AFFiNEColorTokens.AFFiNE600,
    divider = AFFiNEColorTokens.TransparentGrey300,
)

val LocalAFFiNEColors = staticCompositionLocalOf { affineLightScheme }

object AFFiNEColorTokens {
    val BaseWhite = Color(0XFFFFFFFF)
    val BaseBlack = Color(0XFF000000)

    val Grey25 = Color(0XFFF9F9F9)
    val Grey50 = Color(0XFFF5F5F5)
    val Grey100 = Color(0XFFF3F3F3)
    val Grey200 = Color(0XFFE6E6E6)
    val Grey300 = Color(0XFFCDCDCD)
    val Grey400 = Color(0XFFB3B3B3)
    val Grey500 = Color(0XFF929292)
    val Grey600 = Color(0XFF7A7A7A)
    val Grey700 = Color(0XFF565656)
    val Grey800 = Color(0XFF414141)
    val Grey900 = Color(0XFF252525)
    val Grey950 = Color(0XFF141414)

    val Red25 = Color(0XFFFFF4F5)
    val Red50 = Color(0XFFFCE5E6)
    val Red100 = Color(0XFFFFD1D1)
    val Red200 = Color(0XFFFBB7B7)
    val Red300 = Color(0XFFFF9A9A)
    val Red400 = Color(0XFFFC7979)
    val Red500 = Color(0XFFF45252)
    val Red600 = Color(0XFFED3F3F)
    val Red700 = Color(0XFFC83030)
    val Red800 = Color(0XFF9F2D2D)
    val Red900 = Color(0XFF761717)
    val Red950 = Color(0XFF460606)

    val Orange25 = Color(0XFFFFF7EE)
    val Orange50 = Color(0XFFFFEBD5)
    val Orange100 = Color(0XFFFFDDB5)
    val Orange200 = Color(0XFFFFD3AB)
    val Orange300 = Color(0XFFFFC58F)
    val Orange400 = Color(0XFFFFB978)
    val Orange500 = Color(0XFFFFAD63)
    val Orange600 = Color(0XFFFF8C39)
    val Orange700 = Color(0XFFF37C26)
    val Orange800 = Color(0XFFC96317)
    val Orange900 = Color(0XFFA65113)
    val Orange950 = Color(0XFF843A06)
    
    val Amber25 = Color(0XFFFDFCF4)
    val Amber50 = Color(0XFFFFFBEB)
    val Amber100 = Color(0XFFFEF3C7)
    val Amber200 = Color(0XFFFCE68A)
    val Amber300 = Color(0XFFFCD34D)
    val Amber400 = Color(0XFFFABF24)
    val Amber500 = Color(0XFFF59E0A)
    val Amber600 = Color(0XFFD97705)
    val Amber700 = Color(0XFFB55309)
    val Amber800 = Color(0XFF92400F)
    val Amber900 = Color(0XFF78350F)
    val Amber950 = Color(0XFF461A02)
    
    val Yellow25 = Color(0XFFFFFAEC)
    val Yellow50 = Color(0XFFFBF3D8)
    val Yellow100 = Color(0XFFFFEFB6)
    val Yellow200 = Color(0XFFFFE898)
    val Yellow300 = Color(0XFFFEE483)
    val Yellow400 = Color(0XFFFFDE6B)
    val Yellow500 = Color(0XFFFEDC61)
    val Yellow600 = Color(0XFFFFD337)
    val Yellow700 = Color(0XFFE0AA00)
    val Yellow800 = Color(0XFFAC7400)
    val Yellow900 = Color(0XFF704200)
    val Yellow950 = Color(0XFF321A04)
    
    val Lime25 = Color(0XFFFBFEF1)
    val Lime50 = Color(0XFFF9FEE7)
    val Lime100 = Color(0XFFF0FCCB)
    val Lime200 = Color(0XFFE0F99D)
    val Lime300 = Color(0XFFC9F263)
    val Lime400 = Color(0XFFB2E634)
    val Lime500 = Color(0XFF92CC16)
    val Lime600 = Color(0XFF72A10E)
    val Lime700 = Color(0XFF577C0E)
    val Lime800 = Color(0XFF466213)
    val Lime900 = Color(0XFF3B5314)
    val Lime950 = Color(0XFF1A2E06)
    
    val Green25 = Color(0XFFEFFFEC)
    val Green50 = Color(0XFFDCFDD7)
    val Green100 = Color(0XFFC9F8C1)
    val Green200 = Color(0XFFB8F0AF)
    val Green300 = Color(0XFFA8E79C)
    val Green400 = Color(0XFF9CDA91)
    val Green500 = Color(0XFF91CE87)
    val Green600 = Color(0XFF7CC270)
    val Green700 = Color(0XFF64BA56)
    val Green800 = Color(0XFF439036)
    val Green900 = Color(0XFF225C18)
    val Green950 = Color(0XFF10340A)
    
    val Emerald25 = Color(0XFFEDFDF5)
    val Emerald50 = Color(0XFFF1FDF4)
    val Emerald100 = Color(0XFFDDFAE3)
    val Emerald200 = Color(0XFFBEF3CC)
    val Emerald300 = Color(0XFF9DE6B4)
    val Emerald400 = Color(0XFF7FD295)
    val Emerald500 = Color(0XFF69B87D)
    val Emerald600 = Color(0XFF539566)
    val Emerald700 = Color(0XFF447756)
    val Emerald800 = Color(0XFF375F46)
    val Emerald900 = Color(0XFF2E4F3C)
    val Emerald950 = Color(0XFF1D3027)
    
    val Teal25 = Color(0XFFEFFFFD)
    val Teal50 = Color(0XFFE1FDF9)
    val Teal100 = Color(0XFFD7FBF6)
    val Teal200 = Color(0XFFC6F8F2)
    val Teal300 = Color(0XFFB5F5EE)
    val Teal400 = Color(0XFFA7F1E9)
    val Teal500 = Color(0XFF8AE7DD)
    val Teal600 = Color(0XFF7AE1D5)
    val Teal700 = Color(0XFF5CC7BA)
    val Teal800 = Color(0XFF448E86)
    val Teal900 = Color(0XFF1C6B63)
    val Teal950 = Color(0XFF0E4841)
    
    val Blue25 = Color(0XFFF0F9FF)
    val Blue50 = Color(0XFFE6F5FF)
    val Blue100 = Color(0XFFDAF0FF)
    val Blue200 = Color(0XFFCEECFF)
    val Blue300 = Color(0XFFBAE4FF)
    val Blue400 = Color(0XFFAADEFF)
    val Blue500 = Color(0XFFA0D9FF)
    val Blue600 = Color(0XFF84CFFF)
    val Blue700 = Color(0XFF53B2EF)
    val Blue800 = Color(0XFF2F94D5)
    val Blue900 = Color(0XFF1C70A5)
    val Blue950 = Color(0XFF004B7B)
    
    val AFFiNE25 = Color(0XFFE2F4FF)
    val AFFiNE50 = Color(0XFFCAE9FF)
    val AFFiNE100 = Color(0XFF8FD1FF)
    val AFFiNE200 = Color(0XFF79C8FF)
    val AFFiNE300 = Color(0XFF5EBCFF)
    val AFFiNE400 = Color(0XFF49B1FA)
    val AFFiNE500 = Color(0XFF29A2FA)
    val AFFiNE600 = Color(0XFF1D96EB)
    val AFFiNE700 = Color(0XFF158ADE)
    val AFFiNE800 = Color(0XFF035F9F)
    val AFFiNE900 = Color(0XFF003C67)
    val AFFiNE950 = Color(0XFF002742)
    
    val Indigo25 = Color(0XFFF5F7FF)
    val Indigo50 = Color(0XFFEEF2FF)
    val Indigo100 = Color(0XFFE0E7FF)
    val Indigo200 = Color(0XFFC7D2FE)
    val Indigo300 = Color(0XFFA5B4FC)
    val Indigo400 = Color(0XFF818CF8)
    val Indigo500 = Color(0XFF6366F1)
    val Indigo600 = Color(0XFF4F46E5)
    val Indigo700 = Color(0XFF4338CA)
    val Indigo800 = Color(0XFF3730A3)
    val Indigo900 = Color(0XFF312E81)
    val Indigo950 = Color(0XFF1E1B4B)

    val Violet25 = Color(0XFFF9F7FF)
    val Violet50 = Color(0XFFF5F3FF)
    val Violet100 = Color(0XFFEDE9FE)
    val Violet200 = Color(0XFFDDD6FE)
    val Violet300 = Color(0XFFC5B5FD)
    val Violet400 = Color(0XFFA78BFA)
    val Violet500 = Color(0XFF8B5CF6)
    val Violet600 = Color(0XFF7C3AED)
    val Violet700 = Color(0XFF6E28D9)
    val Violet800 = Color(0XFF5A21B6)
    val Violet900 = Color(0XFF4B1E95)
    val Violet950 = Color(0XFF2E1065)
    
    val Purple25 = Color(0XFFF0ECFF)
    val Purple50 = Color(0XFFDED6FF)
    val Purple100 = Color(0XFFCBBEFF)
    val Purple200 = Color(0XFFB5A5EF)
    val Purple300 = Color(0XFFA593F3)
    val Purple400 = Color(0XFF9681EF)
    val Purple500 = Color(0XFF846CE9)
    val Purple600 = Color(0XFF6E52DF)
    val Purple700 = Color(0XFF5739D1)
    val Purple800 = Color(0XFF4A2EBC)
    val Purple900 = Color(0XFF321994)
    val Purple950 = Color(0XFF25136D)
    
    val Fuchsia25 = Color(0XFFFEFAFF)
    val Fuchsia50 = Color(0XFFFCF4FF)
    val Fuchsia100 = Color(0XFFFAE8FF)
    val Fuchsia200 = Color(0XFFF5D0FE)
    val Fuchsia300 = Color(0XFFF0AAFC)
    val Fuchsia400 = Color(0XFFE879F9)
    val Fuchsia500 = Color(0XFFD946EF)
    val Fuchsia600 = Color(0XFFC025D3)
    val Fuchsia700 = Color(0XFFA21EAF)
    val Fuchsia800 = Color(0XFF86198F)
    val Fuchsia900 = Color(0XFF701A75)
    val Fuchsia950 = Color(0XFF4A044E)

    val Magenta25 = Color(0XFFFFECF6)
    val Magenta50 = Color(0XFFFFDAED)
    val Magenta100 = Color(0XFFFFC0E0)
    val Magenta200 = Color(0XFFFCA2D0)
    val Magenta300 = Color(0XFFF58EC3)
    val Magenta400 = Color(0XFFF37FBA)
    val Magenta500 = Color(0XFFE96CAA)
    val Magenta600 = Color(0XFFE660A4)
    val Magenta700 = Color(0XFFCC4187)
    val Magenta800 = Color(0XFFBA2B72)
    val Magenta900 = Color(0XFFA91E65)
    val Magenta950 = Color(0XFF89124F)
    
    val Rose25 = Color(0XFFFFFAFA)
    val Rose50 = Color(0XFFFFF1F1)
    val Rose100 = Color(0XFFFEE4E5)
    val Rose200 = Color(0XFFFECDD1)
    val Rose300 = Color(0XFFFDA2AB)
    val Rose400 = Color(0XFFFB7181)
    val Rose500 = Color(0XFFF43F48)
    val Rose600 = Color(0XFFE11E41)
    val Rose700 = Color(0XFFBE1237)
    val Rose800 = Color(0XFF9F1235)
    val Rose900 = Color(0XFF881331)
    val Rose950 = Color(0XFF4D051A)

    val TransparentWhite25 = Color(0XFFFFFFFF).copy(alpha = 0.03f)
    val TransparentWhite50 = Color(0XFFFFFFFF).copy(alpha = 0.05f)
    val TransparentWhite100 = Color(0XFFFFFFFF).copy(alpha = 0.09f)
    val TransparentWhite200 = Color(0XFFFFFFFF).copy(alpha = 0.13f)
    val TransparentWhite300 = Color(0XFFFFFFFF).copy(alpha = 0.17f)
    val TransparentWhite400 = Color(0XFFFFFFFF).copy(alpha = 0.23f)
    val TransparentWhite500 = Color(0XFFFFFFFF).copy(alpha = 0.56f)
    val TransparentWhite600 = Color(0XFFFFFFFF).copy(alpha = 0.67f)
    val TransparentWhite700 = Color(0XFFFFFFFF).copy(alpha = 0.72f)
    val TransparentWhite800 = Color(0XFFFFFFFF).copy(alpha = 0.82f)
    val TransparentWhite900 = Color(0XFFFFFFFF).copy(alpha = 0.90f)
    val TransparentWhite950 = Color(0XFFFFFFFF).copy(alpha = 0.98f)

    val TransparentBlack25 = Color(0XFF000000).copy(alpha = 0.03f)
    val TransparentBlack50 = Color(0XFF000000).copy(alpha = 0.05f)
    val TransparentBlack100 = Color(0XFF000000).copy(alpha = 0.07f)
    val TransparentBlack200 = Color(0XFF000000).copy(alpha = 0.10f)
    val TransparentBlack300 = Color(0XFF000000).copy(alpha = 0.17f)
    val TransparentBlack400 = Color(0XFF000000).copy(alpha = 0.22f)
    val TransparentBlack500 = Color(0XFF000000).copy(alpha = 0.52f)
    val TransparentBlack600 = Color(0XFF000000).copy(alpha = 0.65f)
    val TransparentBlack700 = Color(0XFF000000).copy(alpha = 0.70f)
    val TransparentBlack800 = Color(0XFF000000).copy(alpha = 0.80f)
    val TransparentBlack900 = Color(0XFF000000).copy(alpha = 0.90f)
    val TransparentBlack950 = Color(0XFF000000).copy(alpha = 0.95f)
    
    val TransparentGrey25 = Color(0XFF929292).copy(alpha = 0.03f)
    val TransparentGrey50 = Color(0XFF929292).copy(alpha = 0.05f)
    val TransparentGrey100 = Color(0XFF929292).copy(alpha = 0.07f)
    val TransparentGrey200 = Color(0XFF929292).copy(alpha = 0.10f)
    val TransparentGrey300 = Color(0XFF929292).copy(alpha = 0.17f)
    val TransparentGrey400 = Color(0XFF929292).copy(alpha = 0.22f)
    val TransparentGrey500 = Color(0XFF929292).copy(alpha = 0.52f)
    val TransparentGrey600 = Color(0XFF929292).copy(alpha = 0.65f)
    val TransparentGrey700 = Color(0XFF929292).copy(alpha = 0.70f)
    val TransparentGrey800 = Color(0XFF929292).copy(alpha = 0.80f)
    val TransparentGrey900 = Color(0XFF929292).copy(alpha = 0.90f)
    val TransparentGrey950 = Color(0XFF929292).copy(alpha = 0.95f)
    

}