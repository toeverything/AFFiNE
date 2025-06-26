//
//  AttachmentCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

struct AttachmentCellViewModel: ChatCellViewModel {
  var cellType: CellType = .attachment
  var id: String
  var attachments: [AttachmentViewModel]
  var parentMessageId: String
}

struct AttachmentViewModel: Codable, Identifiable, Equatable, Hashable {
  var id: String
  var url: String
  var mimeType: String?
  var fileName: String?
  var size: Int64?
}
