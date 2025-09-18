// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
  name: "AffineResources",
  products: [
    .library(
      name: "AffineResources",
      targets: ["AffineResources"]
    ),
  ],
  targets: [
    .target(
      name: "AffineResources",
      resources: [
        .process("Resources/Icons.xcassets"),
        .process("Resources/Colors.xcassets"),
      ]
    ),
  ]
)
