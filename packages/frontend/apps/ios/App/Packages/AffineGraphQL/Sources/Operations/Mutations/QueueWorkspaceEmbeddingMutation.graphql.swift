// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class QueueWorkspaceEmbeddingMutation: GraphQLMutation {
  public static let operationName: String = "queueWorkspaceEmbedding"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation queueWorkspaceEmbedding($workspaceId: String!, $docId: [String!]!) { queueWorkspaceEmbedding(workspaceId: $workspaceId, docId: $docId) }"#
    ))

  public var workspaceId: String
  public var docId: [String]

  public init(
    workspaceId: String,
    docId: [String]
  ) {
    self.workspaceId = workspaceId
    self.docId = docId
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "docId": docId
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("queueWorkspaceEmbedding", Bool.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "docId": .variable("docId")
      ]),
    ] }

    /// queue workspace doc embedding
    public var queueWorkspaceEmbedding: Bool { __data["queueWorkspaceEmbedding"] }
  }
}
