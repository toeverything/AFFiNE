# iPad Pencil 输入能力完善 PRD

## 1. 背景

当前 iPad page 模式已经接入 `UIScribbleInteraction` 与 Web 侧 Scribble gate，用于让 Apple Pencil 随手写可以在 BlockSuite inline editor 区域启动。最新修复缓解了“输入一个字符后需要等待 2-3s 才能继续识别”的问题，但真机日志仍显示高概率漏识别：

- Native gate 已放行：`affine-scribble begin allow=true`
- Web 侧已尝试聚焦：`scribble.gate.focus {"focused":true}`
- PencilKit 仍失败：`inputElements: 0` / `nil target element`

这说明问题核心不是单纯命中区域不够大，而是 iPadOS Scribble 在识别开始时没有稳定拿到可用的文本输入目标。需要从“临时透明 textarea 代理”升级到可验证、可观测、可回滚的 Pencil 输入能力。

## 2. 当前已修复项

### 2.1 连续输入期间复用 Scribble 代理 textarea

此前 `syncScribbleProxyTextareas()` 每次都会删除并重建所有代理 textarea。由于 sync 会被 `input`、`beforeinput`、`selectionchange`、DOM mutation、定时轮询频繁触发，连续书写时系统可能刚准备查询输入元素，代理节点就被替换，导致 `inputElements: 0`。

本轮调整：

- 对同一个 inline editor 复用同一个代理 textarea。
- sync 时只更新代理位置和尺寸。
- 只移除已经不再对应有效 inline editor 的旧代理。
- 新增单测覆盖“重复 sync 仍是同一 textarea 节点”和“代理 input 可以转发文本”。

### 2.2 默认禁用曾导致 WKWebView 卡死的 native touch recognizer

此前 Swift 插件仍暴露 `start()`，任何误调用都会重新添加 `TouchClassifyingGestureRecognizer`。真机已经验证该 recognizer 会导致首个 Pencil stroke 后页面触摸和 Pencil 均不响应。

本轮调整：

- `PencilInput.start()` 默认返回 `value=false, disabled=true`。
- 只有显式传入 `allowUnsafeNativeRecognizer=true` 才允许启动。
- TypeScript 类型同步标记该入口为不安全能力。

### 2.3 收窄 UIScribbleInteraction 安装范围

此前 native 侧会把 `UIScribbleInteraction` 安装到 `WKWebView.scrollView.subviews` 的所有子视图，日志曾出现 `_UIScrollViewScrollIndicator`。

本轮调整：

- 子视图只允许安装到类名包含 `WKContentView` 的视图。
- 保留 WKWebView 自身安装。

## 3. 产品目标

### 3.1 主要目标

- Page 模式下，Apple Pencil 随手写可以连续输入文字。
- 输入一个字符进入文档后，用户立即书写下一个字符，不需要等待 2-3s。
- 上一个录入点左下方、右下方、下一行起笔均能稳定识别。
- Edgeless 模式下，Pencil 绘制、手指平移缩放、误触处理互不干扰。
- 功能必须具备可观测、可灰度、可回滚能力。

### 3.2 非目标

- 不自研手写 OCR。
- 不替换 iPadOS Scribble 识别引擎。
- 不在第一阶段实现复杂手势自定义识别。
- 不重新启用会冻结 WKWebView 的 native gesture recognizer。

## 4. 用户场景

### 4.1 Page 连续书写

用户在 page 文档正文中用 Apple Pencil 写入一个字符，字符进入文档后，马上在同一行后续位置或左下方继续写下一个字符。系统应继续识别并插入，而不是忽略 stroke。

### 4.2 Page 多 block 输入

用户在标题、正文、列表等多个文本 block 之间切换书写。系统应命中最近的可写 block，并将文本插入正确位置。

### 4.3 Edgeless 绘制与手指移动

用户用 Apple Pencil 绘制，同时用手指平移或缩放画布。系统应保持 Pencil 优先绘制，不把手掌误判为操作，也不阻塞手指移动。

### 4.4 Native input 输入

用户在搜索框、输入框、textarea 中使用 Scribble。系统应保持 iPadOS 原生行为，不被 AFFiNE 的 page/edgeless 路由干扰。

## 5. 功能需求

### 5.1 代码落点与模块边界

本能力必须沿用当前 AFFiNE / BlockSuite 的文本编辑分层，避免把文本模型写入逻辑放进 iOS plugin 或临时 DOM 代理中。

