// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct UpdateAppConfigInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    key: String,
    module: String,
    value: JSON
  ) {
    __data = InputDict([
      "key": key,
      "module": module,
      "value": value
    ])
  }

  public var key: String {
    get { __data["key"] }
    set { __data["key"] = newValue }
  }

  public var module: String {
    get { __data["module"] }
    set { __data["module"] = newValue }
  }

  public var value: JSON {
    get { __data["value"] }
    set { __data["value"] = newValue }
  }
}
