//
//  Tools.swift
//  AFFiNE
//
//  Created by qaq on 9/18/25.
//

import Foundation

extension Optional {
  func get(_ failure: String? = nil) throws -> Wrapped {
    guard let self else {
      if let failure {
        throw NSError(domain: #function, code: -1, userInfo: [NSLocalizedDescriptionKey: failure])
      } else {
        throw NSError(domain: #function, code: -1)
      }
    }
    return self
  }
}
