// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct ReorderWorkspaceByokConfigsInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    ids: [ID],
    storage: GraphQLEnum<ByokKeyStorage>,
    workspaceId: String
  ) {
    __data = InputDict([
      "ids": ids,
      "storage": storage,
      "workspaceId": workspaceId
    ])
  }

  public var ids: [ID] {
    get { __data["ids"] }
    set { __data["ids"] = newValue }
  }

  public var storage: GraphQLEnum<ByokKeyStorage> {
    get { __data["storage"] }
    set { __data["storage"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
