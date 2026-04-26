# Матрица полного тестирования AFFiNE

## Контуры

| Контур          | Минимальная проверка               | Расширенная проверка                     |
| --------------- | ---------------------------------- | ---------------------------------------- |
| Backend service | Узкий package test                 | Integration/API сценарий с логами        |
| Permission/auth | Positive и negative case           | Проверка гостя, владельца, участника     |
| Sync/doc update | Unit test на update policy         | WebSocket/GraphQL сценарий через браузер |
| Blob/image      | Upload request + видимый блок      | Reload, direct fetch blob, server logs   |
| Frontend/editor | Typecheck + локальный сценарий     | Production build + Playwright/browser    |
| Anonymous board | Anonymous link в гостевом режиме   | Edit/upload/delete ownership сценарии    |
| Bot             | SQLite state + один command flow   | Issue/revoke/link lifecycle end-to-end   |
| Deploy          | `/info` + process/container health | Smoke scenario и logs после действия     |

## Минимальный Definition of Done

1. Изменение покрыто ближайшим автоматическим тестом.
2. Статические проверки для затронутого слоя зеленые.
3. Production build выполнен локально, если изменение влияет на runtime/deploy.
4. Реальный пользовательский сценарий проверен в браузере.
5. Логи после сценария просмотрены для той ошибки, которую исправляли.
6. Финальный ответ содержит список запущенных проверок и остаточный риск.

## Типовые команды AFFiNE

Используй команды проекта и package scripts, найденные в текущем контексте. Частые варианты:

```bash
yarn affine @affine/server ava <test-file> --serial --concurrency 1
yarn lint:ox <changed-files>
yarn typecheck
yarn build
```

Для deploy-сборки используй локальный Docker/buildx flow проекта и фиксируй image tag. Для браузерной проверки используй Browser plugin или Playwright с нестандартным портом.
