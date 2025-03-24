//
//  ImageRotatedPreview.swift
//  Intelligents
//
//  Created by 秋星桥 on 2025/1/8.
//

import UIKit

public class RotatedImagePreview: UIView {
  let imageView = UIImageView()
  let rotationDegree: CGFloat = 5

  public init() {
    super.init(frame: .zero)
    imageView.contentMode = .scaleAspectFill
    imageView.layer.cornerRadius = 16
    imageView.clipsToBounds = true
    addSubview(imageView)

    clipsToBounds = false

    heightAnchor.constraint(equalToConstant: 300).isActive = true
    imageView.transform = CGAffineTransform(rotationAngle: rotationDegree * CGFloat.pi / 180)
  }

  @available(*, unavailable)
  public required init?(coder _: NSCoder) {
    fatalError()
  }

  public func configure(previewImage: UIImage) {
    imageView.image = previewImage
    setNeedsLayout()
  }

  override public func layoutSubviews() {
    super.layoutSubviews()

    guard let image = imageView.image else {
      imageView.frame = .zero
      return
    }

    let viewHeight = bounds.height // limiter
    guard bounds.height > 0 else { return }

    // fit in side
    let imageAspectRatio = image.size.width / image.size.height
    let imageHeight = viewHeight
    let imageWidth = imageHeight * imageAspectRatio

    imageView.frame = CGRect(
      x: (bounds.width - imageWidth) / 2,
      y: (bounds.height - imageHeight) / 2,
      width: imageWidth,
      height: imageHeight
    )
  }
}
