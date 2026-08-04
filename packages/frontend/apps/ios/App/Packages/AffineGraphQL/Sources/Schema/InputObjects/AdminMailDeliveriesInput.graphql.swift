// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct AdminMailDeliveriesInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    hours: Int? = nil
  ) {
    __data = InputDict([
      "hours": hours
    ])
  }

  public var hours: Int? {
    get { __data["hours"] }
    set { __data["hours"] = newValue }
  }
}
