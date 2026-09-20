// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateCheckoutSessionMutation: GraphQLMutation {
  public static let operationName: String = "createCheckoutSession"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createCheckoutSession($input: CreateCheckoutSessionInput!) { createCheckoutSession(input: $input) }"#
    ))

  public var input: CreateCheckoutSessionInput

  public init(input: CreateCheckoutSessionInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createCheckoutSession", String.self, arguments: ["input": .variable("input")]),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CreateCheckoutSessionMutation.Data.self
    ] }

    /// Create a subscription checkout link of stripe
    public var createCheckoutSession: String { __data["createCheckoutSession"] }
  }
}