| 模块                      | 当前代码位置                                                                | 责任边界                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS Web bridge            | `packages/frontend/apps/ios/src/plugins/pencil-input/*`                     | 维护 Scribble gate、proxy lifecycle、Capacitor bridge 调用；只消费编辑器暴露的 target/insertion 能力，不直接改 BlockSuite 文本模型。                     |
| iOS native plugin         | `packages/frontend/apps/ios/App/App/Plugins/Pencil/PencilInputPlugin.swift` | 维护 `UIScribbleInteraction`，后续 spike `UIIndirectScribbleInteraction`；只做 native 坐标、item/rect、focus 请求桥接。                                  |
| Rich text adapter         | `blocksuite/affine/rich-text/src/*`                                         | 负责从 block model / block id 定位 `RichText` 与 `InlineEditor`，复用 `getInlineEditorByModel()`、`asyncGetRichText()` 等现有入口。                      |
| Inline core               | `blocksuite/framework/std/src/inline/*`                                     | 负责最终 `insertText`、`deleteText`、`setInlineRange`、composition、selection、undo/redo 语义；新增 Pencil 输入 API 应落在这一层或由这一层提供基础能力。 |
| Pointer routing           | `blocksuite/framework/std/src/event/control/pointer.ts`                     | 保持 Page Scribble 与 Edgeless pointer/drag/click/pan 事件隔离。                                                                                         |
| Runtime flags / telemetry | `packages/frontend/apps/ios/src/app.tsx`、BlockSuite `TelemetryProvider`    | 复用现有 `FeatureFlagService` 与 `TelemetryProvider`，不为 Pencil 单独新建一套配置或日志系统。                                                           |

### R1. Page Scribble 连续输入

- 支持 page inline editor 区域内连续 Scribble。
- 连续 30 个字符输入无丢字、无重复、无错误 block 插入。
- 字符进入文档后 300ms 内再次起笔，识别成功率 >= 99%，并记录从起笔到文本插入完成的 P95 延迟。
- 针对“上一录入点左下方”起笔场景必须有真机验收用例。

### R2. Scribble 目标区域服务

- Web 侧需要提供 editor-owned target service，建议命名为 `PencilScribbleTargetService`。
- 服务归属应优先放在 `blocksuite/affine/rich-text` 或 page/root 可访问 rich-text 的模块中；`packages/frontend/apps/ios/src/plugins/pencil-input/scribble-gate.ts` 只消费该服务输出。
- target service 返回：`targetId`、`blockId`、可写 rect、caret rect、block type、是否 focused、是否 composing、是否 readonly。
- block 到 editor 的定位必须优先复用 `getInlineEditorByModel(std, modelOrId)` / `asyncGetRichText(std, id)`；database block 等多 inline editor 特例必须显式标记 unsupported 或提供专门 adapter。
- rect 来源应优先来自 `InlineEditor.rootElement`、`InlineEditor.toDomRange()`、caret/native range 和 block component rect，而不是全局 DOM 扫描加固定 padding。
- rect 必须考虑滚动、viewport、safe area、WKWebView 坐标、页面缩放后的坐标转换。
- 第一阶段可以保留当前 DOM 扫描作为 fallback，但 fallback 命中必须进入 telemetry，并可通过 feature flag 关闭。

### R3. 正式文本插入 API

- 新增编辑器级 API：`insertTextFromPencilScribble(options)`，API 应落在 BlockSuite rich-text/inline 侧，而不是 iOS plugin 侧。
- options 至少包含：`text`、`targetId`、`caretHint`、`source="apple-pencil-scribble"`。
- `targetId` 解析到 `InlineEditor` 后，最终插入必须复用 `InlineEditor.insertText(inlineRange, text, attributes)` 和 `InlineEditor.setInlineRange()`；删除/替换场景复用 inline core 已有 `transformInput()` 语义。
- 禁止以 `textContent += text` 作为生产路径。
- `execCommand('insertText')` 只能作为临时 fallback，并必须有 telemetry 标记。
- 插入必须走 BlockSuite inline 正常事务、selection、undo/redo、composition 流程，行为应与 `beforeinput` -> `transformInput()` 的文本插入结果保持一致。
- 如果 `InlineEditor.isComposing` 为 true，Pencil 插入必须排队、拒绝并记录原因，或走 composition-safe 路径；不能直接改 DOM。

### R4. Native Scribble bridge v2

