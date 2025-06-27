//
//  ChatCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

public protocol ChatCellViewModel: Codable, Identifiable, Equatable, Hashable {
  var cellType: CellType { get }
  var id: String { get }
}
