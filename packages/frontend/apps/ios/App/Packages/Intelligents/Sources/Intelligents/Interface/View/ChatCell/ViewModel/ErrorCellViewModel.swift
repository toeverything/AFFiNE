//
//  ErrorCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

struct ErrorCellViewModel: ChatCellViewModel {
  var cellType: CellType = .error
  var id: String
  var errorMessage: String
  var canRetry: Bool
  var retryAction: String?
}
