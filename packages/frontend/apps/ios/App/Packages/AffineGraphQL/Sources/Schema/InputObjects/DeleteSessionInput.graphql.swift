// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct DeleteSessionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    docId: GraphQLNullable<String> = nil,
    sessionIds: [String],
    workspaceId: String
  ) {
    __data = InputDict([
      "docId": docId,
      "sessionIds": sessionIds,
      "workspaceId": workspaceId
    ])
  }

  public var docId: GraphQLNullable<String> {
    get { __data["docId"] }
    set { __data["docId"] = newValue }
  }

  public var sessionIds: [String] {
    get { __data["sessionIds"] }
    set { __data["sessionIds"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
