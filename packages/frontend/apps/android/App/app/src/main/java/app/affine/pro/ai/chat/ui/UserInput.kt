package app.affine.pro.ai.chat.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import app.affine.pro.R
import app.affine.pro.components.AFFiNEIconButton
import app.affine.pro.theme.AFFiNETheme
import app.affine.pro.theme.ThemeMode

enum class InputSelector {
    NONE,
    CAMERA,
    PICTURE
}

@Preview
@Composable
fun UserInputPreview() {
    AFFiNETheme(ThemeMode.Dark) {
        UserInput(onMessageSent = {})
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun UserInput(
    modifier: Modifier = Modifier,
    onMessageSent: (String) -> Unit,
    sendMessageEnabled: Boolean = true,
    resetScroll: () -> Unit = {},
) {
    var currentInputSelector by rememberSaveable { mutableStateOf(InputSelector.NONE) }
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val dismissKeyboard = {
        currentInputSelector = InputSelector.NONE
        keyboardController?.hide()
        focusManager.clearFocus()
    }

    if (currentInputSelector != InputSelector.NONE) {
        BackHandler(onBack = { dismissKeyboard() })
    }

    var textState by rememberSaveable(stateSaver = TextFieldValue.Saver) {
        mutableStateOf(TextFieldValue())
    }

    var textFieldFocusState by remember { mutableStateOf(false) }

    Surface(
        tonalElevation = 2.dp,
        shadowElevation = 2.dp,
        shape = RoundedCornerShape(16.dp, 16.dp, 0.dp, 0.dp),
        color = AFFiNETheme.colors.backgroundOverlayPanel,
    ) {
        Column(modifier = modifier) {
            UserInputText(
                textFieldValue = textState,
                onTextChanged = { textState = it },
                keyboardShown = currentInputSelector == InputSelector.NONE && textFieldFocusState,
                onTextFieldFocused = { focused ->
                    if (focused) {
                        currentInputSelector = InputSelector.NONE
                        resetScroll()
                    }
                    textFieldFocusState = focused
                },
                onMessageSent = {
                    onMessageSent(textState.text)
                    textState = TextFieldValue()
                },
                focusState = textFieldFocusState
            )
            UserInputSelector(
                onSelectorChange = { currentInputSelector = it },
                sendMessageEnabled = textState.text.isNotBlank() && sendMessageEnabled,
                onMessageSent = {
                    onMessageSent(textState.text)
                    textState = TextFieldValue()
                    dismissKeyboard()
                },
            )
        }
    }
}

@Composable
private fun UserInputSelector(
    onSelectorChange: (InputSelector) -> Unit,
    sendMessageEnabled: Boolean,
    onMessageSent: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .wrapContentHeight()
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AFFiNEIconButton(
            R.drawable.ic_camera,
            onClick = { onSelectorChange(InputSelector.CAMERA) },
        )

        Spacer(modifier = Modifier.width(14.dp))

        AFFiNEIconButton(
            R.drawable.ic_image,
            onClick = { onSelectorChange(InputSelector.PICTURE) },
        )

        Spacer(modifier = Modifier.weight(1f))

        // Send button
        AFFiNEIconButton(
            R.drawable.ic_send,
            enabled = sendMessageEnabled,
            onClick = onMessageSent,
        )
    }
}

val KeyboardShownKey = SemanticsPropertyKey<Boolean>("KeyboardShownKey")
var SemanticsPropertyReceiver.keyboardShownProperty by KeyboardShownKey

@ExperimentalFoundationApi
@Composable
private fun UserInputText(
    keyboardType: KeyboardType = KeyboardType.Text,
    onTextChanged: (TextFieldValue) -> Unit,
    textFieldValue: TextFieldValue,
    keyboardShown: Boolean,
    onTextFieldFocused: (Boolean) -> Unit,
    onMessageSent: (String) -> Unit,
    focusState: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(66.dp),
        horizontalArrangement = Arrangement.End
    ) {

        Box(Modifier.fillMaxSize()) {
            UserInputTextField(
                textFieldValue,
                onTextChanged,
                onTextFieldFocused,
                keyboardType,
                focusState,
                onMessageSent,
                Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Text Input"
                        keyboardShownProperty = keyboardShown
                    }
            )
        }
    }
}

@Composable
private fun BoxScope.UserInputTextField(
    textFieldValue: TextFieldValue,
    onTextChanged: (TextFieldValue) -> Unit,
    onTextFieldFocused: (Boolean) -> Unit,
    keyboardType: KeyboardType,
    focusState: Boolean,
    onMessageSent: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var lastFocusState by remember { mutableStateOf(false) }
    val color = AFFiNETheme.colors.textPrimary
    BasicTextField(
        value = textFieldValue,
        onValueChange = { onTextChanged(it) },
        modifier = modifier
            .padding(start = 10.dp, end = 10.dp, top = 10.dp)
            .align(Alignment.CenterStart)
            .onFocusChanged { state ->
                if (lastFocusState != state.isFocused) {
                    onTextFieldFocused(state.isFocused)
                }
                lastFocusState = state.isFocused
            },
        keyboardOptions = KeyboardOptions(
            keyboardType = keyboardType,
            imeAction = ImeAction.Send
        ),
        keyboardActions = KeyboardActions {
            if (textFieldValue.text.isNotBlank()) onMessageSent(textFieldValue.text)
        },
        cursorBrush = SolidColor(color),
        textStyle = MaterialTheme.typography.bodyMedium.copy(color = color),
    )

    if (textFieldValue.text.isEmpty() && !focusState) {
        Text(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 10.dp, end = 10.dp, top = 10.dp),
            text = "Feel free to input any text and see how AI responds. Give it a go!",
            color = color
        )
    }
}
