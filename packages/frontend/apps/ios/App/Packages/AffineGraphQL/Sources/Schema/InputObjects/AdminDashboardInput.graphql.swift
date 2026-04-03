// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AdminDashboardInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    sharedLinkWindowDays: GraphQLNullable<Int> = nil,
    storageHistoryDays: GraphQLNullable<Int> = nil,
    syncHistoryHours: GraphQLNullable<Int> = nil,
    timezone: GraphQLNullable<String> = nil
  ) {
    __data = InputDict([
      "sharedLinkWindowDays": sharedLinkWindowDays,
      "storageHistoryDays": storageHistoryDays,
      "syncHistoryHours": syncHistoryHours,
      "timezone": timezone
    ])
  }

  public var sharedLinkWindowDays: GraphQLNullable<Int> {
    get { __data["sharedLinkWindowDays"] }
    set { __data["sharedLinkWindowDays"] = newValue }
  }

  public var storageHistoryDays: GraphQLNullable<Int> {
    get { __data["storageHistoryDays"] }
    set { __data["storageHistoryDays"] = newValue }
  }

  public var syncHistoryHours: GraphQLNullable<Int> {
    get { __data["syncHistoryHours"] }
    set { __data["syncHistoryHours"] = newValue }
  }

  public var timezone: GraphQLNullable<String> {
    get { __data["timezone"] }
    set { __data["timezone"] = newValue }
  }
}
