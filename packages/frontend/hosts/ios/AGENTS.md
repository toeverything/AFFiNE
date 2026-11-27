# Working in `packages/frontend/hosts/ios/` (for agents)

This directory holds the zero-CocoaPods iOS thin host for AFFiNE.
It bridges `UIKit`, `CAMetalLayer`, ProMotion `CADisplayLink`, `UITextInput`, native teardrop selection handles and magnifier loupe (`SelectionOverlayView`), per-frame keyboard avoidance (`KeyboardAvoidanceCoordinator`), system `PDFKit` page rasterization (`PdfRendererBridge`), and UIKit haptics (`HapticsBridge`) to the Rust client workspace through a C ABI.

## Hard boundaries

- Do not add `Podfile`, `Podfile.lock`, or `package.json` in `packages/frontend/hosts/ios/`.
- Keep the main app shell free of any persistent `WKWebView`.
- Use `LegacyLocalStorageProbe.swift` only as a one-shot sentinel and rollback writer under `capacitor://localhost` for whitelisted `localStorage` keys. Keep the `window.indexedDB` runtime trap active so IndexedDB access stays strictly zero.
- Share `<Documents>/workspaces/<spaceType>/<sanitizedPeer>/<spaceId>.db` in place through `affine-store` and mount local workspaces strictly from the `affine-local-workspace` allowlist without scanning disk for `*.db` files.
- Keep `LegacyAuthBridge.swift` and `src/auth.rs` aligned with Keychain service `app.affine.pro.auth-token` (2001 reference epoch `f64` timestamps) and `UserDefaults` key `app.affine.pro.auth-installation-id`.
- Keep `SelectionOverlayView.swift` pure `UIView`/`CALayer` (zero `WKWebView`), drive all handle/loupe geometry from Rust `src/selection.rs`, and render the live pure-Rust GPU `PlaygroundView` directly through `IosEditorPlatform` + `MetalRenderer`'s `CAMetalLayer` (`affine_ios_host_metal_layer`) with zero `HostTextPreviewView` subview mounted in `MetalHostViewController` and zero host-side `backingText` copy (`UITextInput` reads directly from `PlatformInputHandler` via `affine_ios_host_utf16_len`/`copy_utf16` and receives editor mutations through `affine_ios_host_set_text_input_callback`).
- Stage-1 touch defaults apply via `FormFactor::from_ios_idiom` (`UIDevice.current.userInterfaceIdiom == .pad` -> `Tablet`, otherwise `Phone`): `edgeless_readonly = true`, `database_readonly = true`, `page_readonly = false`.
- Use `scripts/package-sim-app.sh` to assemble an installable `AffineIosHost.app` bundle for the iOS Simulator.
- Keep `KeyboardAvoidanceCoordinator.swift` aligned with `ui::WindowInsets::effective()` (`ime_bottom` is the absolute docked keyboard overlap from the window bottom edge, `effective_bottom = max(safe_bottom, ime_bottom)`, and `affine_ios_host_ime_above_safe_bottom` exposes `max(0, ime_bottom - safe_bottom)` to avoid double-deducting safe area), returning `0` for floating, split, and external hardware keyboards.
- Keep `PdfRendererBridge.swift` backed by Apple's system `PDFKit` framework (zero C++ PDFium) with explicit `affine_ios_host_pdf_open`/`close` document handles (zero persistent cache) and enforce the shared Rust header, page-bounds, and pixel-budget limits in `src/pdf.rs`.
- Pin Rust builds in `scripts/build-rust-ios.sh` to `rustup run 1.98.1`, `--manifest-path packages/frontend/Cargo.toml`, and `CARGO_ENCODED_RUSTFLAGS=""`. Never modify `packages/frontend/apps/ios/` (`1.97.1`).

## Verification

On macOS with Xcode installed, build `libaffine_ios_host.a` and link the Swift host executable against the iOS Simulator SDK:

```sh
CARGO_ENCODED_RUSTFLAGS="" rustup run 1.98.1 cargo build --locked \
  --manifest-path packages/frontend/Cargo.toml -p affine-ios-host \
  --target aarch64-apple-ios-sim
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
swiftc -emit-executable -sdk "$SDK" -target arm64-apple-ios16.0-simulator \
  -import-objc-header packages/frontend/hosts/ios/include/affine_mobile_host.h \
  -L packages/frontend/target/aarch64-apple-ios-sim/debug -laffine_ios_host \
  -framework UIKit -framework QuartzCore -framework Metal -framework WebKit \
  -o /tmp/AffineIosHost packages/frontend/hosts/ios/Sources/*.swift
```
