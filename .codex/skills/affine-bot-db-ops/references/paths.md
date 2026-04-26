# Пути И Контуры

## Репозитории

- AFFiNE: `/Users/deniszabozhanov/dev/tools/AFFiNE`
- Ops: `/Users/deniszabozhanov/dev/tools/vps-vpn-ops`
- Bot source: `/Users/deniszabozhanov/dev/wasteland_w/affine_anonymous_board_bot`

## Production Bot

- Host file: `/Users/deniszabozhanov/dev/tools/vps-vpn-ops/hosts/amnezia-vdsina.env`
- App dir: `/opt/apps/affine-anonymous-board-bot`
- Runtime `.env`: `/opt/apps/affine-anonymous-board-bot/.env`
- SQLite DB: `/opt/apps/affine-anonymous-board-bot/data/bot.db`
- Backup dir: `/opt/backups/affine-anonymous-board-bot-db`
- Container: `affine-anonymous-board-bot-affine-anonymous-board-bot-1`

## AFFiNE Production

- Base URL: `https://doska.wastelandw.ru`
- GraphQL URL: `https://doska.wastelandw.ru/graphql`
- Info endpoint: `https://doska.wastelandw.ru/info`

## SQLite Таблицы Бота

`users` хранит Telegram-пользователей.

`board_links` хранит выданные ссылки:

- `telegram_user_id`
- `affine_link_id`
- `token`
- `workspace_id`
- `doc_id`
- `public_url`
- `revoked_at`
- `created_at`
- `updated_at`
