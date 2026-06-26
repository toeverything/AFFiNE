# AFFiNE macOS 本地 Gemma 设计方案

## 1. 背景与目标

当前 AFFiNE 的 pagedoc `/ Ask AI` 与 edgeless/whiteboard 的 AI 问询能力，最终都会汇入共享的 AI request/runtime 主链路，并由后端 copilot provider 体系调用云端 Gemini。现状中，代码已经预留了 `executionLane`、`localCapable` 与 Gemma provider catalog 信息，但 local lane 仍然是 deferred 状态，实际执行仍然回落到 server。

本方案的目标是在 **Apple Silicon macOS 桌面版 AFFiNE `.app`** 中，引入 **本地 Gemma 3 4B Instruct** 能力，使以下入口优先改走本地模型，而不是云端 Gemini：

- pagedoc 中 `/ Ask AI`
- edgeless/whiteboard 中的 AI 问询入口

同时满足以下产品约束：

- 用户安装 `.app` 后可直接使用本地 AI
- 首发范围限定为 Apple Silicon（M1/M2/M3/M4）
- 不改写现有 UI 入口交互语义
- Web 版与非桌面环境行为不受影响
- 允许首发仅覆盖 chat 主链路，不承诺一次性替换所有复杂 AI action

## 2. 已确认前提

### 2.1 产品前提

- 目标模型：`Gemma 3 4B Instruct`
- 平台范围：`macOS desktop .app`
- 首发硬件：仅 Apple Silicon
- 目标体验：安装应用后直接可用
- 首发能力范围：优先覆盖 pagedoc `/ Ask AI` 与 edgeless AI 问询

### 2.2 代码现状前提

- 前端 AI 入口已统一汇入共享 request/runtime 层
- `executionLane` 与 `localCapable` 已在前端传输层预留
- `Gemma` 已存在于 provider catalog 中，且标记为 `localCapable: true`
- 后端 `CopilotLaneRouter` 仍固定返回 `executionLane: 'server'`
- `LocalInferenceProvider` 仍固定返回 `resolvedExecutionLane: 'server'`
- Electron 端已有 helper process、preload bridge、main/renderer 安全边界与 macOS 签名/notarization 流程

## 3. 非目标

以下内容不属于首轮设计目标：

- 一次性替换所有 AI action、图片生成、复杂结构化工具调用
- 覆盖 Intel Mac 的本地模型能力
- 覆盖 Web 端本地推理
- 在首轮中重构整个 Nest copilot provider runtime，使 server lane 与 local lane 全面对称
- 在首轮中设计通用多模型平台

## 4. 方案对比与选型

### 4.1 最小方案

仅将 chat 主链路切换到本地 Gemma，优先跑通 pagedoc 与 edgeless 两个入口，其余复杂 action 暂时维持云端或禁用。

优点：

- 变更范围最小
- 最快验证本地 lane 可行性
- 适合技术验证

缺点：

- 不是最终产品形态
- 产品语义会出现“部分本地、部分云端”的不一致

### 4.2 平衡方案（推荐）

建立桌面专属的 local lane，包含本地 runtime、IPC bridge、route policy、模型状态感知与打包资源布局，并且首发优先覆盖 chat 主链路。

优点：

- 最符合“安装后直接可用”的产品目标
- UI 改动最少，改动集中在共享 request/runtime 层与 Electron 桌面能力层
- 可保留明确 fallback 策略
- 能把本地能力纳入正式 macOS 发布链路

缺点：

- 需要同步处理 runtime、sidecar、签名、notarization、模型资源布局
- 首轮仍需限制在 chat first 范围内

### 4.3 长期方案

把 AFFiNE 当前的 server lane / local lane 抽象补全为正式双通道路由体系，支持更多本地模型、更完整 capability matrix，以及更系统的资产管理。

优点：

- 抽象更完整
- 长期扩展更稳

缺点：

- 超出首轮“替换 Gemini 主调用路径”的范围
- 成本明显过高

### 4.4 选型结论

本设计采用：

- **产品目标：平衡方案**
- **实施节奏：按最小方案顺序验证**
- **长期演进：保留向长期方案扩展的接口**

