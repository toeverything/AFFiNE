#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import textwrap
from pathlib import Path

OPS_DIR = Path("/Users/deniszabozhanov/dev/tools/vps-vpn-ops")
HOST_FILE = "hosts/amnezia-vdsina.env"
CONTAINER = "affine-anonymous-board-bot-affine-anonymous-board-bot-1"
APP_DIR = "/opt/apps/affine-anonymous-board-bot"
BACKUP_DIR = "/opt/backups/affine-anonymous-board-bot-db"


def run_ssh(command: str) -> None:
    subprocess.run(
        ["./scripts/ssh-host.sh", HOST_FILE, command],
        cwd=OPS_DIR,
        check=True,
    )


def run_container_python(source: str) -> None:
    escaped = source.replace("'", "'\"'\"'")
    run_ssh(
        "sudo docker exec "
        f"{CONTAINER} sh -lc 'cat >/tmp/affine_bot_db_ops.py <<'\"'\"'PY'\"'\"'\n"
        f"{escaped}\n"
        "PY\n"
        "python /tmp/affine_bot_db_ops.py'"
    )


def count() -> None:
    run_container_python(
        textwrap.dedent(
            """
            import asyncio
            import aiosqlite
            from affine_anonymous_board_bot.config import load_settings

            async def main():
                settings = load_settings()
                async with aiosqlite.connect(settings.db_path) as db:
                    async with db.execute(
                        "SELECT COUNT(*) FROM board_links WHERE revoked_at IS NULL"
                    ) as cursor:
                        active = (await cursor.fetchone())[0]
                    async with db.execute("SELECT COUNT(*) FROM board_links") as cursor:
                        total = (await cursor.fetchone())[0]
                print(f"active={active} total={total}")

            asyncio.run(main())
            """
        ).strip()
    )


def backup() -> None:
    run_ssh(
        "sudo sh -lc "
        f"'mkdir -p {BACKUP_DIR} && "
        f"cp {APP_DIR}/data/bot.db {BACKUP_DIR}/bot.db.$(date +%Y%m%d-%H%M%S) && "
        f"ls -lt {BACKUP_DIR} | head -5'"
    )


def revoke_all() -> None:
    backup()
    run_container_python(
        textwrap.dedent(
            """
            import asyncio
            from datetime import UTC, datetime

            import aiosqlite

            from affine_anonymous_board_bot.affine_client import AffineClient
            from affine_anonymous_board_bot.config import load_settings

            async def main():
                settings = load_settings()
                settings.validate_runtime()
                client = AffineClient(settings.graphql_url, settings.affine_access_token)
                async with aiosqlite.connect(settings.db_path) as db:
                    db.row_factory = aiosqlite.Row
                    async with db.execute(
                        "SELECT telegram_user_id, affine_link_id, workspace_id, doc_id "
                        "FROM board_links WHERE revoked_at IS NULL"
                    ) as cursor:
                        rows = await cursor.fetchall()
                    revoked = 0
                    failed = []
                    for row in rows:
                        try:
                            await client.revoke_anonymous_link(
                                workspace_id=row["workspace_id"],
                                doc_id=row["doc_id"],
                                link_id=row["affine_link_id"],
                            )
                            revoked_at = datetime.now(UTC).isoformat()
                            await db.execute(
                                "UPDATE board_links "
                                "SET revoked_at = ?, updated_at = CURRENT_TIMESTAMP "
                                "WHERE telegram_user_id = ? AND revoked_at IS NULL",
                                (revoked_at, row["telegram_user_id"]),
                            )
                            revoked += 1
                        except Exception as exc:
                            failed.append((row["telegram_user_id"], str(exc)))
                    await db.commit()
                print(f"revoked={revoked} failed={len(failed)}")
                for telegram_user_id, error in failed:
                    print(f"failed telegram_user_id={telegram_user_id} error={error}")
                if failed:
                    raise SystemExit(1)

            asyncio.run(main())
            """
        ).strip()
    )
    count()


def smoke() -> None:
    run_container_python(
        textwrap.dedent(
            """
            import asyncio

            from affine_anonymous_board_bot.affine_client import AffineClient
            from affine_anonymous_board_bot.config import load_settings

            async def main():
                settings = load_settings()
                settings.validate_runtime()
                client = AffineClient(settings.graphql_url, settings.affine_access_token)
                created = await client.create_anonymous_link(
                    settings.affine_workspace_id,
                    settings.affine_doc_id,
                )
                await client.revoke_anonymous_link(
                    workspace_id=settings.affine_workspace_id,
                    doc_id=settings.affine_doc_id,
                    link_id=str(created["id"]),
                )
                print("smoke=ok created_and_revoked=1")

            asyncio.run(main())
            """
        ).strip()
    )


def status() -> None:
    run_ssh(
        f"cd {APP_DIR} && "
        "sudo docker compose ps && "
        "sudo docker compose logs --tail=80"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["count", "backup", "revoke-all", "smoke", "status"])
    args = parser.parse_args()
    {
        "count": count,
        "backup": backup,
        "revoke-all": revoke_all,
        "smoke": smoke,
        "status": status,
    }[args.command]()


if __name__ == "__main__":
    main()
