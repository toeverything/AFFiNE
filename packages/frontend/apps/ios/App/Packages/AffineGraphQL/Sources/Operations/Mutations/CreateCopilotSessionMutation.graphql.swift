// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateCopilotSessionMutation: GraphQLMutation {
  public static let operationName: String = "createCopilotSession"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createCopilotSession($options: CreateChatSessionInput!) { createCopilotSession(options: $options) }"#
    ))

  public var options: CreateChatSessionInput

  public init(options: CreateChatSessionInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createCopilotSession", String.self, arguments: ["options": .variable("options")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CreateCopilotSessionMutation.Data.self
    ] }

    /// Create a chat session
    @available(*, deprecated, message: "use `createCopilotSessionWithHistory` instead")
    public var createCopilotSession: String { __data["createCopilotSession"] }
  }
}
