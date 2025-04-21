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
    .package(path: "../AffineGraphQL"),
    .package(path: "../MarkdownView"),
    .package(url: "https://github.com/apollographql/apollo-ios.git", from: "1.20.0"),
    .package(url: "https://github.com/LaunchDarkly/swift-eventsource.git", from: "3.3.0"),
    .package(url: "https://github.com/apple/swift-collections", from: "1.1.4"),
    .package(url: "https://github.com/Lakr233/ChidoriMenu", from: "2.4.3"),
  ],
  targets: [
    .target(name: "Intelligents", dependencies: [
      "AffineGraphQL",
      "ChidoriMenu",
      "MarkdownView",
      "ChidoriMenu",
      .product(name: "Apollo", package: "apollo-ios"),
      .product(name: "LDSwiftEventSource", package: "swift-eventsource"),
      .product(name: "OrderedCollections", package: "swift-collections"),
    ]),
  ]
)
