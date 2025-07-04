//
//  ChatError.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/30/25.
//

import Foundation

public enum ChatError: LocalizedError {
  case invalidServerConfiguration
  case invalidStreamURL
  case invalidResponse
  case networkError(Error)
  case unknownError

  public var errorDescription: String? {
    switch self {
    case .invalidServerConfiguration:
      "Invalid server configuration"
    case .invalidStreamURL:
      "Invalid stream URL"
    case .invalidResponse:
      "Invalid response from server"
    case let .networkError(error):
      "Network error: \(error.localizedDescription)"
    case .unknownError:
      "An unknown error occurred"
    }
  }
}
