// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class UploadCommentAttachmentMutation: GraphQLMutation {
  public static let operationName: String = "uploadCommentAttachment"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation uploadCommentAttachment($workspaceId: String!, $docId: String!, $attachment: Upload!) { uploadCommentAttachment( workspaceId: $workspaceId docId: $docId attachment: $attachment ) }"#
    ))

  public var workspaceId: String
  public var docId: String
  public var attachment: Upload

  public init(
    workspaceId: String,
    docId: String,
    attachment: Upload
  ) {
    self.workspaceId = workspaceId
    self.docId = docId
    self.attachment = attachment
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "docId": docId,
    "attachment": attachment
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("uploadCommentAttachment", String.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "docId": .variable("docId"),
        "attachment": .variable("attachment")
      ]),
    ] }

    /// Upload a comment attachment and return the access url
    public var uploadCommentAttachment: String { __data["uploadCommentAttachment"] }
  }
}
