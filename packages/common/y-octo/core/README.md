# Y-Octo

[![test](https://github.com/toeverything/y-octo/actions/workflows/y-octo.yml/badge.svg)](https://github.com/toeverything/y-octo/actions/workflows/y-octo.yml)
[![docs]](https://docs.rs/y-octo/latest/y_octo)
[![crates]](https://crates.io/crates/y-octo)
[![codecov]](https://codecov.io/gh/toeverything/y-octo)

Y-Octo is a high-performance CRDT implementation compatible with [yjs].

## Introduction

Y-Octo is a tiny, ultra-fast CRDT collaboration library built for all major platforms. Developers can use Y-Octo as the [Single source of truth](https://en.wikipedia.org/wiki/Single_source_of_truth) for their application state, naturally turning the application into a [local-first](https://www.inkandswitch.com/local-first/) collaborative app.

Y-Octo also has interoperability and binary compatibility with [yjs]. Developers can use [yjs] to develop local-first web applications and collaborate with Y-Octo in native apps alongside web apps.

## Who are using

<a href="https://affine.pro"><img src="./assets/affine.svg" /></a>

[AFFiNE](https://affine.pro) is using y-octo in production. There are [Electron](https://affine.pro/download) app and [Node.js server](https://github.com/toeverything/AFFiNE/tree/canary/packages/backend/native) using y-octo in production.

<a href="https://www.mysc.app/"><img src="https://www.mysc.app/images/logo_blk.webp" width="120px" /></a>

[Mysc](https://www.mysc.app/) is using y-octo in the Rust server, and the iOS/Android client via the Swift/Kotlin bindings (Official bindings coming soon).

## Features

- ✅ Collaborative Text
  - ✅ Read and write styled Unicode compatible data.
  - 🚧 Add, modify and delete text styles.
  - 🚧 Embedded JS data types and collaborative types.
  - ✅ Collaborative types of thread-safe.
- Collaborative Array
  - ✅ Add, modify, and delete basic JS data types.
  - ✅ Recursively add, modify, and delete collaborative types.
  - ✅ Collaborative types of thread-safe.
  - 🚧 Recursive event subscription
- Collaborative Map
  - ✅ Add, modify, and delete basic JS data types.
  - ✅ Recursively add, modify, and delete collaborative types.
  - ✅ Collaborative types of thread-safe.
  - 🚧 Recursive event subscription
- 🚧 Collaborative Xml (Fragment / Element)
- ✅ Collaborative Doc Container
  - ✅ YATA CRDT state apply/diff compatible with [yjs]
  - ✅ State sync of thread-safe.
  - ✅ Store all collaborative types and JS data types
  - ✅ Update event subscription.
  - 🚧 Sub Document.
- ✅ Yjs binary encoding
  - ✅ Awareness encoding.
  - ✅ Primitive type encoding.
  - ✅ Sync Protocol encoding.
  - ✅ Yjs update v1 encoding.
  - 🚧 Yjs update v2 encoding.

## Testing & Linting

Put everything to the test! We've established various test suites, but we're continually striving to enhance our coverage：

- Rust Tests
  - Unit tests
  - [Loom](https://docs.rs/loom/latest/loom/) multi-threading tests
  - [Miri](https://github.com/rust-lang/miri) undefined behavior tests
  - [Address Sanitizer](https://doc.rust-lang.org/beta/unstable-book/compiler-flags/sanitizer.html) memory error detections
  - [Fuzzing](https://github.com/rust-fuzz/cargo-fuzz) fuzzing tests
- Node Tests
- Smoke Tests
- Eslint, Clippy

## Related projects

- [OctoBase]: The open-source embedded database based on Y-Octo.
- [yjs]: Shared data types for building collaborative software in web.

## Maintainers

- [DarkSky](https://github.com/darkskygit)
- [liuyi](https://github.com/forehalo)
- [LongYinan](https://github.com/Brooooooklyn)

## Why not [yrs](https://github.com/y-crdt/y-crdt/)

See [Why we're not using yrs](./y-octo-utils/yrs-is-unsafe/README.md)

## License

Y-Octo are [MIT licensed].

[codecov]: https://codecov.io/gh/toeverything/y-octo/graph/badge.svg?token=9AQY5Q1BYH
[crates]: https://img.shields.io/crates/v/y-octo.svg
[docs]: https://img.shields.io/docsrs/y-octo.svg
[test]: https://github.com/toeverything/y-octo/actions/workflows/y-octo.yml/badge.svg
[yjs]: https://github.com/yjs/yjs
[Address Sanitizer]: https://github.com/toeverything/y-octo/actions/workflows/y-octo-asan.yml/badge.svg
[Memory Leak Detect]: https://github.com/toeverything/y-octo/actions/workflows/y-octo-memory-test.yml/badge.svg
[OctoBase]: https://github.com/toeverything/octobase
[BlockSuite]: https://github.com/toeverything/blocksuite
[AFFiNE]: https://github.com/toeverything/affine
[MIT licensed]: ./LICENSE
