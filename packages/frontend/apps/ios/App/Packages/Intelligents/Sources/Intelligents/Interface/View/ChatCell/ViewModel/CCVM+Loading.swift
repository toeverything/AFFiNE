//
//  CCVM+Loading.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

struct LoadingCellViewModel: ChatCellViewModel {
  var cellType: ChatCellType = .loading
  var id: UUID
  var timestamp: Date
  var message: String?
  var progress: Double?
}
