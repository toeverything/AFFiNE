// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AdminAllSharedLinksFilterInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    analyticsWindowDays: GraphQLNullable<Int> = nil,
    includeTotal: GraphQLNullable<Bool> = nil,
    keyword: GraphQLNullable<String> = nil,
    orderBy: GraphQLNullable<GraphQLEnum<AdminSharedLinksOrder>> = nil,
    updatedAfter: GraphQLNullable<DateTime> = nil,
    workspaceId: GraphQLNullable<String> = nil
  ) {
    __data = InputDict([
      "analyticsWindowDays": analyticsWindowDays,
      "includeTotal": includeTotal,
      "keyword": keyword,
      "orderBy": orderBy,
      "updatedAfter": updatedAfter,
      "workspaceId": workspaceId
    ])
  }

  public var analyticsWindowDays: GraphQLNullable<Int> {
    get { __data["analyticsWindowDays"] }
    set { __data["analyticsWindowDays"] = newValue }
  }

  public var includeTotal: GraphQLNullable<Bool> {
    get { __data["includeTotal"] }
    set { __data["includeTotal"] = newValue }
  }

  public var keyword: GraphQLNullable<String> {
    get { __data["keyword"] }
    set { __data["keyword"] = newValue }
  }

  public var orderBy: GraphQLNullable<GraphQLEnum<AdminSharedLinksOrder>> {
    get { __data["orderBy"] }
    set { __data["orderBy"] = newValue }
  }

  public var updatedAfter: GraphQLNullable<DateTime> {
    get { __data["updatedAfter"] }
    set { __data["updatedAfter"] = newValue }
  }

  public var workspaceId: GraphQLNullable<String> {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