换句话说，本项目应以“平衡方案”的架构来设计，以“最小方案”的顺序来实施。

## 5. 总体架构

### 5.1 总体原则

1. 不直接改 pagedoc 与 edgeless 的业务入口逻辑
2. 优先在共享 AI request/runtime 层增加桌面 local lane
3. 本地推理进程不放在 renderer，放在 Electron helper/main 体系
4. 首轮优先打通 chat 主链路
5. Web 版、非桌面版与非 Apple Silicon 路径保持现有云端行为

### 5.2 架构分层

本方案分为五层：

#### A. Editor AI Entry Layer

保留现有 UI 入口：

- pagedoc `/ Ask AI`
- edgeless AI 问询

这一层只负责收集上下文与触发共享 request service，不负责直接决定本地或云端执行。

#### B. Shared AI Request / Runtime Layer

这是首轮真正的核心切点。

职责：

- 判断是否 Electron + Apple Silicon + 本地 runtime 健康
- 判断当前 action 是否属于首发支持范围（首轮为 chat 主链路）
- 为共享请求注入 local route 语义
- 定义本地失败时的 fallback 行为

#### C. Desktop Local Runtime Layer

职责：

- 启动与停止本地 Gemma sidecar
- 维护 sidecar 单实例
- 提供健康检查、预热与状态上报
- 管理模型资源定位
- 处理 crash restart 与异常状态

该层应运行在 Electron helper/main 边界之内，而不是 renderer 中。

#### D. Local Provider Adapter Layer

职责：

- 将 AFFiNE 现有 chat 请求语义适配到本地 sidecar 接口
- 统一处理流式返回、错误模型与能力检测
- 尽量复用现有 response/event 语义，避免让 UI 感知到底层推理框架细节

#### E. Packaging & Asset Layer

职责：

- 将 runtime 与模型资源纳入桌面构建
- 处理 resource staging、路径定位、签名、entitlements、notarization、Gatekeeper 校验
- 控制正式发布产物的结构与验收

## 6. Runtime 选型

### 6.1 候选路径

首轮候选有两条：

- `llama.cpp` sidecar
- MLX / Python runtime

### 6.2 选型结论

首轮推荐：**`llama.cpp` sidecar 优先**。

原因：

- 更适合作为独立桌面 runtime 被 Electron 管理
- 更容易做成 sidecar 进程与稳定的本地服务边界
- 更适合流式输出与 API 适配
- 避免首轮把 Python/venv/MLX 运行时整体打进 `.app`
- 更利于签名、资源 staging、进程生命周期管理

MLX 并不是长期不能做，而是不建议在首轮中承担桌面产品化的主要落地路径。

## 7. 组件映射与归属

### 7.1 前端共享 request 层

建议新增：

- `desktop-route-policy.ts`
- `local-runtime-client.ts`

归属：

- `packages/frontend/core/src/blocksuite/ai/runtime/request/`

职责：

- 判断是否切换到 local lane
- 统一访问 Electron 桌面本地 AI 状态
- 统一定义 fallback 行为

### 7.2 Electron 本地 AI 运行层

建议新增：

- `packages/frontend/apps/electron/src/helper/local-ai/manager.ts`
- `packages/frontend/apps/electron/src/helper/local-ai/sidecar.ts`
- `packages/frontend/apps/electron/src/helper/local-ai/health.ts`
- `packages/frontend/apps/electron/src/helper/local-ai/model-assets.ts`
- `packages/frontend/apps/electron/src/helper/local-ai/types.ts`

归属：

- Electron helper process 专属

职责：

- 本地 sidecar 生命周期管理
- 模型与 runtime 资源路径管理
- 状态广播与 IPC 暴露

### 7.3 模型状态 UI 层

沿用现有 AI 设置页与模型状态呈现区域，不新增全局 Design 级组件。

职责：

- 呈现“本地模型可用 / 启动中 / 不可用 / 已回退”状态
- 显示当前模型执行位置（local vs cloud）
- 首轮避免引入新的复杂 UI 组件体系

### 7.4 后端 lane 对照层

后端当前 local lane 仍处于 deferred 状态，因此首轮不把服务端 provider runtime 的全面重构作为必要前提。

职责：

