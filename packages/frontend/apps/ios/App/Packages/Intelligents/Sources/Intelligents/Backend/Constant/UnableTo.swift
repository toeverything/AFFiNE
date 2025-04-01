//
//  UnableTo.swift
//  Intelligents
//
//  Created by 秋星桥 on 4/1/25.
//

import Foundation

enum UnableTo {
  static let identifyDocumentOrWorkspace =
    NSError(
      domain: "Intelligents",
      code: 0,
      userInfo: [NSLocalizedDescriptionKey: "Unable to identify the document or workspace"]
    )

  static let createSession = NSError(
    domain: "Intelligents",
    code: 0,
    userInfo: [NSLocalizedDescriptionKey: "Unable to create a session"]
  )

  static let createMessage = NSError(
    domain: "Intelligents",
    code: 0,
    userInfo: [NSLocalizedDescriptionKey: "Unable to create a message"]
  )

  static let compressImage = NSError(domain: "", code: -1, userInfo: [
    NSLocalizedDescriptionKey: "Failed to compress image data",
  ])
}
