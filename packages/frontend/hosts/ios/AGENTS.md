# Working in `packages/frontend/hosts/ios/` (for agents)

This directory holds the zero-CocoaPods iOS thin host for AFFiNE.
It bridges `UIKit`, `CAMetalLayer`, ProMotion `CADisplayLink`, and `UITextInput` to the Rust client workspace through a C ABI.

## Hard boundaries

- Do not add `Podfile`, `Podfile.lock`, or `package.json` in `packages/frontend/hosts/ios/`.
- Keep the main app shell free of any persistent `WKWebView`.
- Use `LegacyLocalStorageProbe.swift` only as a one-shot sentinel and rollback writer under `capacitor://localhost` for whitelisted `localStorage` keys. Keep the `window.indexedDB` runtime trap active so IndexedDB access stays strictly zero.
- Share `<Documents>/workspaces/<spaceType>/<sanitizedPeer>/<spaceId>.db` in place through `affine-store` and mount local workspaces strictly from the `affine-local-workspace` allowlist without scanning disk for `*.db` files.
- Keep `LegacyAuthBridge.swift` and `src/auth.rs` aligned with Keychain service `app.affine.pro.auth-token` (2001 reference epoch `f64` timestamps) and `UserDefaults` key `app.affine.pro.auth-installation-id`.
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