- 保留现有服务端路径用于 Web 与 fallback
- 作为长期演进的参考层
- 暂不要求首轮把 Nest runtime 一次性改穿

## 8. 逐文件蓝图

### 8.1 前端共享 AI 请求层

优先修改：

- `packages/frontend/core/src/blocksuite/ai/runtime/request/service.ts`
- `packages/frontend/core/src/blocksuite/ai/runtime/request/message-transport.ts`
- `packages/frontend/core/src/blocksuite/ai/runtime/request/copilot-client.ts`
- `packages/frontend/core/src/blocksuite/ai/provider/setup-provider.tsx`

建议新增：

- `packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.ts`
- `packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.ts`

设计责任：

- 在共享 request path 中识别桌面本地执行条件
- 为 chat 请求注入 `executionLane='local'` 与 `localCapable=true`
- 统一本地 sidecar 调用封装
- 为本地失败定义显式 fallback

### 8.2 Electron helper / preload / main

优先修改：

- `packages/frontend/apps/electron/src/main/helper-process.ts`
- `packages/frontend/apps/electron/src/preload/electron-api.ts`
- `packages/frontend/apps/electron/src/helper/exposed.ts`
- `packages/frontend/apps/electron/src/shared/type.ts`
- `packages/frontend/apps/electron/src/main/handlers.ts`
- `packages/frontend/apps/electron/src/main/events.ts`

建议新增目录：

- `packages/frontend/apps/electron/src/helper/local-ai/`

设计责任：

- 管理本地 sidecar 单实例
- 将状态与调用入口通过 helper/main/preload 暴露给 renderer
- 提供多窗口共享、健康检查、错误状态与资源路径解析

### 8.3 编辑器 AI 入口层

优先修改：

- `packages/frontend/core/src/blocksuite/ai/actions/doc-handler.ts`
- `packages/frontend/core/src/blocksuite/ai/entries/edgeless/index.ts`
- `packages/frontend/core/src/blocksuite/ai/components/ai-chat-input/ai-chat-input.ts`

设计责任：

- 不改变入口语义
- 不在 UI 文件里散落“直接 localhost 请求”逻辑
- 必要时补充模型状态展示、禁用条件与 tracing 字段

### 8.4 模型状态与设置层

优先修改：

- `packages/frontend/core/src/modules/ai-button/services/catalog.ts`
- 与桌面 AI 设置、provider metadata 展示相关的现有文件

设计责任：

- 将 `Gemma` 从“deferred candidate”过渡为正式本地运行态
- 明确呈现 local / cloud 状态
- 提供用户可见的状态解释而不是静默降级

### 8.5 后端 copilot runtime 对照层

对照文件：

- `packages/backend/server/src/plugins/copilot/runtime/lane-router.ts`
- `packages/backend/server/src/plugins/copilot/providers/local-inference.ts`
- `packages/backend/server/src/plugins/copilot/providers/provider-registry.ts`

设计责任：

- 首轮主要作为保留路径与长期演进参考
- 不强制要求首轮打穿完整 server-side local lane

### 8.6 打包与发布层

必改文件：

- `packages/frontend/apps/electron/forge.config.mjs`
- `.github/workflows/release-desktop-platform.yml`
- `docs/building-desktop-client-app.md`

很可能新增：

- macOS entitlements plist
- runtime staging / signing script
- model asset verification script

设计责任：

- 将 sidecar 与模型资源纳入桌面构建与签名流程
- 解决现有 `extraResource` 不足以承载本地 AI runtime 的问题
- 确保 notarization 与 Gatekeeper 验证通过

## 9. 数据流设计

### 9.1 pagedoc `/ Ask AI`

1. 用户在 pagedoc 中触发 `/ Ask AI`
2. 现有入口照常收集文本/附件/上下文
3. 共享 `AIRequestService` 接收到 chat 请求
4. `desktop-route-policy` 判断：
   - 是否 Electron
   - 是否 Apple Silicon
   - 是否本地 runtime healthy
   - 是否属于首发支持的 chat 路径
5. 如果满足条件，则改走本地 Gemma sidecar
6. 如果不满足条件，则走现有 server Gemini 路径
7. UI 保持现有流式渲染逻辑

