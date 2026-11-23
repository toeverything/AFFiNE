// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ForkCopilotSessionMutation: GraphQLMutation {
  public static let operationName: String = "forkCopilotSession"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation forkCopilotSession($options: ForkChatSessionInput!) { forkCopilotSession(options: $options) }"#
    ))

  public var options: ForkChatSessionInput

  public init(options: ForkChatSessionInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("forkCopilotSession", String.self, arguments: ["options": .variable("options")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      ForkCopilotSessionMutation.Data.self
    ] }

    /// Create a chat session
    public var forkCopilotSession: String { __data["forkCopilotSession"] }
  }
}
