//
//  DocumentPickerView.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/24/25.
//

import AffineGraphQL
import SnapKit
import UIKit

class DocumentPickerView: UIView {
  // MARK: - Properties

  weak var delegate: DocumentPickerViewDelegate?

  private var documents: [DocumentItem] = []
  private var selectedDocumentIds: Set<String> = []
  private let updateQueue = DispatchQueue(label: "com.affine.documentpicker.update", qos: .userInitiated)
  private var lastSearchKeyword: String = ""

  // MARK: - DiffableDataSource

  private enum Section {
    case main
  }

  private var dataSource: UITableViewDiffableDataSource<Section, DocumentItem>!

  // MARK: - UI Components

  lazy var containerView = UIView().then {
    $0.backgroundColor = .systemBackground
    $0.layer.cornerRadius = 10
    $0.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
    $0.layer.shadowColor = UIColor.black.cgColor
    $0.layer.shadowOffset = CGSize(width: 0, height: -3)
    $0.layer.shadowRadius = 5
    $0.layer.shadowOpacity = 0.07
  }

  lazy var searchContainerView = UIView().then {
    $0.backgroundColor = .systemBackground
    $0.layer.cornerRadius = 10
    $0.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
    $0.layer.borderWidth = 0.5
    $0.layer.borderColor = UIColor(hex: 0xE6E6E6)?.cgColor
  }

  lazy var searchIconImageView = UIImageView().then {
    $0.image = UIImage(systemName: "magnifyingglass")
    $0.tintColor = .affineIconPrimary
    $0.contentMode = .scaleAspectFit
  }

