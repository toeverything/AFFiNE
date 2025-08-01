// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AddContextBlobMutation: GraphQLMutation {
  public static let operationName: String = "addContextBlob"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation addContextBlob($options: AddContextBlobInput!) { addContextBlob(options: $options) { __typename id createdAt status } }"#
    ))

  public var options: AddContextBlobInput

  public init(options: AddContextBlobInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("addContextBlob", AddContextBlob.self, arguments: ["options": .variable("options")]),
    ] }

    /// add a blob to context
    public var addContextBlob: AddContextBlob { __data["addContextBlob"] }

    /// AddContextBlob
    ///
    /// Parent Type: `CopilotContextBlob`
    public struct AddContextBlob: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotContextBlob }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("id", AffineGraphQL.ID.self),
        .field("createdAt", AffineGraphQL.SafeInt.self),
        .field("status", GraphQLEnum<AffineGraphQL.ContextEmbedStatus>?.self),
      ] }

      public var id: AffineGraphQL.ID { __data["id"] }
      public var createdAt: AffineGraphQL.SafeInt { __data["createdAt"] }
      public var status: GraphQLEnum<AffineGraphQL.ContextEmbedStatus>? { __data["status"] }
    }
  }
}
