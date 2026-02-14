# Dependency Map

> **Last Updated:** 2026-02-14

## Inter-Module Dependency Graph

```mermaid
graph LR
    subgraph "Application Entry Points"
        WEB["@affine/web"]
        ELECTRON["@affine/electron"]
        MOBILE["@affine/mobile"]
        IOS["@affine/ios"]
        ANDROID["@affine/android"]
        ADMIN["@affine/admin"]
    end

    subgraph "Frontend Core"
        CORE["@affine/core"]
        COMPONENT["@affine/component"]
        TRACK["@affine/track"]
        ROUTES["@affine/routes"]
        EAPI["@affine/electron-api"]
    end

    subgraph "Common"
        INFRA["@toeverything/infra"]
        NBSTORE["@affine/nbstore"]
        GQL["@affine/graphql"]
        I18N["@affine/i18n"]
        ENV["@affine/env"]
        DEBUG["@affine/debug"]
        ERR["@affine/error"]
        READER["@affine/reader"]
        TEMPLATES["@affine/templates"]
    end

    subgraph "BlockSuite"
        BS_ALL["@blocksuite/affine"]
        BS_STD["@blocksuite/std"]
        BS_STORE["@blocksuite/store"]
        BS_GLOBAL["@blocksuite/global"]
    end

    subgraph "Backend"
        SERVER["@affine/server"]
        SRV_NATIVE["@affine/server-native"]
    end

    subgraph "Rust Native"
        FE_NATIVE["affine_native"]
        Y_OCTO["y-octo"]
        COMMON_NATIVE["affine_common"]
    end

    %% App entry points -> Core
    WEB --> CORE
    WEB --> COMPONENT
    WEB --> INFRA
    WEB --> NBSTORE
    ELECTRON --> CORE
    MOBILE --> CORE
    IOS --> CORE
    ANDROID --> CORE
    ADMIN --> GQL

    %% Core dependencies
    CORE --> COMPONENT
    CORE --> INFRA
    CORE --> NBSTORE
    CORE --> GQL
    CORE --> I18N
    CORE --> TRACK
    CORE --> BS_ALL
    CORE --> BS_STD
    CORE --> EAPI
    CORE --> ENV
    CORE --> ERR
    CORE --> DEBUG
    CORE --> READER
    CORE --> TEMPLATES

    %% Component dependencies
    COMPONENT --> INFRA

    %% Infra dependencies
    INFRA --> ENV
    INFRA --> ERR
    INFRA --> DEBUG
    INFRA --> TEMPLATES

    %% NBStore
    NBSTORE --> ENV
    NBSTORE --> DEBUG

    %% BlockSuite internal
    BS_ALL --> BS_STD
    BS_ALL --> BS_STORE
    BS_STD --> BS_GLOBAL
    BS_STD --> BS_STORE
    BS_STORE --> BS_GLOBAL

    %% Server
    SERVER --> SRV_NATIVE

    %% Rust
    FE_NATIVE --> Y_OCTO
    FE_NATIVE --> COMMON_NATIVE
    SRV_NATIVE --> Y_OCTO
    SRV_NATIVE --> COMMON_NATIVE
```

---

## Shared Package Usage

These packages are consumed by most of the monorepo:

| Shared Package        | Dependents                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@toeverything/infra` | `@affine/core`, `@affine/web`, `@affine/electron`, `@affine/mobile`, `@affine/ios`, `@affine/android`, `@affine/component`, `@affine/admin` |
| `@affine/env`         | `@toeverything/infra`, `@affine/core`, most frontend packages                                                                               |
| `@affine/debug`       | `@toeverything/infra`, `@affine/core`, `@affine/nbstore`                                                                                    |
| `@affine/error`       | `@toeverything/infra`, `@affine/core`                                                                                                       |
| `@affine/graphql`     | `@affine/core`, `@affine/admin`, `@affine/server` (dev)                                                                                     |
| `yjs`                 | `@toeverything/infra`, `@affine/core`, `@affine/server`, `@blocksuite/store`                                                                |

---

## External Service Integrations

```mermaid
graph LR
    SERVER["@affine/server"]

    SERVER --> PG["PostgreSQL<br/>(Prisma ORM)"]
    SERVER --> REDIS["Redis<br/>(Cache + BullMQ Jobs)"]
    SERVER --> S3["S3-Compatible Storage<br/>(Blobs)"]
    SERVER --> STRIPE["Stripe<br/>(Payments)"]
    SERVER --> OTEL["OpenTelemetry<br/>(Traces + Metrics)"]
    SERVER --> SENTRY["Sentry<br/>(Error Tracking)"]
    SERVER --> TURNSTILE["Cloudflare Turnstile<br/>(Captcha)"]

    subgraph "AI Providers"
        OPENAI["OpenAI"]
        ANTHROPIC["Anthropic"]
        GOOGLE["Google Vertex AI"]
        PERPLEXITY["Perplexity"]
        FAL["Fal.ai<br/>(Image Gen)"]
    end

    SERVER --> OPENAI
    SERVER --> ANTHROPIC
    SERVER --> GOOGLE
    SERVER --> PERPLEXITY
    SERVER --> FAL

    subgraph "OAuth Providers"
        GOOGLE_AUTH["Google OAuth"]
        GITHUB_AUTH["GitHub OAuth"]
    end

    SERVER --> GOOGLE_AUTH
    SERVER --> GITHUB_AUTH

    SERVER --> CUSTOMERIO["Customer.io<br/>(Email Marketing)"]
    SERVER --> MIXPANEL["Mixpanel<br/>(Analytics)"]
    SERVER --> GCP["Google Cloud<br/>(Trace Export)"]
    SERVER --> EXA["Exa Search"]
```

---

## Rust Crate Dependencies

```mermaid
graph TD
    NATIVE_FE["affine_native<br/>(Frontend NAPI)"]
    NATIVE_SRV["@affine/server-native<br/>(Server NAPI)"]
    NBSTORE_RS["affine_nbstore"]
    SCHEMA_RS["affine_schema"]
    SQLITE_V1["affine_sqlite_v1"]
    MEDIA["affine_media_capture"]
    MOBILE["affine_mobile_native"]
    COMMON["affine_common"]
    Y_OCTO["y-octo"]
    Y_OCTO_UTILS["y-octo-utils"]

    NATIVE_FE --> NBSTORE_RS
    NATIVE_FE --> SCHEMA_RS
    NATIVE_FE --> MEDIA
    NATIVE_FE --> COMMON
    NBSTORE_RS --> Y_OCTO
    NBSTORE_RS --> COMMON
    SCHEMA_RS --> Y_OCTO
    SQLITE_V1 --> Y_OCTO
    Y_OCTO_UTILS --> Y_OCTO
    MOBILE --> COMMON
    NATIVE_SRV --> Y_OCTO
    NATIVE_SRV --> COMMON
```
