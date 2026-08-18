// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct WorkspaceByokProbeCheckInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    modelId: String,
    operation: GraphQLEnum<ByokProbeOperation>
  ) {
    __data = InputDict([
      "modelId": modelId,
      "operation": operation
    ])
  }

  public var modelId: String {
    get { __data["modelId"] }
    set { __data["modelId"] = newValue }
  }

  public var operation: GraphQLEnum<ByokProbeOperation> {
    get { __data["operation"] }
    set { __data["operation"] = newValue }
  }
}
