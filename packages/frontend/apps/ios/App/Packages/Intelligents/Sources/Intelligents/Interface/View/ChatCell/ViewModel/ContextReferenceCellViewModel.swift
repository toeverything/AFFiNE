//
//  ContextReferenceCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

struct ContextReferenceCellViewModel: ChatCellViewModel {
  var cellType: CellType = .contextReference
  var id: String
  var references: [ChatManager.ContextReference]
  var parentMessageId: String
}
