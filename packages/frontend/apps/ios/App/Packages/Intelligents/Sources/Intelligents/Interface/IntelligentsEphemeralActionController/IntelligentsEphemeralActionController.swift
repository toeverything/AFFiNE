//
//  IntelligentsEphemeralActionController.swift
//  Intelligents
//
//  Created by 秋星桥 on 2025/1/8.
//

import LDSwiftEventSource
import MarkdownParser
import MarkdownView
import UIKit

public class IntelligentsEphemeralActionController: UIViewController {
  let ation: EphemeralAction
  let scrollView = UIScrollView()
  let stackView = UIStackView()

  let header = Header()
  let preview = RotatedImagePreview()

  let markdownView = MarkdownView()
  let indicator = UIActivityIndicatorView(style: .large)
  var responseContainer: UIView = .init()
  var responseHeightAnchor: NSLayoutConstraint?

  let actionBar = ActionBar()

  public var documentID: String = ""
  public var workspaceID: String = ""
  public var documentContent: String = ""
  var sessionID: String = ""

  var chatTask: EventSource?
  var copilotDocumentStorage: String = "" {
    didSet {
      guard copilotDocumentStorage != oldValue else { return }
      updateDocumentPresentationView()
      scrollToBottom()
    }
  }

  public init(action: EphemeralAction) {
    ation = action
    super.init(nibName: nil, bundle: nil)
    title = action.title
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  override public func viewDidLoad() {
    super.viewDidLoad()

    overrideUserInterfaceStyle = .dark
    hideKeyboardWhenTappedAround()
    view.backgroundColor = .systemBackground

    header.titleLabel.text = title
    header.dropMenu.isHidden = true
    header.moreMenu.isHidden = true
    view.addSubview(header)
    header.translatesAutoresizingMaskIntoConstraints = false
    [
      header.topAnchor.constraint(equalTo: view.topAnchor),
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      header.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 44),
    ].forEach { $0.isActive = true }

    view.addSubview(actionBar)
    actionBar.translatesAutoresizingMaskIntoConstraints = false
    [
      actionBar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
      actionBar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
      actionBar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
    ].forEach { $0.isActive = true }

    scrollView.clipsToBounds = true
    scrollView.alwaysBounceVertical = true
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(scrollView)
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    [
      scrollView.topAnchor.constraint(equalTo: header.bottomAnchor),
      scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: actionBar.topAnchor),
    ].forEach { $0.isActive = true }

