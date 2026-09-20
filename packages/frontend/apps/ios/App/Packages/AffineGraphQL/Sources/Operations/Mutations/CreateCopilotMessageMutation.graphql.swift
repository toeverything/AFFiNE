// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateCopilotMessageMutation: GraphQLMutation {
  public static let operationName: String = "createCopilotMessage"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createCopilotMessage($options: CreateChatMessageInput!) { createCopilotMessage(options: $options) }"#
    ))

  public var options: CreateChatMessageInput

  public init(options: CreateChatMessageInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createCopilotMessage", String.self, arguments: ["options": .variable("options")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CreateCopilotMessageMutation.Data.self
    ] }

    /// Create a chat message
    public var createCopilotMessage: String { __data["createCopilotMessage"] }
  }
}
