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
extension DateTime {
  private static let formatter: DateFormatter = {
    let fmt = DateFormatter()
    fmt.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
    fmt.timeZone = TimeZone(identifier: "UTC")
    return fmt
  }()

  var decoded: Date? {
    return Self.formatter.date(from: self)
  }
}
}
