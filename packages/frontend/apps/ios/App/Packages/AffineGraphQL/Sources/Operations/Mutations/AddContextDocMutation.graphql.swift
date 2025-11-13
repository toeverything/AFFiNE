// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class AddContextDocMutation: GraphQLMutation {
  public static let operationName: String = "addContextDoc"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation addContextDoc($options: AddContextDocInput!) { addContextDoc(options: $options) { __typename id createdAt status } }"#
    ))

  public var options: AddContextDocInput

  public init(options: AddContextDocInput) {
    self.options = options
  }

  public var __variables: Variables? { ["options": options] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("addContextDoc", AddContextDoc.self, arguments: ["options": .variable("options")]),
    ] }

    /// add a doc to context
    public var addContextDoc: AddContextDoc { __data["addContextDoc"] }

    /// AddContextDoc
    ///
    /// Parent Type: `CopilotContextDoc`
    public struct AddContextDoc: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.CopilotContextDoc }
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