- 调研并优先验证 `UIIndirectScribbleInteraction`。
- Native 侧 spike 目标是验证能否按 item id 声明可写区域、请求 focus、把 native Scribble item 与 Web `targetId/blockId` 对齐，而不是依赖透明 textarea。
- 即使 `UIIndirectScribbleInteraction` 可用，文本模型写入仍必须回到 Web rich-text/inline API；Swift 不直接修改 BlockSuite 文本内容。
- 如果继续保留 textarea proxy，必须满足：
  - 代理节点稳定复用，不因 input/selectionchange 被重建。
  - 不阻断手指触摸、滚动、点击。
  - 有证据证明 PencilKit 能枚举到代理输入元素。
  - 可通过 feature flag 关闭。

### R5. 输入路由隔离

- Page 可写区的 Pencil stroke 不触发 block 拖拽、点击、框选。
- Edgeless 非文本工具下的 Pencil stroke 不进入 Scribble。
- Native input/textarea 保持系统默认。
- 手指 pan/zoom 不被 Scribble gate 阻塞。

### R6. 可观测性

每次 Scribble 尝试需要记录结构化事件。Web 侧优先复用 BlockSuite `TelemetryProvider`，iOS app 侧复用当前 telemetry transport；调试期可保留 `console.warn`，但进入 canary 前必须降级为结构化 telemetry 或受 debug flag 控制。

- `scribble_begin`: 坐标、rect 数量、是否 allowed。
- `scribble_target_resolved`: targetId、block type、距离、是否 focused。
- `scribble_text_inserted`: 文本长度、耗时、插入 API、是否 fallback。
- `scribble_failed`: 阶段、原因、是否出现 suspected `inputElements=0`。
- `scribble_proxy_state`: proxy 数量、是否复用、是否重建。

日志需要可按 session、docId、workspaceId 聚合，避免长期使用 `console.warn` 作为常驻噪音。

### R7. 灰度与回滚

- 新能力必须支持灰度和回滚，优先复用 AFFiNE 当前 `FeatureFlagService`。iOS app 当前已有通过 `frameworkProvider.get(FeatureFlagService)` 暴露 native 查询 flag 的模式，Pencil flags 应接入同一套机制。
- 至少分为：
  - `ios_pencil_scribble_gate`
  - `ios_pencil_scribble_proxy`
  - `ios_pencil_indirect_scribble`
  - `ios_pencil_native_touch_recognizer`
- `ios_pencil_native_touch_recognizer` 默认必须关闭。
- 如果远程 flag 尚未覆盖 iOS Pencil 场景，Phase 1 必须先补齐 flag 定义和读取路径，再扩大真机测试范围。

## 6. 验收标准

### 6.1 真机验收

测试设备：

- iPadOS 17 或以上。
- Apple Pencil 二代或 Apple Pencil Pro。
- Debug build 与 canary build 各跑一轮。

测试脚本：

1. 打开 page 文档。
2. 在正文 block 用 Pencil 连续写 30 个单字符。
3. 每个字符录入后立刻写下一个字符，不刻意等待。
4. 在上一录入点左下方连续起笔 10 次。
5. 在同一页面多个 block 间切换书写 10 次。
6. 切到 edgeless，用 Pencil 绘制并用手指平移缩放 2 分钟。
7. 回到 page，在搜索框或普通 input 中使用 Scribble。

通过标准：

- Page 连续输入成功率 P95 >= 99%。
- 左下方起笔场景 10/10 识别成功。
- 无 APP 卡死、无 WebContent 崩溃。
- 无重复字符、无丢字符、无插入到错误 block。
- Edgeless 绘制与手指 pan/zoom 正常。

### 6.2 自动化测试

- `scribble-gate.unit.spec.ts` 覆盖：
  - rect 收集。
  - sticky rect。
  - lower-left focus。
  - proxy 创建。
  - proxy 重复 sync 复用。
  - proxy input 转发。
  - dispose 后代理清理。
- `pencil-scribble-target.unit.spec.ts` 覆盖：
  - native input。
  - inline editor。
  - page root 非编辑目标。
  - Pencil pointer 旁路。
  - touch pointer 保持正常。
- 新增 rich-text/inline 侧测试覆盖：
  - `insertTextFromPencilScribble()` 通过 `InlineEditor.insertText()` 写入 Y.Text。
  - 插入后 `InlineEditor.setInlineRange()` 指向新文本末尾。
  - selection 不在目标 editor 时，按 `targetId/blockId` 定位正确 editor。
  - `InlineEditor.isComposing` 场景不会直接改 DOM。
  - undo/redo 能恢复 Pencil 插入前后的 inline range。

