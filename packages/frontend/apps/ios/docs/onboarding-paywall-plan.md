# iOS Onboarding + Paywall 接入方案（Plan）

> 状态：**已完成基础实现与本地联调验证**（B 门控 + onboarding 内 paywall + 登录后购买）。本文档记录规划、实现范围与验证状态。
> 范围：`packages/frontend/apps/ios/**`（原生 Swift 层）。
>
> **已确认决策：**
>
> 1. 门控方案：**方案 B（RootViewController 门控）**
> 2. Paywall 形态：**onboarding 内展示 paywall**；点击购买时**先检测登录态 → 未登录则唤起登录 → 登录成功后再执行购买**（复用既有真实购买链路）
> 3. onboarding 内容：**按当前 Figma 截图结构落地**（角色选择、功能介绍、Individual Plans），图片/精确资源位保留后续替换

## 1. 目标

1. App 首次启动时，根据**本地标识**决定：
   - 标识为 `false`（默认 / 首启）→ 进入 **onboarding 流程**（可选衔接 paywall）
   - 标识为 `true` → 直接进入 `.main`（当前的 AFFiNE Web 主界面）
2. onboarding 结束后写入标识为 `true`，后续启动不再展示。
3. 评估并接入 paywall（复用现有 `AffinePaywall` 包）。

## 2. 现状分析（事实，非假设）

### 2.1 启动链路

- `App/App/Base.lproj/Main.storyboard` 指定入口控制器 `RootViewController`。
- `RootViewController`（`UINavigationController` 子类）在 `commitInit()` 中硬编码：
  ```
  viewControllers = [AFFiNEViewController()]
  ```
- `AFFiNEViewController`（`CAPBridgeViewController`）加载 React Web = 用户口中的"直接进入 `.main`"。
- **没有 `SceneDelegate`**，单 window storyboard 启动；**没有真正的 `.main` 枚举**，`.main` 是概念模型。

### 2.2 已有可复用范式

- `AffineViewController+AIButton.swift`：`UserDefaults` 本地标识（`com.affine.intelligents.userConsented`）+ 原生弹层盖在 web 上。**这就是 onboarding 门控的最佳参照。**

### 2.3 Paywall 现状（关键约束）

- 已存在本地包 `App/Packages/AffinePaywall`（RevenueCat 5.76+，`Paywall.setup()` / `Paywall.presentWall(...)`）。
- 已通过 `PayWallPlugin`（JS 方法 `PayWall.showPayWall`）从 Web 侧触发。
- **强依赖 webView 的 JS 桥**（`Model/ViewModel+Action.swift`）：
  - `window.getCurrentUserIdentifier()` → 配置 & 登录 RevenueCat
  - `window.getSubscriptionState()` → 订阅态
  - `window.requestApplySubscription(txId)` → 购买回写
- **结论**：onboarding 阶段用户通常**未登录、web 未就绪**，直接拉"真实购买" paywall 会因拿不到 `userIdentifier` 抛错并自动 dismiss。→ paywall 在 onboarding 只能"软展示/引导"，真实购买需登录后。

## 3. 本地标识设计

| 项         | 值                                                                              |
| ---------- | ------------------------------------------------------------------------------- |
| Key        | `com.affine.onboarding.completed`（Bool，`UserDefaults.standard`）              |
| 默认       | key 不存在时 `bool(forKey:)` 返回 `false` → **首启自动进 onboarding**，符合预期 |
| 写入时机   | onboarding 最后一屏完成 / 跳过时置 `true`                                       |
| Debug 复位 | 提供 `#if DEBUG` 的重置入口（便于反复验证），例如设置项或长按手势               |

## 4. 组件映射（先映射，后写码）

| 组件                          | 归属层级                                                         | 复用来源 / 说明                      |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| 本地标识读写                  | App target（`AFFiNEViewController` 扩展或独立 `OnboardingGate`） | 复用 AIButton 的 UserDefaults 范式   |
| Onboarding 容器控制器         | App target `App/App/Onboarding/`（单一用途，**不升级为共享包**） | 规则 2：单屏/单模块使用留在本地      |
| Onboarding 分页 UI（SwiftUI） | 同上，`private`/文件内                                           | 规则 1/2：先本地，勿造 Design 级组件 |
| Paywall 展示                  | 复用 `AffinePaywall`（已有包）                                   | 规则 1：禁止重复造轮子               |
| 门控注入点                    | `RootViewController` 或 `AFFiNEViewController.viewDidAppear`     | 见下方三方案                         |

