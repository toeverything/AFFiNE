//
//  ImageAttachment.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/24/25.
//

import UIKit

public struct ImageAttachment: Identifiable, Equatable, Hashable, Codable {
  public var id: UUID = .init()
  public var imageData: Data

  public init(image: UIImage) {
    imageData = image.jpegData(compressionQuality: 0.5) ?? Data()
  }
}
