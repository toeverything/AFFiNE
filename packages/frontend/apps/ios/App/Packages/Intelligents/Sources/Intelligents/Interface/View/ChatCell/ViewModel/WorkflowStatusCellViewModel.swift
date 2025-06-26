//
//  WorkflowStatusCellViewModel.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/26/25.
//

import Foundation

struct WorkflowStatusCellViewModel: ChatCellViewModel {
  var cellType: CellType = .workflowStatus
  var id: String
  var workflow: ChatManager.WorkflowEventData
  var parentMessageId: String
}