> 说明：按 iOS 架构规则，onboarding 是 App 级、单一用途，**不新增 Design/共享包**，直接放 App target。仅当未来需要 macOS 独立预览（如 `AffinePaywall` 那样）再考虑独立 SwiftPM 包。

## 5. 三方案选型（跨模块/架构级，必须三选一）

> ✅ **最终选定：方案 B（RootViewController 门控）。** 方案 A / C 作为记录保留。

### 方案 A — 最小（Modal 盖层）〔未选〕

- 在 `AFFiNEViewController.viewDidAppear` 里读标识：`false` 则 `present` 一个全屏 `OnboardingViewController`（`.fullScreen`），完成后 dismiss 并置 `true`。
- Web 主界面照常在底层加载。**完全复用 AIButton 的"盖在 web 上"范式**。
- Paywall：onboarding 末屏放"了解会员"软引导按钮，真实购买仍走登录后 Web → `PayWall.showPayWall`。
- 改动面：新增 `App/App/Onboarding/*`，改 `AFFiNEViewController`（+ 少量行）。
- ✅ 优点：diff 最小、风险低、不动启动架构、不碰 xcodeproj 结构。
- ⚠️ 缺点：onboarding 逻辑寄生在 web VC 生命周期上，语义略弱。

### 方案 B — 平衡（RootViewController 门控）✅ 已选定

- 让 `RootViewController.commitInit()` 依据标识决定初始 `viewControllers`：
  - `true` → `[AFFiNEViewController()]`（现状）
  - `false` → 先 `present`/`push` `OnboardingViewController`，完成回调里切到 `AFFiNEViewController`。
- Onboarding 独立控制器 + 完成 `coordinator`/闭包回调，职责清晰；标识写在完成回调。
- Paywall：同方案 A（软引导），并预留"登录后自动拉 paywall"的回调钩子。
- 改动面：新增 `App/App/Onboarding/*`，改 `RootViewController`（门控逻辑），`AFFiNEViewController` 基本不动。
- ✅ 优点：门控在"根"处，语义正确；后续扩展（多步引导、A/B）成本低；仍是外科式改动。
- ⚠️ 缺点：比 A 多一层协调逻辑。

### 方案 C — 长期（AppFlow Coordinator + 可选独立包）〔未选〕

- 引入 `AppFlowCoordinator` 管理 `onboarding / main / paywall` 状态机；onboarding 抽为独立 SwiftPM 包 `AffineOnboarding`（可 macOS 预览，对齐 `AffinePaywall`）；paywall 支持"匿名/未绑定"模式以便 onboarding 内真实展示。
- 改动面：新增包 + 改 `Package`/`xcodeproj` 依赖 + 重构启动。
- ✅ 优点：可扩展性最强、可独立预览与测试、paywall 能力最完整。
- ⚠️ 缺点：改动面大、动 xcodeproj/包依赖、超出当前需求、CI 风险高。

**选定：方案 B。** 理由：正好命中"本地标识 → onboarding / `.main`"的门控语义，改动集中在 `RootViewController` 一处，不动启动架构与 xcodeproj 结构，风险可控；paywall 先做软引导、真实购买延后到登录后，规避 JS 桥依赖坑。

### 5.1 方案 B 落地范围（确认后的实施清单）

新增文件（App target，`App/App/Onboarding/`，均不进共享包）：

- `OnboardingViewController.swift`：UIKit 容器，`UIHostingController` 承载 SwiftUI 分页；对外暴露 `onFinish` 完成回调。
- `OnboardingRootView.swift`：SwiftUI 分页视图（`TabView` + `PageTabViewStyle`），占位文案/配图；末屏含"了解会员"软引导 CTA 与"开始使用/跳过"。
- `OnboardingFlag.swift`：本地标识读写（`com.affine.onboarding.completed`），含 `#if DEBUG` 复位方法。

改动文件：

