// swift-tools-version: 5.8
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
  name: "ChidoriMenu",
  platforms: [.iOS(.v15), .macCatalyst(.v15)],
  products: [
    .library(
      name: "ChidoriMenu",
      targets: ["ChidoriMenu"]
    ),
  ],
  targets: [
    .target(name: "ChidoriMenu"),
  ]
)
