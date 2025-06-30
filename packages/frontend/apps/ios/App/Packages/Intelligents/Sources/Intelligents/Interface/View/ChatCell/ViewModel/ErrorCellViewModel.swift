//
//  ErrorCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

struct ErrorCellViewModel: ChatCellViewModel {
  var cellType: CellType = .error
  var id: UUID
  var errorMessage: String
}