  lazy var searchTextField = UITextField().then {
    $0.placeholder = "Search documents..."
    $0.font = .systemFont(ofSize: 17, weight: .regular)
    $0.textColor = .affineTextPrimary
    $0.backgroundColor = .clear
    $0.addTarget(self, action: #selector(searchTextChanged), for: .editingChanged)
  }

  lazy var activityIndicator = UIActivityIndicatorView(style: .medium).then {
    $0.hidesWhenStopped = true
    $0.color = .affineIconPrimary
  }

  private lazy var tableView = UITableView().then {
    $0.backgroundColor = .white
    $0.separatorStyle = .none
    $0.delegate = self
    $0.register(DocumentTableViewCell.self, forCellReuseIdentifier: "DocumentCell")
  }

  // MARK: - Initialization

  init() {
    super.init(frame: .zero)
    isUserInteractionEnabled = true
    clipsToBounds = false // for shadow
    backgroundColor = .systemBackground

    addSubview(containerView)
    containerView.addSubview(searchContainerView)
    containerView.addSubview(tableView)

    searchContainerView.addSubview(searchIconImageView)
    searchContainerView.addSubview(searchTextField)
    searchContainerView.addSubview(activityIndicator)

    setupConstraints()
    setupDataSource()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  // MARK: - Setup

  private func setupConstraints() {
    containerView.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }

    searchContainerView.snp.makeConstraints { make in
      make.top.leading.trailing.equalToSuperview()
      make.bottom.equalTo(searchIconImageView.snp.bottom).offset(DocumentTableViewCell.cellInset)
      make.top.equalTo(searchIconImageView.snp.top).offset(-DocumentTableViewCell.cellInset)
    }

    searchIconImageView.snp.makeConstraints { make in
      make.leading.equalToSuperview().offset(DocumentTableViewCell.cellInset)
      make.centerY.equalToSuperview()
      make.width.height.equalTo(DocumentTableViewCell.iconSize)
    }

    searchTextField.snp.makeConstraints { make in
      make.leading.equalTo(searchIconImageView.snp.trailing).offset(DocumentTableViewCell.spacing)
      make.trailing.equalTo(activityIndicator.snp.leading).offset(-DocumentTableViewCell.cellInset)
      make.centerY.equalToSuperview()
    }

    activityIndicator.snp.makeConstraints { make in
      make.trailing.equalToSuperview().offset(-DocumentTableViewCell.cellInset)
      make.centerY.equalToSuperview()
      make.width.height.equalTo(DocumentTableViewCell.iconSize)
    }

    tableView.snp.makeConstraints { make in
      make.top.equalTo(searchContainerView.snp.bottom)
      make.leading.trailing.bottom.equalToSuperview()
    }
  }

  private func setupDataSource() {
    dataSource = UITableViewDiffableDataSource<Section, DocumentItem>(tableView: tableView) { [weak self] tableView, indexPath, document in
      let cell = tableView.dequeueReusableCell(withIdentifier: "DocumentCell", for: indexPath) as! DocumentTableViewCell
      let isSelected = self?.selectedDocumentIds.contains(document.id) ?? false
      cell.configure(with: document, isSelected: isSelected)
      return cell
    }
  }

  // MARK: - Public Methods

  func updateDocuments(_ documents: [DocumentItem]) {
    updateQueue.async { [weak self] in
      guard let self else { return }

      DispatchQueue.main.async {
        self.documents = documents
        var snapshot = NSDiffableDataSourceSnapshot<Section, DocumentItem>()
        snapshot.appendSections([.main])
        snapshot.appendItems(documents)
        self.dataSource.apply(snapshot, animatingDifferences: true)
      }
    }
  }

  func updateDocumentsFromRecentDocs() {
    guard searchTextField.text?.isEmpty ?? true else {
      return
    }
    guard let workspaceId = IntelligentContext.shared.webViewMetadata[.currentWorkspaceId] as? String,
          !workspaceId.isEmpty
    else {
      activityIndicator.stopAnimating()
      return
    }
    activityIndicator.startAnimating()
    QLService.shared.fetchRecentlyUpdatedDocs(workspaceId: workspaceId, first: 20) { [weak self] docs in
      guard let self else { return }
      DispatchQueue.main.async {
        self.activityIndicator.stopAnimating()
        self.updateDocuments(docs.compactMap { DocumentItem(
          id: $0.id,
          title: $0.title ?? "Unknown Document",
          updatedAt: $0.updatedAt?.decoded
        ) })
      }
    }
  }

  func setSelectedDocuments(_ documentAttachments: [DocumentAttachment]) {
    selectedDocumentIds = Set(documentAttachments.map(\.documentID))
    DispatchQueue.main.async { [weak self] in
      self?.tableView.reloadData()
    }
  }

  // MARK: - Actions

  @objc private func searchTextChanged() {
    guard let text = searchTextField.text else { return }

    let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    lastSearchKeyword = trimmedText

    NSObject.cancelPreviousPerformRequests(
      withTarget: self,
      selector: #selector(performCloudIndexerDocumentSearch(_:)),
      object: nil
    )

    if trimmedText.isEmpty {
      DispatchQueue.main.async { [weak self] in
        self?.activityIndicator.stopAnimating()
      }
      updateDocumentsFromRecentDocs()
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.activityIndicator.startAnimating()
      }
      perform(#selector(performCloudIndexerDocumentSearch(_:)), with: trimmedText, afterDelay: 0.25)
    }
  }

  @objc func performCloudIndexerDocumentSearch(_ keyword: String) {
    let trimmedKeyword = keyword.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !trimmedKeyword.isEmpty else { return }
    guard trimmedKeyword == lastSearchKeyword else { return }
    guard let workspaceId = IntelligentContext.shared.webViewMetadata[.currentWorkspaceId] as? String,
          !workspaceId.isEmpty
    else {
      activityIndicator.stopAnimating()
      return
    }

    QLService.shared.searchDocuments(
      workspaceId: workspaceId,
      keyword: trimmedKeyword,
      limit: 20
    ) { [weak self] searchResults in
      guard let self, lastSearchKeyword == trimmedKeyword else {
        return
      }
      DispatchQueue.main.async {
        self.activityIndicator.stopAnimating()
        self.updateDocuments(searchResults.map {
          .init(id: $0.docId, title: $0.title, updatedAt: $0.updatedAt.decoded)
        })
      }
    }
  }
}

// MARK: - UITableViewDelegate

extension DocumentPickerView: UITableViewDelegate {
  func tableView(_: UITableView, heightForRowAt _: IndexPath) -> CGFloat {
    DocumentTableViewCell.cellInset * 2 + DocumentTableViewCell.iconSize
  }

  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    tableView.deselectRow(at: indexPath, animated: true)
    guard let document = dataSource.itemIdentifier(for: indexPath) else { return }
    delegate?.documentPickerView(self, didSelectDocument: document)
  }
}

// MARK: - Preview

#if canImport(SwiftUI) && DEBUG
  import SwiftUI

  struct DocumentPickerView_Previews: PreviewProvider {
    static var previews: some View {
      UIViewPreview {
        let view = DocumentPickerView()

        let mockDocuments = [
          DocumentItem(id: "1", title: "Project Proposal.docx"),
          DocumentItem(id: "2", title: "Budget Analysis.xlsx"),
          DocumentItem(id: "3", title: "Meeting Notes.pdf"),
          DocumentItem(id: "4", title: "Design Guidelines.sketch"),
          DocumentItem(id: "5", title: "Code Review.md"),
          DocumentItem(id: "6", title: "User Research.pptx"),
          DocumentItem(id: "7", title: "Technical Specification.docx"),
          DocumentItem(id: "8", title: "Database Schema.sql"),
        ]

        view.updateDocuments(mockDocuments)
        return view
      }
      .previewLayout(.fixed(width: 400, height: 600))
      .previewDisplayName("Document Picker")
    }
  }
#endif
