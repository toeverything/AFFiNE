// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ApplyDocUpdatesQuery: GraphQLQuery {
  public static let operationName: String = "applyDocUpdates"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query applyDocUpdates($workspaceId: String!, $docId: String!, $op: String!, $updates: String!) { applyDocUpdates( workspaceId: $workspaceId docId: $docId op: $op updates: $updates ) }"#
    ))

  public var workspaceId: String
  public var docId: String
  public var op: String
  public var updates: String

  public init(
    workspaceId: String,
    docId: String,
    op: String,
    updates: String
  ) {
    self.workspaceId = workspaceId
    self.docId = docId
    self.op = op
    self.updates = updates
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "docId": docId,
    "op": op,
    "updates": updates
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("applyDocUpdates", String.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "docId": .variable("docId"),
        "op": .variable("op"),
        "updates": .variable("updates")
      ]),
    ] }

    /// Apply updates to a doc using LLM and return the merged markdown.
    public var applyDocUpdates: String { __data["applyDocUpdates"] }
  }
}
