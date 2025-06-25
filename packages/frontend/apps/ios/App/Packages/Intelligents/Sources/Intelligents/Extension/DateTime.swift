//
//  DateTime.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/25/25.
//

import AffineGraphQL
import Apollo
import ApolloAPI
import Foundation

/// A date-time string at UTC, such as 2019-12-03T09:54:33Z, compliant with the date-time format.
extension DateTime {
  var decoded: Date? {
//    2025-03-27T06:06:02.981Z
    let formatterText = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
    let fmt = DateFormatter()
    fmt.dateFormat = formatterText
    guard let date = fmt.date(from: self) else {
      assertionFailure("failed to decode ql date \(self)")
      return nil
    }
    return date
  }
}
