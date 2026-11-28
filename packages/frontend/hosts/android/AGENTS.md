# Working in `packages/frontend/hosts/android/` (for agents)

This directory holds the thin Android host for AFFiNE (`affine-android-host`).
It combines a hand-written JNI Rust crate with a minimal Kotlin `SurfaceView` activity.

## Hard boundaries

- Keep zero JNA and zero UniFFI bindings.
  Export hand-written `extern "C"` JNI symbols under `#[cfg(any(target_os = "android", test, feature = "host-jni"))]` across `src/jni_bridge.rs`, `src/jni_interaction.rs`, and `src/jni_storage.rs`.
- Keep the main app shell free of any persistent `WebView` and free of `SurfaceHolder.lockCanvas` calls.
- Mount the live pure-Rust `PlaygroundView` (`src/editor_platform.rs`, `src/editor_runtime.rs`, `src/editor_selection.rs`, `src/jni_editor.rs`, with `native_selection_ui = true`) inside `MainActivity` (`AffineSurfaceView` + `DocumentSelectionHandleView`, with `HostTextPreviewView` and the custom `Copy | Cut` capsule removed from `MainActivity`). Drive GPU document-level teardrop handles, system `android.widget.Magnifier` (API 28+), system `ActionMode.TYPE_FLOATING` (`ActionMode.Callback2.onGetContentRect` + `onPrepareActionMode` gated by Rust `action_mask`), and multi-MIME `ClipboardManager` (`ClipData.newHtmlText` carrying embedded `data-blocksuite-snapshot` + plain text) from Rust `PlaygroundView`, hiding handles/Magnifier/ActionMode whenever `documentBufferController.isAutofillFocused()` is true. Forward `MotionEvent` touch pointers (`nativeOnTouchEvent`), `InputConnection.sendKeyEvent` (`nativeOnKeyEvent`), and `FormFactor::from_android_smallest_width_dp` (`< 600` -> `Phone`, `>= 600` -> `Tablet`, Stage-1 `edgeless_readonly = true`, `database_readonly = true`).
- Enforce zero host text copy (`AffineInputConnection` reads straight from `PlatformInputHandler`), push editor mutations to `InputMethodManager.updateSelection` / `restartInput` / `updateCursorAnchorInfo`, and preserve exact `[start, end)` ranges in `setComposingRegion` via `replace_and_mark_text_in_range`.
- Use `scripts/package-debug-apk.sh` to build and sign `AffineAndroidHost-debug.apk` directly with Android SDK CLI tools (`aapt2`, `kotlinc`, `d8`, `zipalign`, `apksigner`) without Gradle daemons.
  Compute teardrop handle geometry, line-midpoint grab-offset drag, UTF-16 anchor-authoritative handle ownership (`nativeApplyTextDragEndpoints`), continuous zero-length crossover inversion, off-screen hiding, line-midpoint magnifier focus, and Copy/Cut/Paste/SelectAll actions wired to `ClipboardManager` (`HostClipboard` / `AndroidClipboardAdapter`, checking `primaryClipDescription` metadata without reading `primaryClip` during draw, and writing before deleting on `Cut`) and `InputConnection.performContextMenuAction` in `src/selection.rs`, `src/ime.rs`, and `MainActivity.kt`.
  `AndroidSelectionOverlayView` fills a pre-allocated 24-float JNI buffer (`nativeFillSelectionOverlayGeometry`) and draws teardrop `Path` handles, `getSelectionPath` loupe highlights with centered focus carets, and `Copy | Cut | Paste` pills with dividers using zero per-frame allocations, zero Binder IPC in `onDraw`, and zero `SurfaceHolder.lockCanvas` calls.
- Clear the default surface canvas to light `#FAFAFC` (`DEFAULT_CLEAR_COLOR_ARGB = 0xFFFA_FAFC`) and adapt `HostTextPreviewView` text and selection colors to surface luminance.
  Preserve viewport size, display density, scroll offset, IME state, and texture generation across `surfaceDestroyed -> surfaceCreated -> surfaceChanged` recreation while gating `is_ready()` on per-generation `surfaceChanged` configuration (`configured_for_generation`).
  `SurfaceLifecycleState` models `Vulkan -> Gles3 -> CpuFallback` downgrade on device loss; the current `android_window` runtime probe returns `(false, true)` and starts on EGL/GLES3 with CPU fallback.
- Gate `AutofillManager` virtual view structure and per-field isolated value write-back at API 26 (`should_expose_autofill(sdk_int)` returns `sdk_int >= 26`, `IMPORTANT_FOR_AUTOFILL_YES` on `AffineSurfaceView`, implemented in `src/autofill.rs` and `AndroidAutofillController`).
  Never emit synthetic placeholder asterisks or spaces in `ViewStructure`, update IME only when `autofillId == focusedFieldId`, sync manual `InputConnection` edits back to the focused Autofill field via `onFocusedTextEdited`, isolate form credentials from `HostDocumentStore` and `HostTextPreviewView` via `HostDocumentBufferController`, redact sensitive values in `Debug`, and zero cached plaintext on `commit`, `cancel`, and `clear_fields`.
- Dispatch four-phase predictive back (`Start`, `Progress`, `Cancel`, `Commit`) on API 34+ (`OnBackAnimationCallback`, including standalone button/key `onBackInvoked` calls) and single-step atomic commit on API 24-33 (`OnBackInvokedCallback` / `onBackPressed`) against a real destination route stack (`BackNavigationState`) and `HostDocumentStore` driven by `MainActivity.navigateTo` and `MainActivity.openDocument`, blocking re-entrant commits and returning `false` at the root route.
- Render PDF pages in place through `android.graphics.pdf.PdfRenderer` (`AndroidPdfPageRenderer`) with pre-validated Rust bounds, OOM cap (`4096x4096`), clamped `dpi_bucket >= 72` cache keys, and zero-Rust-heap chunked streaming `ARGB_8888 -> RGBA8` conversion with per-call JNI `ExceptionCheck` in `src/pdf.rs` and `src/jni_interaction.rs`.
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
```

To run the 22-sequence Kotlin-to-JNI parity harness on a host with `kotlinc` and `ANDROID_HOME`:

```sh
kotlinc -classpath "$ANDROID_JAR" -d /tmp/affine-android-kotlin \
  hosts/android/kotlin/app/affine/pro/host/MainActivity.kt \
  hosts/android/kotlin/app/affine/pro/host/LegacyLocalStorageProbe.kt \
  hosts/android/kotlin/app/affine/pro/host/AndroidBootstrapCoordinator.kt \
  hosts/android/kotlin/app/affine/pro/host/AuthDataStore.kt \
  hosts/android/kotlin/app/affine/pro/host/ShareIntentBridge.kt \
  hosts/android/tests/ImeHostParityCheck.kt
kotlin -J-Djava.library.path="$PWD/target/debug" -cp "/tmp/affine-android-kotlin:$ANDROID_JAR" ImeHostParityCheckKt
```
