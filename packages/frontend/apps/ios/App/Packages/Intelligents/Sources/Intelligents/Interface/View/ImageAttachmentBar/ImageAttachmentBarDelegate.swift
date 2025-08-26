//
//  ImageAttachmentBarDelegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import Foundation

protocol ImageAttachmentBarDelegate: AnyObject {
  func inputBoxImageBar(_ imageBar: ImageAttachmentBar, didRemoveImageWithId id: UUID)
}
