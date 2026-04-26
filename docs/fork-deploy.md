# Fork Deploy

## Назначение

Этот документ описывает, как этот fork (форк) `AFFiNE` попадает в production (боевую среду) `doska.wastelandw.ru`.

Главный принцип: VPS (виртуальный сервер) ничего не собирает. Production image (боевой образ) собирается локально в отдельном git worktree (рабочем дереве Git), затем архив образа загружается на `msk1-vikunja` и применяется через `docker load`.

## Текущий контур

```mermaid
flowchart TD
    A[Edit this fork] --> B[Push canary]
    B --> C[Local deploy worktree]
    C --> D[Local linux/amd64 image]
    D --> E[docker save archive]
    E --> F[scp to msk1-vikunja]
    F --> G[docker load + compose up]
    G --> H[doska.wastelandw.ru]

    classDef source fill:#e8f3ff,stroke:#2f6fa3,color:#102030
    classDef ci fill:#fff1cf,stroke:#a66b00,color:#241700
    classDef runtime fill:#e8f7e8,stroke:#3c7d3c,color:#102010
    classDef result fill:#f0e9ff,stroke:#6e4aa6,color:#180f2a

    class A,B source
    class C,D,E ci
    class F,G runtime
    class H result
```

Смысл схемы: этот repo (репозиторий) отвечает за исходники и image (образ), а ops repo (репозиторий эксплуатации) отвечает за доставку архива и compose deploy (выкладку Docker Compose) на сервер.

Текущие значения:

- fork repo (репозиторий форка): `https://github.com/z0rgoyok/AFFiNE`;
- upstream repo (исходный репозиторий): `https://github.com/toeverything/AFFiNE`;
- deploy branch (ветка выкладки): `canary`;
- build workflow (сценарий сборки): `.github/workflows/build-fork-image.yml`, сейчас используется только вручную;
- reusable image workflow (переиспользуемый сценарий образа): `.github/workflows/build-images.yml`;
- published image (публикуемый образ): `ghcr.io/z0rgoyok/affine:canary`;
- production domain (боевой домен): `doska.wastelandw.ru`;
- production host (боевой хост): `msk1-vikunja`;
- remote app dir (каталог приложения на сервере): `/opt/apps/affine`;
- ops repo: `/Users/deniszabozhanov/dev/tools/vps-vpn-ops`;
- ops host file (файл хоста): `hosts/msk1-vikunja.env`;
- ops deploy command (команда выкладки): локальный `docker save` + `scp` + `docker load`, затем `docker compose up -d --no-build`.

## Что уже изменено в fork

В `.github/workflows/build-images.yml` image tag (тег образа) использует owner (владельца) fork:

```yaml
tags: ghcr.io/${{ github.repository_owner }}/affine:${{inputs.build-type}}-${{ inputs.git-short-hash }}
```

Это дает `ghcr.io/z0rgoyok/affine:canary-<git-short-hash>` вместо upstream-адреса `ghcr.io/toeverything/affine:*`.

В `.github/workflows/build-fork-image.yml` есть отдельный workflow (сценарий) для fork:

- запускается на `push` в `canary`;
- запускается вручную через `workflow_dispatch`;
- вычисляет `app-version` как `<package.json version>-canary.<git-short-hash>`;
- вызывает `.github/workflows/build-images.yml`;
- после сборки ставит deploy tag (тег выкладки) `ghcr.io/z0rgoyok/affine:canary`.

`app-version` обязан начинаться с актуальной версии из `package.json`. Клиент `AFFiNE` сравнивает server version (версию сервера) с минимальной поддерживаемой версией, поэтому искусственная версия вида `0.0.0-canary.<hash>` ломает sign in (вход) с сообщением `not compatible with current client`.

В `.github/workflows/build-images.yml` убран `environment: ${{ inputs.build-type }}` для build jobs (задач сборки). Это важно: с `environment: canary` workflow в fork висел в `Queued`, потому что GitHub ждал environment gate (разрешение окружения).

## Обычный маршрут правки и PR

1. Работать в этом repo:

```bash
cd /Users/deniszabozhanov/dev/tools/AFFiNE
git status --short
git branch --show-current
```

Ожидаемая ветка: `canary`.

