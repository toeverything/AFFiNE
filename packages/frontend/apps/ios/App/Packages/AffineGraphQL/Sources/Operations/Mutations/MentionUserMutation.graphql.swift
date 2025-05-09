// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class MentionUserMutation: GraphQLMutation {
  public static let operationName: String = "mentionUser"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation mentionUser($input: MentionInput!) { mentionUser(input: $input) }"#
    ))

  public var input: MentionInput

  public init(input: MentionInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("mentionUser", AffineGraphQL.ID.self, arguments: ["input": .variable("input")]),
    ] }

    /// mention user in a doc
    public var mentionUser: AffineGraphQL.ID { __data["mentionUser"] }
  }
}
