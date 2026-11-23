//
//  AttachmentManagementControllerDelegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import Foundation

protocol AttachmentManagementControllerDelegate: AnyObject {
  func deleteFileAttachment(controller: AttachmentManagementController, _ attachment: FileAttachment)
  func deleteDocumentAttachment(controller: AttachmentManagementController, _ attachment: DocumentAttachment)
}
