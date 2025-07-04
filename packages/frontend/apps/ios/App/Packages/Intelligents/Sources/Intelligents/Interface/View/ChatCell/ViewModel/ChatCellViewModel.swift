//
//  ChatCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

public protocol ChatCellViewModel: Codable, Identifiable, Equatable, Hashable {
  var id: UUID { get }
  var cellType: CellType { get }
}
