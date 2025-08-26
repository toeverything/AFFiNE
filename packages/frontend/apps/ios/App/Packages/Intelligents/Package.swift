// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
  name: "Intelligents",
  defaultLocalization: "en",
  platforms: [
    .iOS(.v16),
  ],
  products: [
    .library(name: "Intelligents", type: .dynamic, targets: ["Intelligents"]),
  ],
  dependencies: [
    .package(path: "../AffineGraphQL"),
    .package(url: "https://github.com/apollographql/apollo-ios.git", from: "1.22.0"),
    .package(url: "https://github.com/apple/swift-collections", from: "1.2.0"),
    .package(url: "https://github.com/devxoul/Then", from: "3.0.0"),
    .package(url: "https://github.com/SnapKit/SnapKit.git", from: "5.7.1"),
    .package(url: "https://github.com/SwifterSwift/SwifterSwift.git", from: "6.0.0"),
    .package(url: "https://github.com/Recouse/EventSource", from: "0.1.4"),
    .package(url: "https://github.com/Lakr233/ListViewKit", from: "1.1.6"),
    .package(url: "https://github.com/Lakr233/MarkdownView", from: "3.4.1"),
  ],
  targets: [
    .target(name: "Intelligents", dependencies: [
      "AffineGraphQL",
      "SnapKit",
      "Then",
      "SwifterSwift",
      .product(name: "Apollo", package: "apollo-ios"),
      .product(name: "OrderedCollections", package: "swift-collections"),

      "ListViewKit",
      "MarkdownView",
      "EventSource",
    ], resources: [
      .process("Interface/View/InputBox/InputBox.xcassets"),
      .process("Interface/Controller/AttachmentManagementController/AttachmentIcon.xcassets"),
    ]),
  ]
)
