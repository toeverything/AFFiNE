// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UpdateCopilotSessionMutation: GraphQLMutation {
  public static let operationName: String = "updateCopilotSession"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation updateCopilotSession($options: UpdateChatSessionInput!) { updateCopilotSession(options: $options) }"#
    ))

  public var options: UpdateChatSessionInput

  public init(options: UpdateChatSessionInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("updateCopilotSession", String.self, arguments: ["options": .variable("options")]),
    ] }

    /// Update a chat session
    public var updateCopilotSession: String { __data["updateCopilotSession"] }
  }
}
