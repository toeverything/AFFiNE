# Working in `packages/frontend/hosts/android/` (for agents)

This directory holds the thin Android host for AFFiNE (`affine-android-host`).
It combines a hand-written JNI Rust crate with a minimal Kotlin `SurfaceView` activity.

## Hard boundaries

- Keep zero JNA and zero UniFFI bindings.
  Export hand-written `extern "C"` JNI symbols under `#[cfg(any(target_os = "android", test, feature = "host-jni"))]`.
- Keep the main app shell free of any persistent `WebView` and free of `SurfaceHolder.lockCanvas` calls.
- Gate `AutofillManager` integration at API 26 (`should_expose_autofill(sdk_int)` returns `sdk_int >= 26`).
- Open in-place SQLite WAL databases only from the ordered `affine-local-workspace` allowlist.
  Never scan disk `*.db` files to discover local workspaces.
- Store auth sessions in `<filesDir>/datastore/auth-sessions.preferences_pb` using `v1:<base64_iv>:<base64_ct_tag>` AES-GCM envelopes, 1970 Unix millisecond `i64` timestamps, and the persisted `auth-installation-id` key.
- Parse legacy `https://localhost` `localStorage` probe and rollback write-back payloads through `parse_legacy_local_storage_probe` using an explicit key allowlist only.
  Block `window.indexedDB.open` and `window.indexedDB.deleteDatabase` in every probe script.
- Keep every `.rs` file at or below 800 non-test lines, free of non-test `super::super::`, and free of wall-clock calls.

## Verification

Always clear inherited root rustflags:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked -p affine-android-host --all-features
CARGO_ENCODED_RUSTFLAGS="" cargo build --locked -p affine-android-host --features host-jni
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p affine-android-host --target aarch64-linux-android
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p affine-android-host --target x86_64-linux-android
```

To run the real Kotlin-to-JNI parity harness on a host with `kotlinc` and `ANDROID_HOME`:

```sh
kotlinc -classpath "$ANDROID_JAR" -d /tmp/affine-android-kotlin \
  hosts/android/kotlin/app/affine/pro/host/MainActivity.kt \
  hosts/android/kotlin/app/affine/pro/host/LegacyLocalStorageProbe.kt \
  hosts/android/kotlin/app/affine/pro/host/AndroidBootstrapCoordinator.kt \
  hosts/android/kotlin/app/affine/pro/host/AuthDataStore.kt \
  hosts/android/tests/ImeHostParityCheck.kt
kotlin -J-Djava.library.path="$PWD/target/debug" -cp "/tmp/affine-android-kotlin:$ANDROID_JAR" ImeHostParityCheckKt
```
