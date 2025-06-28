//
//  LoadingCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

struct LoadingCellViewModel: ChatCellViewModel {
  var cellType: CellType = .loading
  var id: String
  var message: String?
  var progress: Double?
}
