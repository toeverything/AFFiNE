//
//  UnableTo.swift
//  Intelligents
//
//  Created by 秋星桥 on 4/1/25.
//

import Foundation

private let domain = "Intelligents"

enum UnableTo {
  static let identifyDocumentOrWorkspace =
    NSError(
      domain: domain,
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: "Unable to identify the document or workspace"]
    )

  static let createSession = NSError(
    domain: domain,
    code: -1,
    userInfo: [NSLocalizedDescriptionKey: "Unable to create a session"]
  )

  static let createMessage = NSError(
    domain: domain,
    code: -1,
    userInfo: [NSLocalizedDescriptionKey: "Unable to create a message"]
  )

  static let compressImage = NSError(
    domain: domain,
    code: -1,
    userInfo: [
      NSLocalizedDescriptionKey: "Failed to compress image data",
    ]
  )

  static let clearHistory = NSError(
    domain: domain,
    code: -1,
    userInfo: [NSLocalizedDescriptionKey: "Unable to clear history"]
  )
}
