//
//  FileAttachmentHeaderViewDelegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import Foundation

protocol FileAttachmentHeaderViewDelegate: AnyObject {
  func headerViewDidPickMore(_ headerView: FileAttachmentHeaderView)
  func headerViewDidTapManagement(_ headerView: FileAttachmentHeaderView)
}