2. Внести правку в код.

3. Запустить проверки, относящиеся к измененным пакетам.

Практический порядок выбора проверок:

- смотреть ближайший `package.json`;
- смотреть root scripts (корневые скрипты) в `package.json`;
- для backend (бэкенда) проверять server package (серверный пакет);
- для web UI (веб-интерфейса) проверять frontend package (фронтенд-пакет);
- для workflow-only (только CI) правок проверять YAML (YAML) и запуск GitHub Actions.

4. Закоммитить, отправить ветку в fork и открыть PR (pull request, запрос на слияние):

```bash
git status --short
git add <changed-files>
git commit -m "<short message>"
git push -u origin <branch>
gh pr create --repo z0rgoyok/AFFiNE --base canary --head <branch> --draft
```

5. После review (ревью) смержить PR в `canary`, затем собирать production image (боевой образ) локально из merge commit (коммита слияния).

## Локальная production-сборка без загрязнения рабочей IDE

`set-version.sh` меняет tracked files (отслеживаемые файлы): `package.json`, Helm charts (Helm-чарты), iOS project (проект iOS) и metadata (метаданные). Эти изменения нельзя корректно спрятать через `.gitignore` или `.git/info/exclude`, потому что Git уже отслеживает эти пути.

Рабочее правило: production build (боевая сборка) выполняется в отдельном worktree (рабочем дереве), а основной `/Users/deniszabozhanov/dev/tools/AFFiNE` остается чистым для IDE.

```bash
cd /Users/deniszabozhanov/dev/tools/AFFiNE
git fetch origin canary
rm -rf /tmp/affine-prod-build
git worktree add --detach /tmp/affine-prod-build origin/canary
cd /tmp/affine-prod-build

base_version="$(node -p "require('./package.json').version")"
git_short_hash="$(git rev-parse --short HEAD)"
app_version="${base_version}-canary.${git_short_hash}"
./scripts/set-version.sh "$app_version"

BUILD_TYPE=canary yarn affine @affine/web build
BUILD_TYPE=canary yarn affine @affine/admin build
BUILD_TYPE=canary yarn affine @affine/mobile build
```

Native server module (нативный серверный модуль) собирается под production host (боевой хост), то есть `linux/amd64`:

```bash
docker run --rm --platform linux/amd64 \
  -v "$PWD":/work -w /work node:22-bookworm bash -lc '
    set -euo pipefail
    apt-get update >/dev/null
    apt-get install -y --no-install-recommends curl ca-certificates clang build-essential pkg-config python3 git >/dev/null
    curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal --default-toolchain 1.89.0 >/dev/null
    . "$HOME/.cargo/env"
    rustup target add x86_64-unknown-linux-gnu >/dev/null
    corepack enable
    CC="clang -D_BSD_SOURCE" TARGET_CC="clang -D_BSD_SOURCE" DEBUG="napi:*" \
      yarn workspace @affine/server-native build --target x86_64-unknown-linux-gnu
  '
mv packages/backend/native/server-native.node packages/backend/native/server-native.x64.node
yarn workspace @affine/server build
```

Production dependencies (боевые зависимости) ставятся под `linux/x64/glibc`, иначе optional native packages (опциональные нативные пакеты) для macOS попадут в образ и контейнер не запустится:

```bash
yarn config set --json supportedArchitectures.os '["linux"]'
yarn config set --json supportedArchitectures.cpu '["x64"]'
yarn config set --json supportedArchitectures.libc '["glibc"]'
yarn workspaces focus @affine/server --production
yarn workspace @affine/server prisma generate
rm -rf packages/backend/server/node_modules
mv ./node_modules ./packages/backend/server/node_modules
```

Docker image (образ Docker) собирается только под `linux/amd64`:

```bash
docker buildx build \
  --platform linux/amd64 \
  --pull \
  -f .github/deployment/node/Dockerfile \
  -t ghcr.io/z0rgoyok/affine:canary-${git_short_hash} \
  -t ghcr.io/z0rgoyok/affine:canary \
  .
docker save ghcr.io/z0rgoyok/affine:canary | gzip -1 > "/tmp/affine-canary-${git_short_hash}.tar.gz"
```

