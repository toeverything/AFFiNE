// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct UpdateDocUserRoleInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    docId: String,
    role: GraphQLEnum<DocRole>,
    userId: String,
    workspaceId: String
  ) {
    __data = InputDict([
      "docId": docId,
      "role": role,
      "userId": userId,
      "workspaceId": workspaceId
    ])
  }

  public var docId: String {
    get { __data["docId"] }
    set { __data["docId"] = newValue }
  }

  public var role: GraphQLEnum<DocRole> {
    get { __data["role"] }
    set { __data["role"] = newValue }
  }

  public var userId: String {
    get { __data["userId"] }
    set { __data["userId"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