- `RootViewController.swift`：`commitInit()` 依据 `OnboardingFlag` 决定初始栈——
  - 已完成 → `[AFFiNEViewController()]`（现状不变）；
  - 未完成 → 先置 `[AFFiNEViewController()]` 保证 web 预热，再在 `viewDidAppear` 内 `present` 全屏 `OnboardingViewController`；`onFinish` 回调里写标识 `true` 并 `dismiss`。
  - （单窗口 storyboard 启动，`RootViewController` 是根导航控制器，是门控最合适的落点。）

不改动：`AFFiNEViewController` 主体逻辑、`AppDelegate`、`Main.storyboard`、`xcodeproj` 结构（新增 `.swift` 文件需加入 target，属必要且最小的工程改动）。

## 6. Paywall 接入策略（已选定：登录后购买）

**核心条件（本次新增）**：onboarding 流程内展示 paywall，用户点击购买时——
**先检测登录态 → 未登录则唤起登录 → 登录成功后再执行真实购买**。

### 6.1 依赖事实（决定流程形态）

- `window.getCurrentUserIdentifier()`（`src/app.tsx`）返回 `currentServer.account$.value?.id`，**未登录时为空**。
- Paywall 的 `ViewModel+Action.updateAppStoreStatusExecute` 需要**非空** userIdentifier 才能配置/登录 RevenueCat；空值会抛错并弹框自动 dismiss（§2.3）。
- **登录界面在 Web 层**（React 渲染 email / OAuth / magic-link）；原生 `AuthPlugin` 只提供底层 sign-in HTTP 方法，**不含登录 UI**。
- ⇒ "唤起登录"最可行的方式是**驱动 Web 应用进入登录页**，登录成功后再拉起既有真实 Paywall（此时 JS 桥 & userIdentifier 齐全，购买链路原样可用）。

### 6.2 交互链路（onboarding → 登录 → 购买）

1. onboarding 末屏展示 paywall 权益页（占位），用户点击「订阅/购买」CTA。
2. 原生侧通过 webView 执行 `window.getCurrentUserIdentifier()` 检测登录态：
   - **已登录（非空）** → 直接走步骤 4。
   - **未登录（空）** → 走步骤 3。
3. **唤起登录**：结束/收起 onboarding overlay，把 Web 应用带到前台并导航到登录页；等待登录成功。
   - 登录成功判定：登录完成后 `getCurrentUserIdentifier()` 由空变非空（可轮询或由 Web 回调通知）。
4. **执行购买**：登录成功后，调用既有 `Paywall.presentWall(toController:bindWebContext:type:)` 拉起真实 paywall（RevenueCat 配置、订阅态、`requestApplySubscription` 全部走现有链路，**本次不改购买逻辑**）。

### 6.3 需要新增 / 补齐的桥接（依赖项，实现前确认）

- **登录唤起入口**：当前没有原生可直接调用的"打开登录页"桥。二选一（实现阶段定）：
  - (a) 复用 Web 现有导航：新增一个轻量 `window.requestSignIn()`（导航到登录页，登录成功后 resolve），原生 `callAsyncJavaScript` 调用并 await。**推荐**，语义清晰、成功态可靠。
  - (b) 纯原生轮询 `getCurrentUserIdentifier()` 直到非空 + 超时兜底。改动更小但成功态判定较脆。
- **登录成功回调**：优先方案 (a) 的 Promise resolve；退化用 (b) 轮询。
- 说明：以上桥接属 Web 侧小改动，需与前端确认 `window.requestSignIn()` 是否可提供。

### 6.4 边界与失败处理

- 用户在登录页取消/退出 → 回到 onboarding（不写购买态），可继续「跳过」进入 `.main`。
- 登录成功但购买取消 → 走既有 paywall 的 `userCancelled` 分支，不影响 onboarding 完成标识。
- 不引入匿名 RevenueCat 购买（那属方案 C，已排除）。
- onboarding 完成标识（§3）与购买/登录**解耦**：无论是否购买，走完/跳过 onboarding 即置 `true`。

## 7. 验证计划（改动后）

按 `ios-native-guardrails.mdc` 最小检查：

1. `yarn affine @affine/ios build`
2. `yarn workspace @affine/ios sync`
3. `xcodebuild -workspace packages/frontend/apps/ios/App/App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build`

功能验证：

