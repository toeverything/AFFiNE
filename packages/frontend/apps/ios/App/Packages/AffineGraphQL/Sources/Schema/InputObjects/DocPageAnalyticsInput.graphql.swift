// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct DocPageAnalyticsInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    timezone: GraphQLNullable<String> = nil,
    windowDays: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "timezone": timezone,
      "windowDays": windowDays
    ])
  }

  public var timezone: GraphQLNullable<String> {
    get { __data["timezone"] }
    set { __data["timezone"] = newValue }
  }

  public var windowDays: GraphQLNullable<Int> {
    get { __data["windowDays"] }
    set { __data["windowDays"] = newValue }
  }
}
