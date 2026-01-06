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
    // static linking is required or GraphQL (ApolloAPI) will crash
    .library(name: "Intelligents", type: .static, targets: ["Intelligents"]),
  ],
  dependencies: [
    .package(path: "../AffineGraphQL"),
    .package(path: "../AffineResources"),
    .package(url: "https://github.com/apollographql/apollo-ios.git", from: "1.23.0"),
    .package(url: "https://github.com/apple/swift-collections.git", from: "1.3.0"),
    .package(url: "https://github.com/SnapKit/SnapKit.git", from: "5.7.1"),
    .package(url: "https://github.com/SwifterSwift/SwifterSwift.git", from: "6.2.0"),
    .package(url: "https://github.com/Recouse/EventSource.git", from: "0.1.5"),
    .package(url: "https://github.com/Lakr233/ListViewKit.git", from: "1.1.8"),
    .package(url: "https://github.com/Lakr233/MarkdownView.git", from: "3.4.7"),
  ],
  targets: [
    .target(name: "Intelligents", dependencies: [
      "AffineGraphQL",
      "AffineResources",
      "SnapKit",
      "SwifterSwift",
      .product(name: "Apollo", package: "apollo-ios"),
      .product(name: "OrderedCollections", package: "swift-collections"),
      "ListViewKit",
      "MarkdownView",
      "EventSource",
    ], resources: [
      .process("Resources/main.metal"),
      .process("Resources/Media.xcassets"),
      .process("Interface/View/InputBox/InputBox.xcassets"),
      .process("Interface/Controller/AttachmentManagementController/AttachmentIcon.xcassets"),
    ]),
  ]
)
