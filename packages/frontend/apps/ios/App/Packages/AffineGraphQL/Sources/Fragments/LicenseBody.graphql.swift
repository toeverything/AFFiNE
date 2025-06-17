// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public struct LicenseBody: AffineGraphQL.SelectionSet, Fragment {
  public static var fragmentDefinition: StaticString {
    #"fragment licenseBody on License { __typename expiredAt installedAt quantity recurring validatedAt variant }"#
  }

  public let __data: DataDict
  public init(_dataDict: DataDict) { __data = _dataDict }

  public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.License }
  public static var __selections: [ApolloAPI.Selection] { [
    .field("__typename", String.self),
    .field("expiredAt", AffineGraphQL.DateTime?.self),
    .field("installedAt", AffineGraphQL.DateTime.self),
    .field("quantity", Int.self),
    .field("recurring", GraphQLEnum<AffineGraphQL.SubscriptionRecurring>.self),
    .field("validatedAt", AffineGraphQL.DateTime.self),
    .field("variant", GraphQLEnum<AffineGraphQL.SubscriptionVariant>?.self),
  ] }

  public var expiredAt: AffineGraphQL.DateTime? { __data["expiredAt"] }
  public var installedAt: AffineGraphQL.DateTime { __data["installedAt"] }
  public var quantity: Int { __data["quantity"] }
  public var recurring: GraphQLEnum<AffineGraphQL.SubscriptionRecurring> { __data["recurring"] }
  public var validatedAt: AffineGraphQL.DateTime { __data["validatedAt"] }
  public var variant: GraphQLEnum<AffineGraphQL.SubscriptionVariant>? { __data["variant"] }
}
