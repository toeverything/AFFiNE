//
//  CodeBlockView.swift
//  MarkdownView
//
//  Created by 秋星桥 on 2025/1/3.
//

import MarkdownParser
import Splash
import UIKit

class CodeBlockView: BlockView {
  let backgroundView = UIView()
  let fenceView = UIView()
  let fenceLabel = TextLabel()
  let fenceCopyButton = UIButton()
  let scrollView = UIScrollView()
  let codeTextView = TextLabel()

  var manifest: Manifest { _manifest as! Manifest }

  override func viewDidLoad() {
    super.viewDidLoad()
    clipsToBounds = true
    layer.cornerRadius = 8
    layer.masksToBounds = true

    addSubview(backgroundView)
    backgroundView.backgroundColor = .gray.withAlphaComponent(0.05)

    addSubview(fenceView)
    fenceView.backgroundColor = .gray.withAlphaComponent(0.05)

    addSubview(fenceCopyButton)
    fenceCopyButton.setImage(UIImage(systemName: "doc.on.doc"), for: .normal)
    fenceCopyButton.tintColor = .label
    fenceCopyButton.addTarget(self, action: #selector(copyButtonTapped), for: .touchUpInside)
    fenceCopyButton.imageView?.contentMode = .scaleAspectFit

    addSubview(fenceLabel)
    fenceLabel.isSelectable = false
    fenceLabel.textColor = .label
    fenceLabel.font = .preferredFont(forTextStyle: .caption1)
    fenceLabel.textAlignment = .left

    addSubview(scrollView)
    scrollView.showsVerticalScrollIndicator = false
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.addSubview(codeTextView)

    scrollView.clipsToBounds = false
    scrollView.layer.masksToBounds = false
    scrollView.bringSubviewToFront(codeTextView)
  }

  override func viewDidLayout() {
    super.viewDidLayout()
    backgroundView.frame = bounds
    fenceView.frame = manifest.fenceRect
    fenceLabel.frame = manifest.fenceLabelRect
    fenceCopyButton.frame = manifest.fenceCopyButtonRect
    scrollView.frame = manifest.scrollRect
    codeTextView.frame = manifest.codeContentRect
    scrollView.contentSize = manifest.scrollableContentSize
  }

  override func viewDidUpdate() {
    super.viewDidUpdate()
    fenceLabel.attributedText = manifest.fenceInfo
    codeTextView.attributedText = manifest.content
  }

  @objc func copyButtonTapped() {
    UIPasteboard.general.string = manifest.content.string
    fenceCopyButton.setImage(UIImage(systemName: "checkmark"), for: .normal)
    NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(setButtonImageBack), object: nil)
    perform(#selector(setButtonImageBack), with: nil, afterDelay: 1)
  }

  @objc func setButtonImageBack() {
    fenceCopyButton.setImage(UIImage(systemName: "doc.on.doc"), for: .normal)
  }

  override func accept(_ manifest: AnyBlockManifest) -> Bool {
    manifest is Manifest
  }
}

extension CodeBlockView {
  class Manifest: BlockManifest {
    var size: CGSize = .zero
    var theme: Theme = .default
    var dirty: Bool = true

    var intrinsicWidth: CGFloat {
      content.measureWidth() + spacings.general * 4
    }

    var fenceInfo: NSAttributedString = .init()
    var content: NSAttributedString = .init()

    var fenceRect: CGRect = .zero
    var fenceCopyButtonRect: CGRect = .zero
    var fenceLabelRect: CGRect = .zero
    var scrollRect: CGRect = .zero
    var codeContentRect: CGRect = .zero
    var scrollableContentSize: CGSize = .zero

    required init() {}

    var block: BlockNode? = nil
    func load(block: BlockNode) {
      guard self.block != block else { return }
      dirty = true
      self.block = block
      guard case let .codeBlock(info, content) = block else {
        assertionFailure()
        return
      }
      var infoText: String = info ?? ""
      infoText = infoText.trimmingCharacters(in: .whitespacesAndNewlines)
      if infoText.isEmpty { infoText = "#" }
      fenceInfo = NSAttributedString(string: infoText, attributes: [
        .font: theme.fonts.code,
        .foregroundColor: theme.colors.body,
        .originalFont: theme.fonts.code,
      ])
      let code = content.trimmingCharacters(in: .whitespacesAndNewlines)
      let codeTheme = theme.codeTheme(withFont: theme.fonts.code)
      let output = AttributedStringOutputFormat(theme: codeTheme)
      let result: NSMutableAttributedString?
      switch info?.lowercased() {
      case "swift":
        let splash = SyntaxHighlighter(format: output, grammar: SwiftGrammar())
        result = splash.highlight(code).mutableCopy() as? NSMutableAttributedString
      default:
        let splash = SyntaxHighlighter(format: output)
        result = splash.highlight(code).mutableCopy() as? NSMutableAttributedString
      }
      let defaultAttrs: [NSAttributedString.Key: Any] = [
        .font: theme.fonts.code,
        .originalFont: theme.fonts.code,
      ]
      result?.addAttributes(defaultAttrs, range: NSRange(location: 0, length: result?.length ?? 0))
      self.content = result ?? .init(string: code, attributes: defaultAttrs)
    }

    func layoutIfNeeded() {
      guard dirty, size.width > 0 else { return }
      defer { dirty = false }
      let fenceLabelHeight = fenceInfo.measureHeight(usingWidth: .greatestFiniteMagnitude)
      let fenceHeight = fenceLabelHeight + spacings.general * 2
      let fenceCopyButtonSize = fenceLabelHeight
      fenceRect = CGRect(
        x: 0,
        y: 0,
        width: size.width,
        height: fenceHeight
      )
      fenceLabelRect = .init(
        x: spacings.general,
        y: spacings.general,
        width: size.width - fenceCopyButtonSize - spacings.general * 2,
        height: fenceLabelHeight
      )
      fenceCopyButtonRect = .init(
        x: size.width - fenceCopyButtonSize - spacings.general,
        y: fenceLabelRect.minY,
        width: fenceCopyButtonSize,
        height: fenceCopyButtonSize
      )
      let contentWidth = content.measureWidth()
      let contentHeight = content.measureHeight(usingWidth: .greatestFiniteMagnitude)
      scrollRect = .init(
        x: 0,
        y: fenceRect.maxY,
        width: size.width,
        height: contentHeight + spacings.general * 2
      )
      size.height = scrollRect.maxY
      codeContentRect = .init(
        x: spacings.general,
        y: spacings.general,
        width: contentWidth + spacings.general * 2,
        height: contentHeight
      )
      scrollableContentSize = .init(
        width: codeContentRect.maxX + spacings.general,
        height: codeContentRect.maxY + spacings.general
      )
    }

    func determineViewType() -> BlockView.Type {
      CodeBlockView.self
    }
  }
}
