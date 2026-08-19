# Android IME 修复说明（#15243）

## 背景

Android 端的 AFFiNE 是 Capacitor WebView 承载的 Web 编辑器。部分 Android 输入法（如三星键盘、Gboard、HeliBoard、AOSP，以及部分国产输入法的英文联想/拼写检查模式）会通过 IME composition 反复改写当前单词。

在 BlockSuite 编辑器里，这类 composition 事件如果只停留在 DOM 层，或者被 WebView/native 层重复回放，就会造成正文模型和屏幕 DOM 不一致。

## 已观察到的问题

- 输入单词后按空格，旧的候选词可能被再次插入，而不是只输入空格。
- 点击键盘候选词后，单词有时显示出来但没有进入模型，关闭重开后消失。
- 删除带下划线的候选/拼写检查单词时，删除键可能只删除 IME 的 composing buffer，没有删除真正正文。
- 删除到最后一个字符时，输入法会反复把该字符设置成 composing region，导致永远删不掉。
- 在文字中间点光标时，输入法可能 replay 旧候选内容，造成意外插入。
- Enter/换行、Backspace、Space 在 Android 上可能进入不同的 `beforeinput`/`composition`/`InputConnection` 路径，表现不稳定。

## 根因

核心问题不是某一个键盘本身，而是 Android IME 与 WebView contenteditable 编辑器之间的协议差异：

1. 输入法会用 `setComposingText`、`setComposingRegion`、`finishComposingText`、`commitText` 表示“候选词正在编辑/替换/提交”。
2. Web 编辑器依赖 `beforeinput`、`compositionstart/update/end` 把变更写入 BlockSuite model。
3. 某些输入法会在删除、空格、候选词点击之后 replay 当前单词或整段 inline text。
4. 如果 WebView 默认 InputConnection 直接把这些 replay 写到 DOM，就会出现“屏幕看起来有，但模型没有”或者“重复插入”的问题。
5. 删除时 Web 层会要求 native 清理 composing session，并触发 `restartInput`；因此删除意图不能只保存在单个 `InputConnection` 实例里，否则重建连接后状态会丢失。

## 修复方案

### 1. Android native 层接管编辑器 WebView 的 InputConnection

新增 `AffineEditorWebView`，通过自定义 layout 让 Capacitor 使用该 WebView。

该 WebView 包装系统 `InputConnection`，把 Android IME 的 composing 行为转换成更稳定的编辑器操作：

- `setComposingText` 不再直接让 WebView 原生 DOM 随意改写，而是按当前 composing text 做 diff。
- `setComposingRegion` 只记录输入法标记的现有正文范围，避免直接生成 DOM-only text。
- 候选词替换时，如果新文本与 external region 有共同前缀且更长，则按“候选替换”处理。
- 删除时，如果输入法只是缩短 composing replay，则把缩短量映射成真实 `deleteSurroundingText`。
- 删除到最后一个字符时，如果输入法对 external composing region 发空 `commitText`，并且最近确实有删除意图，则把它转换成真实删除。
- Backspace/Forward Delete 通过 synthetic `beforeinput` 派发到 Web 编辑器，让 BlockSuite 走自己的删除模型逻辑。

删除意图记录在 WebView 级别的共享 `AndroidIMEState`，而不是单个 `InputConnection`，以便跨 `restartInput` 保留删除链路。

### 2. Web 层在关键输入后主动结束 Android composing session

BlockSuite inline event service 在 Android 上处理以下输入后通知 native 清理 IME composition：

- `deleteContentBackward`
- `insertParagraph`
- `insertLineBreak`
- 空格或换行的 `insertText`
- `compositionend`

这样可以减少输入法在下一个操作里继续 replay 上一个候选词。

### 3. Android 上禁用外层 page root 的 contenteditable

Android IME 有时会把外层 page root 当作编辑目标，导致文本落到 DOM 而不是 block inline editor model。

因此 Android 上只保留真正的 block/inline editor 可编辑，避免外层 root 接收 IME 文本。

### 4. Android beforeinput 补齐 Enter/Backspace 映射

Android WebView 中部分键不会稳定产生 `keydown`，但会产生 `beforeinput`。

因此补齐：

- `deleteContentBackward` -> `Backspace`
- `insertParagraph` -> `Enter`

让 BlockSuite 原有 keymap 能继续处理块级删除、换行等行为。

### 5. 限制 markdown prefix 扫描范围

`getPrefixText` 限制最多向前扫描 512 字符，避免长文档或输入法 replay 大段文本时触发过大的同步扫描。

## 影响范围

- native `AffineEditorWebView` 只在 Android app 中生效。
- Web 层清理 composing session 的桥接调用带 `IS_ANDROID` 判断，只会在 Android 环境调用。
- page root 禁用外层 `contenteditable` 也只在 Android 生效。
- keymap 的 Android beforeinput patch 只处理 Android 输入路径，不改变桌面端常规 `keydown` 路径。
- 插入图片、工具栏按钮、AI 按钮等非文本 IME 操作不通过这个 InputConnection 方案处理，预期不受影响。

## 验证过的场景

- 英文候选词点击后能进入正文模型。
- 候选词提交后按空格，不再重复插入旧候选词。
- 删除带下划线的候选/拼写检查单词时，不再无限恢复完整单词。
- 删除到最后一个字符时，能继续删除。
- 在文本中间点击光标，不应自动插入旧候选。
- Enter/Backspace/Space 在 Android 输入法下保持可用。

## 注意事项

不同输入法对 IME composition 协议的实现细节不同。当前方案不是按输入法品牌做白名单，而是按 Android IME 事件语义统一处理：

- 候选替换：识别 external composing region 与新候选文本的关系。
- 被动 replay：识别输入法把已有正文重新作为 composing text 发回来。
- 删除链路：识别删除意图后的 composing shrink / empty commit。

这样可以避免为每个输入法单独写规则。
