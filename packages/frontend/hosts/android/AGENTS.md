# Working in `packages/frontend/hosts/android/` (for agents)

This directory holds the thin Android host for AFFiNE (`affine-android-host`).
It combines a hand-written JNI Rust crate with a minimal Kotlin `SurfaceView` activity.

## Hard boundaries

- Keep zero JNA and zero UniFFI bindings. Export hand-written `extern "C"` JNI symbols under `#[cfg(any(target_os = "android", test, feature = "host-jni"))]`.
- Keep the main app shell free of any persistent `WebView`.
- Gate `AutofillManager` integration at API 26 (`should_expose_autofill(sdk_int)` returns `sdk_int >= 26`).
- Parse legacy `https://localhost` `localStorage` probe payloads through `parse_legacy_local_storage_probe` using an explicit key allowlist only. Never access IndexedDB.
- Keep `src/lib.rs` at or below 800 non-test lines and free of wall-clock calls.

## Verification

Always clear inherited root rustflags:

```sh
CARGO_ENCODED_RUSTFLAGS="" cargo test --locked -p affine-android-host
CARGO_ENCODED_RUSTFLAGS="" cargo build --locked -p affine-android-host --features host-jni
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p affine-android-host --target aarch64-linux-android
CARGO_ENCODED_RUSTFLAGS="" cargo check --locked -p affine-android-host --target x86_64-linux-android
```

To run the real Kotlin-to-JNI parity harness on a host with `kotlinc` and `ANDROID_HOME`:

```sh
kotlinc -classpath "$ANDROID_JAR" -d /tmp/affine-android-kotlin \
  hosts/android/kotlin/app/affine/pro/host/MainActivity.kt \
  hosts/android/kotlin/app/affine/pro/host/LegacyLocalStorageProbe.kt \
  hosts/android/tests/ImeHostParityCheck.kt
kotlin -J-Djava.library.path="$PWD/target/debug" -cp "/tmp/affine-android-kotlin:$ANDROID_JAR" ImeHostParityCheckKt
```
