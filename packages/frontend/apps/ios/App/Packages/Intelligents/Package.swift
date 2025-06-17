// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
  name: "Intelligents",
  defaultLocalization: "en",
  platforms: [
    .iOS(.v17),
  ],
  products: [
    .library(name: "Intelligents", targets: ["Intelligents"]),
  ],
  dependencies: [
    .package(path: "../AffineGraphQL"),
    .package(url: "https://github.com/apollographql/apollo-ios.git", from: "1.18.0"),
    .package(url: "https://github.com/apple/swift-collections", from: "1.2.0"),
    .package(url: "https://github.com/devxoul/Then", from: "3.0.0"),
    .package(url: "https://github.com/SnapKit/SnapKit.git", from: "5.0.1"),
  ],
  targets: [
    .target(name: "Intelligents", dependencies: [
      "AffineGraphQL",
      "SnapKit",
      "Then",
      .product(name: "Apollo", package: "apollo-ios"),
      .product(name: "OrderedCollections", package: "swift-collections"),
    ]),
  ]
)
