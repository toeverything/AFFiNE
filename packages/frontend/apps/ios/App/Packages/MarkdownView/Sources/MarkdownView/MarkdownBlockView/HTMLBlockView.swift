////
////  HTMLBlockView.swift
////  MarkdownView
////
////  Created by 秋星桥 on 2025/1/3.
////
//
// import Foundation
// import MarkdownParser
// import UIKit
//
// class HTMLBlockView: BlockView {
//    let text = TextView()
//    var manifest: Manifest { _manifest as! Manifest }
//
//    override func viewDidLoad() {
//        super.viewDidLoad()
//        addSubview(text)
//        text.isEditable = false
//        text.isSelectable = true
//        text.isScrollEnabled = false
//    }
//
//    override func viewDidLayout() {
//        super.viewDidLayout()
//        text.frame = manifest.contentRect
//    }
//
//    override func viewDidUpdate() {
//        super.viewDidUpdate()
//        text.attributedText = manifest.content
//    }
//
//    override func accept(_ manifest: AnyBlockManifest) -> Bool {
//        manifest is Manifest
//    }
// }
//
// extension HTMLBlockView {
//    class Manifest: BlockManifest {
//        var size: CGSize = .zero
//        var theme: Theme = .default
//        var dirty: Bool = true
//
//        var intrinsicWidth: CGFloat {
//            size.width
//        }
//
//        var content: NSMutableAttributedString = .init()
//        var contentRect: CGRect = .zero
//
//        required init() {}
//
//        var block: BlockNode? = nil
//        func load(block: BlockNode) {
//            guard self.block != block else { return }
//            dirty = true
//            self.block = block
//            guard case let .htmlBlock(contents) = block else {
//                assertionFailure()
//                return
//            }
//            let htmlData = NSString(string: contents).data(using: String.Encoding.unicode.rawValue)
//            let options = [NSAttributedString.DocumentReadingOptionKey.documentType: NSAttributedString.DocumentType.html]
//            let ans = try? NSMutableAttributedString(
//                data: htmlData ?? Data(),
//                options: options,
//                documentAttributes: nil
//            )
//            let content = ans ?? .init()
//            content.addAttributes(
//                [.originalFont: theme.fonts.body],
//                range: .init(location: 0, length: content.length)
//            )
//            self.content = content
//        }
//
//        func layoutIfNeeded() {
//            guard dirty, size.width > 0 else { return }
//            defer { dirty = false }
//            let textHeight = content.measureHeight(usingWidth: size.width)
//            contentRect = .init(x: 0, y: 0, width: size.width, height: textHeight)
//            size.height = textHeight
//        }
//
//        func determineViewType() -> BlockView.Type {
//            HTMLBlockView.self
//        }
//    }
// }