## 7. 里程碑

### Phase 0：稳定化与止血

- 复用 proxy textarea，避免连续输入期间频繁重建。
- 默认禁用 native touch recognizer。
- 收窄 ScribbleInteraction 安装范围。
- 增加 proxy lifecycle 单测。

状态：已完成首版实现，等待真机验证。

### Phase 1：编辑器正式输入 API

- 在 `blocksuite/affine/rich-text` 或 `blocksuite/framework/std/src/inline` 增加 `insertTextFromPencilScribble()`。
- API 内部通过 `getInlineEditorByModel()` / `InlineEditor.rootElement.inlineEditor` 定位 editor，并复用 `InlineEditor.insertText()`、`InlineEditor.setInlineRange()`。
- `packages/frontend/apps/ios/src/plugins/pencil-input/scribble-gate.ts` 从代理 input 回调调用该 API；iOS plugin 不直接写入文本模型。
- 移除生产路径中的 `textContent` fallback。
- 将 `execCommand` 降级为临时 fallback 并加 telemetry，待 Phase 2 完成后删除。
- 补齐 undo/redo、selection、composition 测试。

### Phase 2：Scribble target service

- 在 rich-text/page-root 侧提供 `PencilScribbleTargetService`，由编辑器维护可写 target 与 caret rect。
- target 发现复用 `getInlineEditorByModel()`、`asyncGetRichText()`、`InlineEditor.rootElement`、`InlineEditor.toDomRange()`。
- 替换当前固定 padding 策略。
- 支持多 block、滚动、缩放、safe area。
- 对 database block、多 inline editor block、readonly block 明确返回 unsupported 或专门 adapter。

### Phase 3：Native bridge v2

- 验证 `UIIndirectScribbleInteraction` 是否能在 `WKWebView`/`WKContentView` 容器中稳定解决 `inputElements: 0`。
- 验证范围限于 native item/rect/focus 与 Web `targetId/blockId` 对齐；文本写入仍回到 Phase 1 的 Web inline API。
- 若可行，替换 textarea proxy 的输入元素诱导职责。
- 若不可行，保留 proxy v2，但必须有明确枚举证据和 kill switch。

### Phase 4：灰度与稳定性

- 接入 AFFiNE `FeatureFlagService`，复用 iOS app 当前通过 `frameworkProvider.get(FeatureFlagService)` 暴露 native 查询 flag 的模式。
- 复用 BlockSuite `TelemetryProvider` 和 AFFiNE telemetry transport，加入结构化 telemetry dashboard。
- canary 灰度，按设备/iPadOS 版本观察失败率。
- 失败率达标后扩大范围。

## 8. 风险与开放问题

- WKWebView 内 contenteditable 与 PencilKit 的输入元素枚举机制不透明，透明 textarea 只能作为临时策略。
- `UIIndirectScribbleInteraction` 是否能在 Capacitor/WKWebView 容器里稳定提供 item/rect/focus 能力，需要单独 spike；不能假设 native 可直接接管 Web 文本输入。
- BlockSuite 当前已有 `InlineEditor.insertText()`、`setInlineRange()`、`transformInput()` 等文本能力，Phase 1 风险不是“有没有插入命令”，而是如何把 Pencil `targetId/caretHint` 正确映射到现有 `InlineEditor` 与 `InlineRange`。
- database block 和其他多 inline editor 场景当前 `getInlineEditorByModel()` 不直接支持，必须在 target service 里显式处理。
- Page 与 Edgeless 的 Pencil 行为需要明确模式边界，否则容易互相回归。

## 9. 推荐下一步

1. 用本轮修复后的 build 跑真机脚本，确认 `inputElements: 0` 是否下降。
2. 启动 Phase 1，在 rich-text/inline 侧打通 `insertTextFromPencilScribble()`，并让 iOS `scribble-gate.ts` 调用该 API。
3. 启动 Phase 2，建立 `PencilScribbleTargetService`，用现有 `InlineEditor`/block model 信息替代固定 padding。
4. 并行做 `UIIndirectScribbleInteraction` spike，验证是否能替代 textarea proxy 的输入元素诱导职责。
5. 在进入 canary 前接入 `FeatureFlagService` 和 `TelemetryProvider`。
