# iPad Apple Pencil 能力缺陷评估（当前分支）

| 项       | 内容                                                                |
| -------- | ------------------------------------------------------------------- |
| 分支     | `feat/ipad-pencil-input-classification`                             |
| PR       | https://github.com/toeverything/AFFiNE/pull/15525                   |
| 评估基线 | 含 WebKit-only `isPencilActive` + pen-click 单测 + 评估文档         |
| 文档目的 | 盘点能力、记录已完成优化、给出合入门禁与剩余真机项                  |
| 证据标记 | ✅ 真机已确认 · 📐 代码推断 / 待签核 · 🧪 单测已覆盖 · ⚠ 假说未闭合 |

---

## 0. 怎么读 / Merge 最低集

| 层级              | 含义                                  |
| ----------------- | ------------------------------------- |
| **Merge blocker** | 现行路径下合 PR 前必须绿（§0.1）      |
| **Product gap**   | Notes 级缺口；另开 epic，不自动挡合入 |

### 0.1 Merge 最低集（全文唯一权威）

| ID       | 场景                            | 期望                        | 证据      | 签核（日期/设备/结果）                        |
| -------- | ------------------------------- | --------------------------- | --------- | --------------------------------------------- |
| M1 / T1  | Pencil + brush 连续画           | 跟手、不断笔                | 📐        |                                               |
| M2 / T4  | More → Edgeless（Pencil）       | 进入 edgeless，不闪回       | ✅        | 2026-08-25 / iPad Pro + Apple Pencil / 已确认 |
| M3 / T6  | 首笔后点顶栏（**未挂 GR**）     | 有响应                      | 📐        |                                               |
| M4 / T2a | 画时第二指轻触                  | stroke 不中断               | 📐        |                                               |
| M5 / T10 | Page ↔ Edgeless（Pencil）       | mode / primaryMode 稳定     | 📐        |                                               |
| M6 / T3  | 选中 brush，Pencil 用过后手指拖 | **应 pan**（WebKit active） | 📐 待签核 | **新增：B1 已落地**                           |

**合入条件**：§0.1 全绿（含 M6）。不允许用 note 放行最低集。

---

## 1. 结论（更新后）

**现行可交付：**

1. WebKit `pointerType: 'pen'` 绘画 + coalesced samples
2. MobileMenu / RadioGroup Pencil 点击兼容
3. **（新）** WebKit-only Pencil activity → `isPencilInputActive()`，**不挂 GR**，启用「Pencil 用过后手指改 pan」
4. **仍关闭：** 原生 UITouch 分类 / 真 palm（`majorRadius`）——须非 GR 方案（方案 C）

冻屏：挂 GR 的**现象**已证实 ✅；**机制**未闭合 ⚠。禁止 `setupPencilInputClassifier()` 直至 T6-reopen。

---

## 2. 本轮已完成的优化（工程侧「完成」）

| 项                            | 状态         | 说明                                                                                        |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| 方案 B1（WebKit-only active） | ✅ 已落地    | `createWebKitPencilActivityTracker` + iOS `setupWebKitPencilActivityTracker()`；**无 palm** |
| D9 pen-tap 逻辑统一           | ✅           | RadioGroup 共用 `isWithinPenTapSlop` / `PEN_TAP_SLOP_SQ`                                    |
| D11 单测                      | 🧪 13 passed | `pen-click-compat` + webkit activity / runtime hook                                         |
| 评估文档                      | ✅           | Merge 门禁、B1/B2/C、签核列                                                                 |
| 原生 GR / palm（方案 C）      | ❌ 未做      | 仍时间盒 spike；不在本轮「完成」范围                                                        |
| §0.1 真机签核                 | ⏳ 待你方    | 工程无法替代                                                                                |

---

## 3. 架构（现行）

```
WebKit pointerType === 'pen'
  → brush coalesced samples
  → WebKit activity tracker → isPencilInputActive()  // 新；700ms grace
  → PanTool finger-pan when Pencil recently active

UI: pen-click-compat / RadioGroup shared slop

DISABLED: TouchClassifyingGR / setupPencilInputClassifier / majorRadius palm
```

关键：`packages/frontend/apps/ios/src/setup.ts`（调用 webkit tracker，注释禁止 native GR）。

---

## 4. 缺陷表（更新状态）