    let contentView = UIView()
    scrollView.addSubview(contentView)
    contentView.translatesAutoresizingMaskIntoConstraints = false
    [
      contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
      contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
      contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
      contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
      contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor),
      contentView.heightAnchor.constraint(greaterThanOrEqualTo: scrollView.heightAnchor),
    ].forEach { $0.isActive = true }

    contentView.addSubview(stackView)
    stackView.translatesAutoresizingMaskIntoConstraints = false
    stackView.axis = .vertical
    stackView.spacing = 16
    stackView.alignment = .fill
    stackView.distribution = .fill
    contentView.addSubview(stackView)

    let stackViewInset: CGFloat = 8
    [
      stackView.topAnchor.constraint(equalTo: scrollView.topAnchor, constant: stackViewInset),
      stackView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor, constant: stackViewInset),
      stackView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor, constant: -stackViewInset),
      stackView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: -stackViewInset),
    ].forEach { $0.isActive = true }

    setupContentViews()

    actionBar.retryButton.action = { [weak self] in
      self?.beginAction()
    }
  }

  func setupContentViews() {
    defer { stackView.addArrangedSubview(UIView()) }

    preview.layer.cornerRadius = 16
    preview.clipsToBounds = true
    preview.contentMode = .scaleAspectFill
    preview.translatesAutoresizingMaskIntoConstraints = false
    stackView.addArrangedSubview(preview)

    let headerGroup = UIView()
    headerGroup.translatesAutoresizingMaskIntoConstraints = false
    stackView.addArrangedSubview(headerGroup)

    let headerLabel = UILabel()
    let headerIcon = UIImageView()

    headerLabel.translatesAutoresizingMaskIntoConstraints = false
    headerLabel.text = NSLocalizedString("AFFiNE AI", comment: "")
    headerLabel.font = .preferredFont(for: .title3, weight: .bold)
    headerLabel.textColor = .white
    headerLabel.textAlignment = .left
    headerIcon.translatesAutoresizingMaskIntoConstraints = false
    headerIcon.image = .init(named: "spark", in: .module, with: nil)
    headerIcon.contentMode = .scaleAspectFit
    headerIcon.tintColor = .accent
    headerGroup.addSubview(headerLabel)
    headerGroup.addSubview(headerIcon)
    [
      headerIcon.leadingAnchor.constraint(equalTo: headerGroup.leadingAnchor),
      headerIcon.centerYAnchor.constraint(equalTo: headerGroup.centerYAnchor),
      headerIcon.widthAnchor.constraint(equalToConstant: 32),

      headerLabel.leadingAnchor.constraint(equalTo: headerIcon.trailingAnchor, constant: 16),
      headerLabel.topAnchor.constraint(equalTo: headerGroup.topAnchor),
      headerLabel.bottomAnchor.constraint(equalTo: headerGroup.bottomAnchor),
    ].forEach { $0.isActive = true }

    responseContainer.translatesAutoresizingMaskIntoConstraints = false
    responseContainer.setContentHuggingPriority(.required, for: .vertical)
    responseContainer.setContentCompressionResistancePriority(.required, for: .vertical)
    responseContainer.heightAnchor.constraint(greaterThanOrEqualToConstant: 350).isActive = true
    stackView.addArrangedSubview(responseContainer)

    responseContainer.addSubview(markdownView)

    markdownView.translatesAutoresizingMaskIntoConstraints = false
    [
      markdownView.topAnchor.constraint(equalTo: responseContainer.topAnchor),
      markdownView.leadingAnchor.constraint(equalTo: responseContainer.leadingAnchor),
      markdownView.trailingAnchor.constraint(equalTo: responseContainer.trailingAnchor),
      markdownView.bottomAnchor.constraint(equalTo: responseContainer.bottomAnchor),
    ].forEach {
      $0.isActive = true
    }

    indicator.startAnimating()
    indicator.translatesAutoresizingMaskIntoConstraints = false
    responseContainer.addSubview(indicator)
    [
      indicator.centerXAnchor.constraint(equalTo: responseContainer.centerXAnchor),
      indicator.centerYAnchor.constraint(equalTo: responseContainer.centerYAnchor),
      indicator.heightAnchor.constraint(equalToConstant: 200),
    ].forEach {
      $0.isActive = true
    }

    updateDocumentPresentationView()
  }

  public func configure(previewImage: UIImage) {
    preview.configure(previewImage: previewImage)
  }

  private var isFirstAppear: Bool = true
  override public func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard isFirstAppear else { return }
    isFirstAppear = false
    onFirstAppear()
  }

  func onFirstAppear() {
    beginAction()
  }

  func close() {
    if let navigationController {
      navigationController.popViewController(animated: true)
    } else {
      dismiss(animated: true)
    }
  }

  private var previousLayoutWidth: CGFloat = 0

  override public func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()

    if previousLayoutWidth != view.bounds.width {
      previousLayoutWidth = view.bounds.width
      updateDocumentPresentationView()
    }
  }

  func updateDocumentPresentationView() {
    assert(Thread.isMainThread)

    responseHeightAnchor?.isActive = false
    responseHeightAnchor = nil

    if copilotDocumentStorage.isEmpty {
      indicator.isHidden = false
      indicator.startAnimating()
      responseHeightAnchor = responseContainer.heightAnchor.constraint(equalToConstant: 200)
      responseHeightAnchor?.isActive = true
      markdownView.updateContentViews([])
      return
    }

    indicator.isHidden = true
    indicator.stopAnimating()

    let document = MarkdownParser().feed(copilotDocumentStorage)
    var height: CGFloat = 0
    let manifests = document.map {
      let ret = $0.manifest(theme: .default)
      ret.setLayoutWidth(responseContainer.bounds.width)
      ret.layoutIfNeeded()
      height += ret.size.height
      height += Theme.default.spacings.final
      return ret
    }
    markdownView.updateContentViews(manifests)
    if height > 0 { height -= Theme.default.spacings.final }
    responseHeightAnchor = responseContainer.heightAnchor.constraint(equalToConstant: height)
    responseHeightAnchor?.isActive = true
  }

  func scrollToBottom() {
    guard !copilotDocumentStorage.isEmpty else { return }
    let bottomOffset = CGPoint(
      x: 0,
      y: max(0, scrollView.contentSize.height - scrollView.bounds.size.height)
    )
    UIView.animate(
      withDuration: 0.5,
      delay: 0,
      usingSpringWithDamping: 1.0,
      initialSpringVelocity: 0.8
    ) { self.scrollView.setContentOffset(bottomOffset, animated: false) }
  }
}
