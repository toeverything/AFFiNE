// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct UpdateWorkspaceCalendarsInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    items: [WorkspaceCalendarItemInput],
    workspaceId: String
  ) {
    __data = InputDict([
      "items": items,
      "workspaceId": workspaceId
    ])
  }

  public var items: [WorkspaceCalendarItemInput] {
    get { __data["items"] }
    set { __data["items"] = newValue }
  }

  public var workspaceId: String {
    get { __data["workspaceId"] }
    set { __data["workspaceId"] = newValue }
  }
}
