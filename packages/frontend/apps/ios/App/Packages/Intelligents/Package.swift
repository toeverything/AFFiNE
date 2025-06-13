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
    .package(url: "https://github.com/LaunchDarkly/swift-eventsource.git", from: "3.3.0"),
    .package(url: "https://github.com/apple/swift-collections", from: "1.2.0"),
  ],
  targets: [
    .target(name: "Intelligents", dependencies: [
      "AffineGraphQL",
      .product(name: "Apollo", package: "apollo-ios"),
      .product(name: "LDSwiftEventSource", package: "swift-eventsource"),
      .product(name: "OrderedCollections", package: "swift-collections"),
    ]),
  ]
)