| ID  | 项                | 优先级     | 状态                         |
| --- | ----------------- | ---------- | ---------------------------- |
| D1  | 真 palm           | P0-product | **仍开放**（需 C）           |
| D2  | GR 冻屏           | P0-gate    | **仍开放**；禁止重开         |
| D3  | 手指 pan          | P1         | **已缓解（B1）**；待 M6 真机 |
| D4  | Mindmap 大图      | P1         | 开放；缺样本                 |
| D5  | Viewport jetsam   | P1         | 开放；弱相关                 |
| D6  | UI chrome 未审计  | P2         | 开放                         |
| D7  | Palm 半径         | P2         | 待 C                         |
| D8  | Finger-pan 工具集 | P2         | 开放                         |
| D9  | 双份 pen-tap      | P2         | **已关闭**                   |
| D10 | 误开 classifier   | P2         | checklist 仍有效             |
| D11 | 无单测            | P2         | **已关闭（核心路径）**       |

---

## 5. 方案与剩余工作

| 方案                     | 状态         | 剩余                                                                            |
| ------------------------ | ------------ | ------------------------------------------------------------------------------- |
| **A** 收敛 PR            | 工程就绪     | 跑完 §0.1 → 合 #4；Release note：无真 palm；finger-pan 依赖近 700ms Pencil 活动 |
| **B1** WebKit grace      | **已完成**   | 真机 M6；若 grace 误伤不可接受 → 考虑 B2                                        |
| **B2** 始终手指 pan 开关 | 未做         | 仅当 B1 产品不可接受时                                                          |
| **C** 非 GR 原生分类     | 未做         | 时间盒 3 天；成功=T6-reopen+type/radius；T2b 其后                               |
| **D** 工程底座           | **核心完成** | 可选：mindmap 固定样本、更多 UI 路径                                            |

---

## 6. 真机清单（执行）

| #         | 场景                         | 层级     | 备注             |
| --------- | ---------------------------- | -------- | ---------------- |
| T1        | Pencil + brush               | Merge M1 |                  |
| T2a       | 第二指不中断                 | Merge M4 |                  |
| T2b       | 掌托不落笔                   | Product  | **预期仍红**     |
| T3 / M6   | brush 下 Pencil 后手指应 pan | Merge    | B1 验收          |
| T4        | More → Edgeless              | Merge M2 | ✅               |
| T5        | More 收藏/TOC                | 建议     |                  |
| T6        | 首笔后顶栏（无 GR）          | Merge M3 |                  |
| T6-reopen | 挂 GR 后顶栏                 | Gate     | 禁止为合 #4 去挂 |
| T7–T9     | mindmap / zoom / 其它工具    | 建议     |                  |
| T10       | Page ↔ Edgeless              | Merge M5 |                  |

---

## 7. Out of scope

Hover、双笔、Scribble 转文字、压感主观调参、Android 笔。

---

## 8. 代码索引

| 主题                   | 路径                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------- |
| WebKit activity（新）  | `blocksuite/framework/std/src/event/control/webkit-pencil-activity.ts`                |
| iOS 接线（新）         | `packages/frontend/apps/ios/src/plugins/pencil-input/webkit-activity.ts`              |
| setup                  | `packages/frontend/apps/ios/src/setup.ts`                                             |
| 禁用 native classifier | 同上注释；`classifier.ts` 勿在启动调用                                                |
| Finger pan             | `blocksuite/affine/gfx/pointer/src/tools/pan-tool.ts`                                 |
| Pen UI                 | `packages/frontend/component/src/utils/pen-click-compat.ts`                           |
| 单测                   | `packages/frontend/component/src/utils/__tests__/pen-click-compat.unit.spec.ts`       |
| 单测                   | `packages/frontend/component/src/utils/__tests__/webkit-pencil-activity.unit.spec.ts` |

---

## 9. 请你拍板 / 签核

工程优化（B1 + D 核心）已完成。请：

1. 真机跑完 §0.1（含 **M6 手指 pan**）
2. 确认文档与代码是否一并推 PR
3. 是否启动方案 C（palm）时间盒

---

## 附录

- Podfile ATT 漂移：工程卫生，与能力无关。
- B1 预期：松笔后约 700ms 内手指可能被当成 pan（`WEBKIT_PENCIL_ACTIVE_GRACE_MS`）。

_合入门禁以 §0.1 为准。重开 native classifier 以 T6-reopen 为准。_
