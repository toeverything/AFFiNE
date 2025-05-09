// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
  name: "Intelligents",
  defaultLocalization: "en",
  platforms: [
    .iOS(.v15),
    .macCatalyst(.v15),
  ],
  products: [
    .library(name: "Intelligents", targets: ["Intelligents"]),
  ],
  dependencies: [
    .package(url: "https://github.com/gonzalezreal/swift-markdown-ui", from: "2.4.1"),
    .package(url: "https://github.com/Lakr233/SpringInterpolation", from: "1.3.0"),
    .package(url: "https://github.com/Lakr233/MSDisplayLink", from: "2.0.8"),
  ],
  targets: [
    .target(name: "Intelligents", dependencies: [
      "SpringInterpolation",
      "MSDisplayLink",
      .product(name: "MarkdownUI", package: "swift-markdown-ui"),
    ]),
  ]
)
