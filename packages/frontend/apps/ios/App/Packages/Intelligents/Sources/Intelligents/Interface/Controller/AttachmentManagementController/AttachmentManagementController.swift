//
//  AttachmentManagementController.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import SnapKit
import UIKit

class AttachmentManagementController: UINavigationController {
  private let _viewController: _AttachmentManagementController
  init(delegate: AttachmentManagementControllerDelegate) {
    let attachmentManagementController = _AttachmentManagementController(delegate: delegate)
    _viewController = attachmentManagementController
    super.init(rootViewController: attachmentManagementController)
    _viewController.delegateController = self
    navigationBar.isHidden = false
    modalPresentationStyle = .formSheet
    modalTransitionStyle = .coverVertical
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  func set(documentAttachments attachments: [DocumentAttachment]) {
    _ = _viewController.view // trigger view did load
    _viewController.documentAttachments = attachments
  }

  func set(fileAttachments attachments: [FileAttachment]) {
    _ = _viewController.view // trigger view did load
    _viewController.fileAttachments = attachments
  }
}

private class _AttachmentManagementController: UIViewController {
  weak var delegateController: AttachmentManagementController?
  weak var delegate: AttachmentManagementControllerDelegate?
  private let tableView: UITableView = .init(frame: .zero, style: .plain)
  private lazy var dataSource: UITableViewDiffableDataSource<
    Section,
    Item
  > = .init(tableView: tableView) { [weak self] tableView, indexPath, item in
    let cell = tableView.dequeueReusableCell(withIdentifier: "AttachmentManagementCell", for: indexPath) as! AttachmentManagementCell
    cell.configure(with: item)
    cell.onDelete = { [weak self] in
      guard let delegateController = self?.delegateController else { return }
      switch item.type {
      case let .file(file):
        self?.delegate?.deleteFileAttachment(controller: delegateController, file)
      case let .document(doc):
        self?.delegate?.deleteDocumentAttachment(controller: delegateController, doc)
      }
    }
    return cell
  }

  enum Section: Int, CaseIterable {
    case files
    case documents
  }

  struct Item: Hashable {
    let id: UUID
    let title: String
    let icon: UIImage?
    let type: ItemType
    enum ItemType: Hashable {
      case file(FileAttachment)
      case document(DocumentAttachment)
    }

    static func == (lhs: Item, rhs: Item) -> Bool {
      lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
      hasher.combine(id)
    }
  }

