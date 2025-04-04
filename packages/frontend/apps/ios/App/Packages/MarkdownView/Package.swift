// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
  name: "MarkdownView",
  platforms: [
    .iOS(.v14),
    .macCatalyst(.v14),
  ],
  products: [
    .library(name: "MarkdownView", targets: ["MarkdownView"]),
  ],
  dependencies: [
    .package(url: "https://github.com/JohnSundell/Splash", from: "0.16.0"),
    .package(url: "https://github.com/swiftlang/swift-cmark", from: "0.6.0"),
  ],
  targets: [
    .target(name: "MarkdownView", dependencies: [
      "MarkdownParser",
      "Splash",
    ]),
    .target(name: "MarkdownParser", dependencies: [
      .product(name: "cmark-gfm", package: "swift-cmark"),
      .product(name: "cmark-gfm-extensions", package: "swift-cmark"),
    ]),
  ]
)
