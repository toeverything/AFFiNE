### Через UI (для разработки)

1. Settings → **Experimental features**
2. Принять предупреждение
3. Включить нужные флаги:

| Флаг                         | Что включает                    | Default |
| ---------------------------- | ------------------------------- | ------- |
| `enable_whiteboard_hello`    | stub-виджет hello               | **on**  |
| `enable_whiteboard_chart`    | chart (ECharts)                 | off     |
| `enable_whiteboard_sketch`   | sketch                          | off     |
| `enable_board_widget`        | board (kanban)                  | off     |
| `enable_whiteboard_collab`   | collab (курсоры, follow и т.д.) | off     |
| `enable_whiteboard_perf_hud` | perf HUD                        | off     |
| `enable_whiteboard_l0_layer` | L0 layer                        | off     |

«clob», скорее всего, имеется в виду **collab**.

После включения виджеты появляются в slash-menu на edgeless-доске.

### Чтобы было включено у всех по умолчанию

В `packages/frontend/core/src/modules/feature-flag/constant.ts` поставьте `defaultState: true` у нужных флагов (и при желании синхронно в `blocksuite/affine/shared/src/services/feature-flag-service.ts`).
