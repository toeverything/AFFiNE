---
name: affine-bot-db-ops
description: Безопасная работа с production SQLite БД Telegram-бота AFFiNE anonymous board и связанной AFFiNE GraphQL-схемой. Использовать, когда пользователь просит посмотреть базу бота, посчитать/сбросить/отозвать выданные ботом anonymous board links, проверить scoped access token, проверить production-бота, сделать backup bot.db, восстановить контекст деплоя бота или выполнить операции вокруг /opt/apps/affine-anonymous-board-bot.
---

# AFFiNE Bot DB Ops

## Смысл

Этот skill фиксирует безопасный контур работы с production-ботом, который выдает уникальные anonymous board links (анонимные ссылки на доску) для AFFiNE.

Главная идея: сначала наблюдать, затем делать backup (резервную копию), затем менять состояние через AFFiNE API, и только после успешного ответа менять SQLite (локальную БД).

## Контекст

Сначала прочитать проектную информацию:

- `/Users/deniszabozhanov/dev/tools/AFFiNE/AGENTS.md`, если файл есть.
- `/Users/deniszabozhanov/dev/tools/vps-vpn-ops/docs/affine-board-bot-operations.md`.
- `/Users/deniszabozhanov/dev/tools/vps-vpn-ops/docs/affine-board-bot-state-2026-04-26.md`.
- `references/paths.md` внутри этого skill.

## Инварианты

- Не выводить `TELEGRAM_BOT_TOKEN`, `AFFINE_ACCESS_TOKEN`, cookies (куки), session token (токен сессии), CSRF token и любые Authorization headers.
- Не использовать `AFFINE_SESSION_TOKEN` как рабочую схему. Production-бот использует `AFFINE_ACCESS_TOKEN`.
- Перед изменением `bot.db` создавать backup.
- Отзывать ссылки через AFFiNE GraphQL до пометки строки revoked (отозванной) в SQLite.
- Для production-команд использовать `hosts/amnezia-vdsina.env`, потому что бот работает на `amnezia-vdsina`.
- Не выполнять destructive (разрушающие) операции над всей БД без явного запроса пользователя.

## Быстрый Workflow

1. Перейти в ops repo:

```bash
cd /Users/deniszabozhanov/dev/tools/vps-vpn-ops
```

2. Проверить контейнер и логи:

```bash
./scripts/ssh-host.sh hosts/amnezia-vdsina.env "cd /opt/apps/affine-anonymous-board-bot && sudo docker compose ps && sudo docker compose logs --tail=80"
```

3. Для операций с БД запускать bundled script:

```bash
python3 /Users/deniszabozhanov/dev/tools/AFFiNE/.codex/skills/affine-bot-db-ops/scripts/bot_db_ops.py count
python3 /Users/deniszabozhanov/dev/tools/AFFiNE/.codex/skills/affine-bot-db-ops/scripts/bot_db_ops.py backup
python3 /Users/deniszabozhanov/dev/tools/AFFiNE/.codex/skills/affine-bot-db-ops/scripts/bot_db_ops.py revoke-all
python3 /Users/deniszabozhanov/dev/tools/AFFiNE/.codex/skills/affine-bot-db-ops/scripts/bot_db_ops.py smoke
```

## Операции

### Посчитать ссылки

Использовать `count`. Результат должен содержать `active` и `total`.

### Сбросить все выданные ботом ссылки

Использовать `revoke-all`. Скрипт:

- создает backup `bot.db`;
- читает активные строки `board_links`;
- отзывает каждую ссылку через `revokeAnonymousDocAccessLink`;
- помечает строку `revoked_at`;
- печатает только агрегаты `revoked` и `failed`.

После выполнения снова запустить `count` и убедиться, что `active=0`.

### Проверить scoped access token

Использовать `smoke`. Скрипт создает тестовую anonymous link (анонимную ссылку) и сразу отзывает ее.

## Проверки После Изменений

Минимальный набор:

```bash
python3 /Users/deniszabozhanov/dev/tools/AFFiNE/.codex/skills/affine-bot-db-ops/scripts/bot_db_ops.py count
./scripts/ssh-host.sh hosts/amnezia-vdsina.env "cd /opt/apps/affine-anonymous-board-bot && sudo docker compose logs --tail=80"
curl -fsS https://doska.wastelandw.ru/info
```

Если менялся код бота, дополнительно в `/Users/deniszabozhanov/dev/wasteland_w/affine_anonymous_board_bot` выполнить:

```bash
. .venv/bin/activate
pytest
ruff check .
```

## Ответ Пользователю

Сообщать:

- сколько активных ссылок было;
- сколько ссылок отозвано;
- где создан backup;
- какие проверки выполнены;
- какой контур остался вне проверки.

Не сообщать значения токенов и cookies.