### 9.2 edgeless AI 问询

1. 用户在 edgeless 选择区域并发起 Ask AI
2. 现有入口照常抽取 context、图片与 docs
3. 进入共享 chat request 路径
4. 使用与 pagedoc 相同的 `desktop-route-policy`
5. 命中本地条件时走 Gemma local，否则走 server Gemini
6. UI 沿用现有 chat 渲染语义

## 10. fallback 与错误处理

首轮必须显式定义以下错误语义：

### 10.1 本地 runtime 不可启动

行为：

- 标记本地模型不可用
- 如果允许 fallback，则回退到 server Gemini
- 如果当前构建要求强制本地，则向用户展示明确错误原因

### 10.2 模型资源缺失或损坏

行为：

- 不进入本地执行
- 给出明确状态：模型资源不可用
- 阻止 silent failure

### 10.3 sidecar crash / health check 失败

行为：

- 尝试有限次数的自动恢复
- 超出恢复次数后标记不可用
- 避免无限重启与卡死 UI

### 10.4 内存不足或推理失败

行为：

- 返回明确错误类型
- 提供用户可见说明
- 不允许 UI 看起来像“无响应”

### 10.5 Web / 非 Apple Silicon 环境

行为：

- 保持现有云端路径
- 不暴露桌面本地模型状态
- 不引入额外分支复杂度

## 11. 测试策略

### 11.1 单元测试

覆盖内容：

- `desktop-route-policy` 选择逻辑
- local runtime 状态判断
- fallback 条件判断
- 配置注入与 request 参数注入

### 11.2 集成测试

覆盖内容：

- pagedoc `/ Ask AI` 在 Electron 环境下是否切换到 local lane
- edgeless AI 问询在 Electron 环境下是否切换到 local lane
- 本地失败时是否回退到 server 路径

### 11.3 桌面端验证

覆盖内容：

- helper process 启动 sidecar
- 多窗口共享同一 runtime
- app 退出时清理 sidecar
- crash restart 行为

### 11.4 发布验证

覆盖内容：

- 本地打包产物是否包含 sidecar 与模型资源
- 签名与 notarization 是否通过
- Gatekeeper 校验是否通过

## 12. 风险清单

### 12.1 发布产物体积

如果坚持“安装包即带模型”，DMG 体积会显著上升。这是发布系统风险，不只是工程实现风险。

### 12.2 hardened runtime / entitlements / notarization

本地 sidecar 很可能需要额外 entitlements。当前桌面配置尚未为本地 AI sidecar 做完整准备。

### 12.3 本地推理稳定性

需要解决：

- sidecar crash
- 首次 warmup 慢
- 多窗口竞争
- 内存不足
- 模型资源损坏

### 12.4 能力差异

Gemma 3 4B 不应在首轮被承诺完全覆盖 Gemini 的所有复杂能力。chat first 是必要的边界，不应越界承诺。

### 12.5 桌面与 Web 行为分叉

如果 route policy 不集中管理，会出现桌面与 Web AI 语义失控的问题。因此必须把分流点收敛到共享 request/runtime 层。

## 13. 验收标准

首轮验收标准定义如下：

1. pagedoc `/ Ask AI` 默认优先走本地 Gemma
2. edgeless/whiteboard AI 问询默认优先走本地 Gemma
3. Apple Silicon macOS `.app` 安装后可直接使用
4. 本地 runtime 异常时有明确 fallback 或错误提示
5. Web 版行为不受影响
6. 正式签名后的 `.app` / DMG 能通过本地 Gatekeeper 校验

## 14. 最终结论

本项目不应被理解为“把 Gemini 字符串替换成 Gemma 字符串”，而应被理解为：

- Electron 桌面本地推理能力落地
- 共享 AI provider 路由切换
- macOS 发布系统适配

因此，首轮设计应明确采用以下策略：

- **架构选型：平衡方案**
- **runtime 选型：`llama.cpp` sidecar 优先**
- **实施顺序：chat first**
- **核心切点：共享 AI request/runtime 层 + Electron helper/local-ai 层**
- **发布前提：补齐打包、签名、entitlements 与 notarization 验证链路**
