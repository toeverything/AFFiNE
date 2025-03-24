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
    .package(path: "../MarkdownParserCore"),
    .package(url: "https://github.com/JohnSundell/Splash", from: "0.16.0"),
  ],
  targets: [
    .target(name: "MarkdownView", dependencies: [
      "MarkdownParser",
      "Splash",
    ]),
    .target(name: "MarkdownParser", dependencies: [
      .product(name: "MarkdownParserCore", package: "MarkdownParserCore"),
      .product(name: "MarkdownParserCoreExtension", package: "MarkdownParserCore"),
    ]),
  ]
)
