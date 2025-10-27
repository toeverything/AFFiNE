//
//  ChatCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

public protocol ChatCellViewModel: Identifiable, Equatable, Hashable {
  var id: UUID { get }
  var cellType: ChatCellType { get }
  var timestamp: Date { get }
}
