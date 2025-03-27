// swift-tools-version:5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

/*

 The main purpose to fork this library is for adding streamed parser support.

 Suppose we add a new function:
    - cmark_parser *cmark_parser_fork(cmark_parser *parser);

 In this way we can call `cmark_parser_finish` to get the result without redo the entire document.

 But it is over my ability to implement this function. The parser class is too complex to manage.

 */

let cSettings: [CSetting] = [
    .define("CMARK_THREADING"),
]

let package = Package(
    name: "MarkdownParserCore",
    products: [
        .library(name: "MarkdownParserCore", targets: ["cmark-gfm"]),
        .library(name: "MarkdownParserCoreExtension", targets: ["cmark-gfm-extensions"]),
    ],
    targets: [
        .target(
            name: "cmark-gfm",
            path: "src",
            cSettings: cSettings
        ),
        .target(
            name: "cmark-gfm-extensions",
            dependencies: ["cmark-gfm"],
            path: "extensions",
            cSettings: cSettings
        ),
    ]
)
