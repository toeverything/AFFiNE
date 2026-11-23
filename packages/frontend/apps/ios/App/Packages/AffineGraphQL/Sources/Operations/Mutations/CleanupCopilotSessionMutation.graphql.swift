// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CleanupCopilotSessionMutation: GraphQLMutation {
  public static let operationName: String = "cleanupCopilotSession"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation cleanupCopilotSession($input: DeleteSessionInput!) { cleanupCopilotSession(options: $input) }"#
    ))

  public var input: DeleteSessionInput

  public init(input: DeleteSessionInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("cleanupCopilotSession", [String].self, arguments: ["options": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CleanupCopilotSessionMutation.Data.self
    ] }

    /// Cleanup sessions
    public var cleanupCopilotSession: [String] { __data["cleanupCopilotSession"] }
  }
}
