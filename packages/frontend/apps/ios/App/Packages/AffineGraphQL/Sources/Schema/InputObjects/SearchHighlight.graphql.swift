// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct SearchHighlight: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    before: String,
    end: String,
    field: String
  ) {
    __data = InputDict([
      "before": before,
      "end": end,
      "field": field
    ])
  }

  public var before: String {
    get { __data["before"] }
    set { __data["before"] = newValue }
  }

  public var end: String {
    get { __data["end"] }
    set { __data["end"] = newValue }
  }

  public var field: String {
    get { __data["field"] }
    set { __data["field"] = newValue }
  }
}
