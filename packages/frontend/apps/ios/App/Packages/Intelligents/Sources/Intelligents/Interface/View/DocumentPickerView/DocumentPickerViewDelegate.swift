//
//  DocumentPickerViewDelegate.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import Foundation

protocol DocumentPickerViewDelegate: AnyObject {
  func documentPickerView(_ view: DocumentPickerView, didSelectDocument document: DocumentItem)
}