После успешной сборки worktree можно удалить:

```bash
cd /Users/deniszabozhanov/dev/tools/AFFiNE
git worktree remove /tmp/affine-prod-build
```

## Deploy production из локального image

```bash
cd /Users/deniszabozhanov/dev/tools/vps-vpn-ops
git_short_hash="<git-short-hash>"
. hosts/msk1-vikunja.env
scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "/tmp/affine-canary-${git_short_hash}.tar.gz" \
  "${SSH_USER}@${SSH_HOST}:/tmp/affine-canary-${git_short_hash}.tar.gz"
./scripts/ssh-host.sh hosts/msk1-vikunja.env \
  "sudo docker load -i /tmp/affine-canary-${git_short_hash}.tar.gz && cd /opt/apps/affine && sudo docker compose up -d --no-build"
```

Deploy script (скрипт выкладки) в ops repo по-прежнему отвечает за `compose.yaml`, `.env`, mail (почту), DKIM (DKIM) и Caddy (Caddy). Сам image (образ) при этом уже загружен в Docker daemon (демон Docker) на VPS.

## Ручная пересборка через GitHub Actions

GitHub Actions (действия GitHub) оставлены как ручной fallback (запасной путь). Автоматические тесты и сборки для этого fork сейчас не являются основным deploy path (маршрутом выкладки).

```bash
gh workflow run "Build Fork Image" --repo z0rgoyok/AFFiNE --ref canary
gh run list --repo z0rgoyok/AFFiNE --workflow "Build Fork Image" --limit 5
gh run watch <run-id> --repo z0rgoyok/AFFiNE --exit-status
```

После успешной сборки выполнить deploy из ops repo через `make deploy-affine`.

## Проверка production после deploy

Запускать из ops repo:

```bash
cd /Users/deniszabozhanov/dev/tools/vps-vpn-ops
./scripts/ssh-host.sh hosts/msk1-vikunja.env "cd /opt/apps/affine && sudo docker compose ps"
./scripts/ssh-host.sh hosts/msk1-vikunja.env "sudo docker inspect affine-app --format '{{.Config.Image}} {{.Image}}'"
curl -sSI https://doska.wastelandw.ru | sed -n '1,16p'
curl -sS https://doska.wastelandw.ru/info | jq -c '. | {version,type,flavor}'
make inspect HOST_FILE=hosts/msk1-vikunja.env
```

Ожидаемый результат:

- `affine-app`, `affine-postgres`, `affine-redis` и `affine-mail` находятся в состоянии `Up`;
- `affine-postgres` и `affine-redis` имеют `healthy`;
- `affine-app` использует локально загруженный image id (идентификатор образа) с tag (тегом) `ghcr.io/z0rgoyok/affine:canary`;
- публичный ответ идет через `Caddy`;
- ответ содержит `alt-svc: clear`;
- `/info` возвращает `type: selfhosted` и `flavor: allinone`.

Проверка `Caddy`:

```bash
./scripts/ssh-host.sh hosts/msk1-vikunja.env "cd /opt/apps/vikunja && sudo docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile"
```

## Проверка регистрации и почты

Тест отправляет реальное письмо:

```bash
curl -sS -i -X POST https://doska.wastelandw.ru/api/auth/sign-in \
  -H 'content-type: application/json' \
  -H 'x-affine-version: 0.26.6' \
  --data '{"email":"zabozhanov@gmail.com","callbackUrl":"/magic-link"}' \
  | sed -n '1,20p'
```

Проверить доставку:

```bash
cd /Users/deniszabozhanov/dev/tools/vps-vpn-ops
./scripts/ssh-host.sh hosts/msk1-vikunja.env "cd /opt/apps/affine && sudo docker compose logs --since=90s mail | tail -n 80"
./scripts/ssh-host.sh hosts/msk1-vikunja.env "sudo docker exec affine-mail postqueue -p"
```

Ожидаемый результат:

- HTTP endpoint (точка входа) sign-in отвечает успешно;
- `affine-mail` пишет `dsn=2.0.0` и `status=sent`;
- очередь `Postfix` пустая.

Письмо может попадать в Spam (спам) у Gmail даже при успешной SMTP-доставке. Это обычно связано с reputation (репутацией) IP или домена.

