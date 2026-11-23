// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public struct PasswordLimits: AffineGraphQL.SelectionSet, Fragment {
  public static var fragmentDefinition: StaticString {
    #"fragment PasswordLimits on PasswordLimitsType { __typename minLength maxLength }"#
  }

  public let __data: DataDict
  public init(_dataDict: DataDict) { __data = _dataDict }

  public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.PasswordLimitsType }
  public static var __selections: [ApolloAPI.Selection] { [
    .field("__typename", String.self),
    .field("minLength", Int.self),
    .field("maxLength", Int.self),
  ] }
  public static var __fulfilledFragments: [any ApolloAPI.SelectionSet.Type] { [
    PasswordLimits.self
  ] }

  public var minLength: Int { __data["minLength"] }
  public var maxLength: Int { __data["maxLength"] }
}
