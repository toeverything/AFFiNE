//
//  ImageAttachmentBar.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/18/25.
//

import SnapKit
import UIKit

class ImageAttachmentBar: UICollectionView {
  weak var imageBarDelegate: ImageAttachmentBarDelegate?

  enum Section {
    case main
  }

  private var attachments: [ImageAttachment] = []
  private let cellSpacing: CGFloat = 8
  private let constantHeight: CGFloat = 80

  var myDataSource: UICollectionViewDiffableDataSource<
    Section,
    ImageAttachment
  >!

  init(frame: CGRect = .zero) {
    let layout = UICollectionViewFlowLayout()
    layout.scrollDirection = .horizontal
    layout.itemSize = CGSize(width: 80, height: 80)
    layout.minimumInteritemSpacing = 8
    layout.minimumLineSpacing = 8
    layout.sectionInset = UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)

    super.init(frame: frame, collectionViewLayout: layout)
    showsHorizontalScrollIndicator = false
    showsVerticalScrollIndicator = false
    backgroundColor = .clear

    setupDataSource()
    delegate = self
    register(ImageCollectionViewCell.self, forCellWithReuseIdentifier: "ImageCell")

    snp.makeConstraints { make in
      make.height.equalTo(constantHeight)
    }
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) {
    fatalError()
  }

  func updateImageBarContent(_ attachments: [ImageAttachment]) {
    self.attachments = attachments
    applySnapshot()
  }

  func clear() {
    attachments.removeAll()
    applySnapshot()
  }

  private func setupDataSource() {
    myDataSource = .init(collectionView: self) { [weak self] collectionView, indexPath, attachment in
      let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "ImageCell", for: indexPath) as! ImageCollectionViewCell

      if let image = UIImage(data: attachment.imageData) {
        cell.configure(with: image, attachmentId: attachment.id) { [weak self] attachmentId in
          self?.imageBarDelegate?.inputBoxImageBar(self!, didRemoveImageWithId: attachmentId)
        }
      }

      return cell
    }
  }

  private func applySnapshot() {
    var snapshot = NSDiffableDataSourceSnapshot<
      Section,
      ImageAttachment
    >()
    snapshot.appendSections([.main])
    snapshot.appendItems(attachments)
    myDataSource.apply(snapshot, animatingDifferences: true)
  }
}

// MARK: - UICollectionViewDelegate

extension ImageAttachmentBar: UICollectionViewDelegate {}

// MARK: - Preview

#if canImport(SwiftUI) && DEBUG
  import SwiftUI

  struct InputBoxImageBar_Previews: PreviewProvider {
    static var previews: some View {
      UIViewPreview {
        let imageBar = ImageAttachmentBar()

        let mockAttachments = [
          createMockImageAttachment(color: .red),
          createMockImageAttachment(color: .blue),
          createMockImageAttachment(color: .green),
          createMockImageAttachment(color: .orange),
          createMockImageAttachment(color: .purple),
        ]

        imageBar.updateImageBarContent(mockAttachments)
        return imageBar
      }
      .previewLayout(.fixed(width: 400, height: 100))
      .previewDisplayName("Image Bar with Multiple Images")

      UIViewPreview {
        let imageBar = ImageAttachmentBar()

        let singleAttachment = [createMockImageAttachment(color: .systemBlue)]
        imageBar.updateImageBarContent(singleAttachment)
        return imageBar
      }
      .previewLayout(.fixed(width: 400, height: 100))
      .previewDisplayName("Image Bar with Single Image")

      UIViewPreview {
        let imageBar = ImageAttachmentBar()
        imageBar.updateImageBarContent([])
        return imageBar
      }
      .previewLayout(.fixed(width: 400, height: 100))
      .previewDisplayName("Empty Image Bar")
    }

    private static func createMockImageAttachment(color: UIColor) -> ImageAttachment {
      let size = CGSize(width: 100, height: 100)
      let renderer = UIGraphicsImageRenderer(size: size)
      let image = renderer.image { context in
        color.setFill()
        context.fill(CGRect(origin: .zero, size: size))

        UIColor.white.withAlphaComponent(0.3).setFill()
        let circleRect = CGRect(x: 25, y: 25, width: 50, height: 50)
        context.cgContext.fillEllipse(in: circleRect)
      }

      return ImageAttachment(image: image)
    }
  }
#endif
