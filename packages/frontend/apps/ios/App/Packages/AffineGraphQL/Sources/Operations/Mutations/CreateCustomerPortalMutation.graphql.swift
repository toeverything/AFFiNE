// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class CreateCustomerPortalMutation: GraphQLMutation {
  public static let operationName: String = "createCustomerPortal"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation createCustomerPortal { createCustomerPortal }"#
    ))

  public init() {}

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("createCustomerPortal", String.self),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      CreateCustomerPortalMutation.Data.self
    ] }

    /// Create a stripe customer portal to manage payment methods
    public var createCustomerPortal: String { __data["createCustomerPortal"] }
  }
}
