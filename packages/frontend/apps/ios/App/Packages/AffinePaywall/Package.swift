// swift-tools-version: 6.2
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
  name: "AffinePaywall",
  platforms: [
    .iOS(.v16),
    .macOS(.v14), // just for build so LLM can verify their code
  ],
  products: [
    .library(
      name: "AffinePaywall",
      targets: ["AffinePaywall"]
    ),
  ],
  dependencies: [
    .package(path: "../AffineResources"),
  ],
  targets: [
    .target(
      name: "AffinePaywall",
      dependencies: ["AffineResources"],
    ),
  ]
)
