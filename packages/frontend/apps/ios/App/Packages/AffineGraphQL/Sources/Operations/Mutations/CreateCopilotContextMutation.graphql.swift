// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateCopilotContextMutation: GraphQLMutation {
  public static let operationName: String = "createCopilotContext"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createCopilotContext($workspaceId: String!, $sessionId: String!) { createCopilotContext(workspaceId: $workspaceId, sessionId: $sessionId) }"#
    ))

  public var workspaceId: String
  public var sessionId: String

  public init(
    workspaceId: String,
    sessionId: String
  ) {
    self.workspaceId = workspaceId
    self.sessionId = sessionId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "sessionId": sessionId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createCopilotContext", String.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "sessionId": .variable("sessionId")
      ]),
    ] }

    /// Create a context session
    public var createCopilotContext: String { __data["createCopilotContext"] }
  }
}
