//
//  DocumentPickerView.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/24/25.
//

import SnapKit
import Then
import UIKit

protocol DocumentPickerViewDelegate: AnyObject {
  func documentPickerView(_ view: DocumentPickerView, didSelectDocument document: DocumentItem)
  func documentPickerView(_ view: DocumentPickerView, didSearchWithText text: String)
}

struct DocumentItem {
  let title: String
  let icon: UIImage?
}

class DocumentPickerView: UIView {
  // MARK: - Properties

  weak var delegate: DocumentPickerViewDelegate?

  private var documents: [DocumentItem] = []

  // MARK: - UI Components

  private lazy var containerView = UIView().then {
    $0.backgroundColor = .white
    $0.layer.cornerRadius = 10
    $0.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
    $0.layer.shadowColor = UIColor.black.cgColor
    $0.layer.shadowOffset = CGSize(width: 0, height: -3)
    $0.layer.shadowRadius = 5
    $0.layer.shadowOpacity = 0.07
  }

  private lazy var searchContainerView = UIView().then {
    $0.backgroundColor = .white
    $0.layer.cornerRadius = 10
    $0.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
    $0.layer.borderWidth = 0.5
    $0.layer.borderColor = UIColor(hex: 0xE6E6E6)?.cgColor
  }

  private lazy var searchIconImageView = UIImageView().then {
    $0.image = UIImage(systemName: "magnifyingglass")
    $0.tintColor = UIColor(hex: 0x141414)
    $0.contentMode = .scaleAspectFit
  }

  private lazy var searchTextField = UITextField().then {
    $0.placeholder = "Search documents..."
    $0.font = .systemFont(ofSize: 17, weight: .regular)
    $0.textColor = UIColor(hex: 0x141414)
    $0.backgroundColor = .clear
    $0.addTarget(self, action: #selector(searchTextChanged), for: .editingChanged)
  }

  private lazy var tableView = UITableView().then {
    $0.backgroundColor = .white
    $0.separatorStyle = .none
    $0.delegate = self
    $0.dataSource = self
    $0.register(DocumentTableViewCell.self, forCellReuseIdentifier: "DocumentCell")
  }

  // MARK: - Initialization

  init() {
    super.init(frame: .zero)
    setupUI()
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  // MARK: - Setup

  private func setupUI() {
    backgroundColor = .systemBackground

    addSubview(containerView)
    containerView.addSubview(searchContainerView)
    containerView.addSubview(tableView)

    searchContainerView.addSubview(searchIconImageView)
    searchContainerView.addSubview(searchTextField)

    setupConstraints()
  }

  private func setupConstraints() {
    containerView.snp.makeConstraints { make in
      make.center.equalToSuperview()
      make.width.equalTo(393)
      make.height.lessThanOrEqualTo(500)
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
      make.trailing.equalToSuperview().offset(-DocumentTableViewCell.cellInset)
      make.centerY.equalToSuperview()
    }

    tableView.snp.makeConstraints { make in
      make.top.equalTo(searchContainerView.snp.bottom)
      make.leading.trailing.bottom.equalToSuperview()
    }
  }

  // MARK: - Public Methods

  func updateDocuments(_ documents: [DocumentItem]) {
    self.documents = documents
    tableView.reloadData()

    let tableHeight = min(CGFloat(documents.count) * 37.11 + 44, 500)
    containerView.snp.updateConstraints { make in
      make.height.lessThanOrEqualTo(tableHeight)
    }
  }

  // MARK: - Actions

  @objc private func searchTextChanged() {
    guard let text = searchTextField.text else { return }
    delegate?.documentPickerView(self, didSearchWithText: text)
  }
}

// MARK: - UITableViewDataSource

extension DocumentPickerView: UITableViewDataSource {
  func tableView(_: UITableView, numberOfRowsInSection _: Int) -> Int {
    documents.count
  }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "DocumentCell", for: indexPath) as! DocumentTableViewCell
    cell.configure(with: documents[indexPath.row])
    return cell
  }
}

// MARK: - UITableViewDelegate

extension DocumentPickerView: UITableViewDelegate {
  func tableView(_: UITableView, heightForRowAt _: IndexPath) -> CGFloat {
    DocumentTableViewCell.cellInset * 2 + DocumentTableViewCell.iconSize
  }

  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    tableView.deselectRow(at: indexPath, animated: true)
    let document = documents[indexPath.row]
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
          DocumentItem(title: "Project Proposal.docx", icon: UIImage(systemName: "doc.text")),
          DocumentItem(title: "Budget Analysis.xlsx", icon: UIImage(systemName: "tablecells")),
          DocumentItem(title: "Meeting Notes.pdf", icon: UIImage(systemName: "doc.richtext")),
          DocumentItem(title: "Design Guidelines.sketch", icon: UIImage(systemName: "paintbrush")),
          DocumentItem(title: "Code Review.md", icon: UIImage(systemName: "doc.plaintext")),
          DocumentItem(title: "User Research.pptx", icon: UIImage(systemName: "doc.on.doc")),
          DocumentItem(title: "Technical Specification.docx", icon: UIImage(systemName: "doc.text")),
          DocumentItem(title: "Database Schema.sql", icon: UIImage(systemName: "cylinder.split.1x2")),
        ]

        view.updateDocuments(mockDocuments)
        return view
      }
      .previewLayout(.fixed(width: 400, height: 600))
      .previewDisplayName("Document Picker")
    }
  }
#endif
