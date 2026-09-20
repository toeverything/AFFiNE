// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct TranscriptionQualityInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    degraded: GraphQLNullable<Bool> = nil,
    overflowCount: GraphQLNullable<Int> = nil
  ) {
    __data = InputDict([
      "degraded": degraded,
      "overflowCount": overflowCount
    ])
  }

  public var degraded: GraphQLNullable<Bool> {
    get { __data["degraded"] }
    set { __data["degraded"] = newValue }
  }

  public var overflowCount: GraphQLNullable<Int> {
    get { __data["overflowCount"] }
    set { __data["overflowCount"] = newValue }
  }
}