  var fileAttachments: [FileAttachment] = [] {
    didSet {
      NSObject.cancelPreviousPerformRequests(withTarget: self)
      perform(#selector(reloadDataSource), with: nil, afterDelay: 0)
    }
  }

  var documentAttachments: [DocumentAttachment] = [] {
    didSet {
      NSObject.cancelPreviousPerformRequests(withTarget: self)
      perform(#selector(reloadDataSource), with: nil, afterDelay: 0)
    }
  }

  init(delegate: AttachmentManagementControllerDelegate) {
    self.delegate = delegate
    super.init(nibName: nil, bundle: nil)
    title = "Attachments & Docs"
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    navigationItem.title = "Attachments & Docs"
    navigationItem.rightBarButtonItem = .init(systemItem: .done, primaryAction: .init { [weak self] _ in
      self?.doneTapped()
    })

    tableView.backgroundColor = .clear
    tableView.separatorStyle = .none
    tableView.register(AttachmentManagementCell.self, forCellReuseIdentifier: "AttachmentManagementCell")
    tableView.clipsToBounds = true
    tableView.rowHeight = UITableView.automaticDimension
    view.addSubview(tableView)
    tableView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    applySnapshot()
  }

  @objc private func doneTapped() {
    dismiss(animated: true)
  }

  @objc func reloadDataSource() {
    applySnapshot()
    if fileAttachments.isEmpty, documentAttachments.isEmpty {
      dismiss(animated: true)
    }
  }

  private func applySnapshot() {
    var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
    snapshot.appendSections([.files, .documents])
    let fileItems = fileAttachments.map { file in
      Item(id: file.id, title: file.name, icon: file.icon, type: .file(file))
    }
    let docItems = documentAttachments.map { doc in
      Item(id: doc.id, title: doc.title, icon: .init(named: "FileAttachment", in: .module, with: nil)!, type: .document(doc))
    }
    snapshot.appendItems(fileItems, toSection: .files)
    snapshot.appendItems(docItems, toSection: .documents)
    dataSource.apply(snapshot, animatingDifferences: true)
  }
}

private class AttachmentManagementCell: UITableViewCell {
  let container = UIView().then {
    $0.layer.cornerRadius = 4
    $0.layer.borderWidth = 0.5
    $0.layer.borderColor = UIColor.affineLayerBorder.cgColor
  }

  let iconView = UIImageView().then {
    $0.contentMode = .scaleAspectFit
    $0.tintColor = .affineIconPrimary
    $0.setContentCompressionResistancePriority(.required, for: .horizontal)
  }

  let titleLabel = UILabel().then {
    $0.textColor = .label
    $0.textAlignment = .left
    $0.font = .preferredFont(forTextStyle: .body)
    $0.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
  }

  let deleteButton = UIButton(type: .system).then {
    $0.setImage(UIImage(systemName: "xmark"), for: .normal)
    $0.tintColor = .affineIconPrimary
    $0.setContentCompressionResistancePriority(.required, for: .horizontal)
  }

  var onDelete: (() -> Void)?

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: style, reuseIdentifier: reuseIdentifier)
    selectionStyle = .none
    setupUI()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  private let inset: CGFloat = 10

  private func setupUI() {
    contentView.addSubview(container)
    container.snp.makeConstraints { make in
      make.top.bottom.equalToSuperview().inset(4)
      make.left.right.equalToSuperview().inset(inset)
    }

    container.addSubview(iconView)
    container.addSubview(titleLabel)
    container.addSubview(deleteButton)
    iconView.snp.makeConstraints { make in
      make.left.equalToSuperview().inset(inset)
      make.centerY.equalToSuperview()
      make.top.greaterThanOrEqualToSuperview().offset(inset)
      make.bottom.lessThanOrEqualToSuperview().offset(-inset)
    }
    titleLabel.snp.makeConstraints { make in
      make.left.equalTo(iconView.snp.right).offset(inset)
      make.right.lessThanOrEqualTo(deleteButton.snp.left).offset(-inset)
      make.centerY.equalToSuperview()
      make.top.greaterThanOrEqualToSuperview().offset(inset)
      make.bottom.lessThanOrEqualToSuperview().offset(-inset)
    }
    deleteButton.snp.makeConstraints { make in
      make.right.equalToSuperview().offset(-inset)
      make.centerY.equalToSuperview()
      make.width.height.equalTo(12)
      make.centerY.equalToSuperview()
      make.top.greaterThanOrEqualToSuperview().offset(inset)
      make.bottom.lessThanOrEqualToSuperview().offset(-inset)
    }
    deleteButton.addTarget(self, action: #selector(deleteTapped), for: .touchUpInside)
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    container.layer.borderColor = UIColor.affineLayerBorder.cgColor
  }

  func configure(with item: _AttachmentManagementController.Item) {
    iconView.image = item.icon
    titleLabel.text = item.title
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    iconView.image = nil
    titleLabel.text = nil
    onDelete = nil
  }

  @objc private func deleteTapped() {
    onDelete?()
  }
}

private extension FileAttachment {
  var icon: UIImage? {
    switch url.pathExtension.lowercased() {
    case "pdf":
      .init(named: "FileAttachment_pdf", in: .module, with: nil)!
    case "json":
      .init(named: "FileAttachment_json", in: .module, with: nil)!
    case "md":
      .init(named: "FileAttachment_md", in: .module, with: nil)!
    case "txt":
      .init(named: "FileAttachment_txt", in: .module, with: nil)!
    default:
      .init(named: "FileAttachment", in: .module, with: nil)!
    }
  }
}

#if canImport(SwiftUI) && DEBUG
  import SwiftUI

  private class MockDelegate: AttachmentManagementControllerDelegate {
    static let shared = MockDelegate()
    func deleteFileAttachment(controller _: AttachmentManagementController, _: FileAttachment) {}
    func deleteDocumentAttachment(controller _: AttachmentManagementController, _: DocumentAttachment) {}
  }

  struct AttachmentManagementController_Previews: PreviewProvider {
    static var previews: some View {
      UIViewControllerPreview {
        let vc = AttachmentManagementController(delegate: MockDelegate.shared)
        let fileAttachments = [
          FileAttachment(url: .init(fileURLWithPath: "/p.pdf"), name: "File 1.pdf"),
          FileAttachment(url: .init(fileURLWithPath: "/p.md"), name: "File 2.md"),
          FileAttachment(url: .init(fileURLWithPath: "/p.txt"), name: "File 3.txt"),
          FileAttachment(url: .init(fileURLWithPath: "/p.json"), name: "File 4.json"),
          FileAttachment(url: .init(fileURLWithPath: "/p.xls"), name: "File 4.xls"),
        ]
        let documentAttachments = [
          DocumentAttachment(title: "Cloud Document A"),
          DocumentAttachment(title: "Cloud Document B"),
        ]
        vc.set(fileAttachments: fileAttachments)
        vc.set(documentAttachments: documentAttachments)
        return vc
      }
      .edgesIgnoringSafeArea(.all)
    }
  }
#endif