- 首启（标识缺省）→ 展示 onboarding；完成后置 `true`。
- 二次启动 → 直接进 `.main`。
- `#if DEBUG` 复位标识 → 再次触发 onboarding。
- Paywall 展示不崩。
- **未登录**点购买 → 唤起登录 → 登录成功后自动拉起真实 paywall 并可完成购买。
- **已登录**点购买 → 直接拉起真实 paywall。
- 登录取消 / 购买取消 → 回到 onboarding，可「跳过」进入 `.main`，标识仍正确置位。

## 8. 自检（4 项核心评审）

- [x] 组件归属正确：onboarding 留 App target，不新增 Design/共享包。
- [x] 无跨模块直接依赖：不 `import` 其它 Feature 模块。
- [x] View 不直连 Manager/Service：SwiftUI View 只接收闭包与状态，登录/paywall 流程走 `RootViewController`。
- [x] 规则/文档回写：本 plan 已补充实现与验证状态。

## 9. 决策记录（已确认）

1. 门控方案：**方案 B（RootViewController 门控）**。
2. Paywall：**onboarding 内展示 paywall**；购买 CTA **先检测登录 → 未登录唤起登录 → 登录成功后执行真实购买**（复用既有 `Paywall.presentWall` 链路，见 §6）。
3. 内容素材：**先用占位文案/配图**，后期提供 Figma 后替换（onboarding UI 需预留可替换的文案/图片资源位）。

## 10. 后续待办（实施阶段）

- [x] 按 §5.1 新增 `App/App/Onboarding/*` 三个文件并加入 App target。
- [x] 改 `RootViewController` 门控逻辑。
- [x] onboarding：按当前 Figma 截图结构落地，并保留可替换插画/文案位。
- [x] 实现 §6.2 购买链路：`getCurrentUserIdentifier()` 检测 → 未登录唤起登录 → 登录成功后 `Paywall.presentWall`。
- [x] 补齐 §6.3 的 `window.requestSignIn()` 桥（方案 a），原生侧保留轮询兜底。
- [x] 跑 §7 验证（build / sync / xcodebuild + 本地启动验证）：web build / lint 已通过；本次使用本地 CocoaPods spec 缓存完成 `pod install --no-repo-update`、`yarn workspace @affine/ios sync` 与 simulator native build。
- [ ] Figma 精确切图、文案 token 与素材替换（独立小改动）。

## 11. 实现记录与验证状态

- 已新增 `OnboardingFlag`、`OnboardingViewController`、`OnboardingRootView`，并加入 App target。
- `RootViewController` 现在始终预热 `AFFiNEViewController`，首启时全屏展示 onboarding；完成/跳过写入 `com.affine.onboarding.completed`。
- onboarding 购买 CTA 复用现有 `AffinePaywall`：先查 `window.getCurrentUserIdentifier()`，未登录时调用 `window.requestSignIn()` 打开 Web 登录页，登录成功后再调用 `Paywall.presentWall(...)`。
- Web 侧已新增 `window.requestSignIn()`：跳转 `/sign-in`，通过 `AuthSession.waitForAuthenticated` 等待登录成功并返回 account id。
- 当前验证：`yarn affine @affine/ios build`、`yarn lint:ox packages/frontend/apps/ios/src/app.tsx`、`yarn prettier --check packages/frontend/apps/ios/src/app.tsx packages/frontend/apps/ios/docs/onboarding-paywall-plan.md` 通过。
- 本次联调补充：`pod install --no-repo-update` 通过并生成 `Pods.xcodeproj`；`yarn workspace @affine/ios sync` 通过；`xcodebuild -workspace packages/frontend/apps/ios/App/App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/affine-ios-onboarding-dd ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build` 通过。
- 本地启动验证：已将 `/tmp/affine-ios-onboarding-dd/Build/Products/Debug-iphonesimulator/AFFiNE.app` 安装并启动到 iOS 18.4 `iPhone 16 Pro` 模拟器；通过重新安装清空 `UserDefaults`，首启可进入 onboarding。
- 说明：首次尝试 iOS 26.5 模拟器时设备进入 `Shutting Down` 状态，已切换到 iOS 18.4 模拟器完成安装启动；后续真实购买链路仍需要有效登录账号、RevenueCat sandbox 配置与 Apple sandbox 账号进行端到端验证。