## Откат production

Откат выполняется в ops repo через смену `AFFINE_IMAGE` в `/opt/apps/affine/.env`.

Пример отката на официальный stable (стабильный) образ:

```bash
cd /Users/deniszabozhanov/dev/tools/vps-vpn-ops
./scripts/ssh-host.sh hosts/msk1-vikunja.env "sudo sed -i 's|^AFFINE_IMAGE=.*|AFFINE_IMAGE=ghcr.io/toeverything/affine:stable|' /opt/apps/affine/.env"
./scripts/ssh-host.sh hosts/msk1-vikunja.env "cd /opt/apps/affine && sudo docker compose pull && sudo docker compose up -d"
```

Возврат на fork image (образ форка) через GHCR:

```bash
make deploy-affine HOST_FILE=hosts/msk1-vikunja.env
```

Возврат на локально собранный fork image (образ форка) выполняется повторным `docker load` архива и `docker compose up -d --no-build`.

## Типовые сбои

### Workflow висит в Queued

Проверить `.github/workflows/build-images.yml`. В build jobs (задачах сборки) отсутствует `environment: ${{ inputs.build-type }}`. Если строка вернулась при upstream merge (слиянии upstream), GitHub снова может ждать environment gate (разрешение окружения).

### Основной worktree загрязнен version bump

Если `set-version.sh` запущен в основном repo (репозитории), Git покажет много измененных tracked files. Это временный build state (состояние сборки), а не исходники.

Проверка:

```bash
git status --short | sed -n '1,40p'
```

Очистка после завершения сборки:

```bash
git restore .
git status --short
```

Следующую production-сборку выполнять через отдельный `git worktree`.

### GHCR pull fails

Проверить, что image (образ) существует и доступен:

```bash
docker buildx imagetools inspect ghcr.io/z0rgoyok/affine:canary
```

Проверить pull (скачивание) на сервере:

```bash
cd /Users/deniszabozhanov/dev/tools/vps-vpn-ops
./scripts/ssh-host.sh hosts/msk1-vikunja.env "cd /opt/apps/affine && sudo docker compose pull app migration"
```

### Browser показывает SSL protocol error

Проверить DNS (запись DNS) и публичный ответ:

```bash
dig doska.wastelandw.ru A
dig @1.1.1.1 doska.wastelandw.ru A
curl -sSI https://doska.wastelandw.ru | sed -n '1,16p'
```

Ожидаемый адрес: `91.188.213.228`.

Ожидаемый публичный ответ содержит `via: 1.1 Caddy`, `alt-svc: clear`, и не содержит `server: cloudflare`.

### AI warnings в логах

Сообщения вида `Copilot embedding client is not configured properly` означают, что `AFFiNE AI` (ИИ) в self-hosted (самостоятельно размещенном) контуре требует отдельной настройки AI provider (провайдера ИИ) или облачной подписки. Это состояние не блокирует deploy, регистрацию и базовую работу документов.

## Точка состояния

На `2026-04-25` актуальный production build (боевая сборка) и deploy (выкладка):

- GitHub Actions run: `https://github.com/z0rgoyok/AFFiNE/actions/runs/24931730285`;
- fork commit (коммит форка): `34ee5bb23f730c3f2d9fb76dbc344154b80bc5c3`;
- published image (опубликованный образ): `ghcr.io/z0rgoyok/affine:canary`;
- image digest (дайджест образа): `sha256:050605c264d914f32252279266b3b8d509b8d48821b6b27bad0bc8fdd3f8ca50`;
- server image (образ на сервере): `ghcr.io/z0rgoyok/affine:canary` с тем же digest (дайджестом);
- server version (версия сервера): `0.26.3-canary.34ee5bb`;
- production domain (боевой домен): `https://doska.wastelandw.ru`.

Предыдущая сборка `51a14ee` публиковала server version (версию сервера) `0.0.0-canary.51a14ee`. Desktop client (настольный клиент) отклонял такой сервер как старее `0.23.0`, поэтому sign in (вход) был заблокирован. Фикс находится в `.github/workflows/build-fork-image.yml`: `app-version` берется из `package.json` и получает суффикс `-canary.<git-short-hash>`.
