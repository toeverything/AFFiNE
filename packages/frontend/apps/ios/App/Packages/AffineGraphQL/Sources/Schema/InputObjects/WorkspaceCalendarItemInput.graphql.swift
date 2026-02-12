// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceCalendarItemInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    colorOverride: GraphQLNullable<String> = nil,
    sortOrder: GraphQLNullable<Int> = nil,
    subscriptionId: String
  ) {
    __data = InputDict([
      "colorOverride": colorOverride,
      "sortOrder": sortOrder,
      "subscriptionId": subscriptionId
    ])
  }

  public var colorOverride: GraphQLNullable<String> {
    get { __data["colorOverride"] }
    set { __data["colorOverride"] = newValue }
  }

  public var sortOrder: GraphQLNullable<Int> {
    get { __data["sortOrder"] }
    set { __data["sortOrder"] = newValue }
  }

  public var subscriptionId: String {
    get { __data["subscriptionId"] }
    set { __data["subscriptionId"] = newValue }
  }
}
