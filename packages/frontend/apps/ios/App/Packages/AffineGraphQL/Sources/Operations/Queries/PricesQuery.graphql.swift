// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class PricesQuery: GraphQLQuery {
  public static let operationName: String = "prices"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query prices { prices { __typename type plan currency amount yearlyAmount lifetimeAmount } }"#
    ))

  public init() {}

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("prices", [Price].self),
    ] }
    public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
      PricesQuery.Data.self
    ] }

    public var prices: [Price] { __data["prices"] }

    /// Price
    ///
    /// Parent Type: `SubscriptionPrice`
    public struct Price: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.SubscriptionPrice }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("type", String.self),
        .field("plan", GraphQLEnum<AffineGraphQL.SubscriptionPlan>.self),
        .field("currency", String.self),
        .field("amount", Int?.self),
        .field("yearlyAmount", Int?.self),
        .field("lifetimeAmount", Int?.self),
      ] }
      public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
        PricesQuery.Data.Price.self
      ] }

      public var type: String { __data["type"] }
      public var plan: GraphQLEnum<AffineGraphQL.SubscriptionPlan> { __data["plan"] }
      public var currency: String { __data["currency"] }
      public var amount: Int? { __data["amount"] }
      public var yearlyAmount: Int? { __data["yearlyAmount"] }
      public var lifetimeAmount: Int? { __data["lifetimeAmount"] }
    }
  }
}
