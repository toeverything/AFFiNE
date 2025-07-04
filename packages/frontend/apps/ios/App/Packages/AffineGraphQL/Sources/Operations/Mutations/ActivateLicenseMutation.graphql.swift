// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ActivateLicenseMutation: GraphQLMutation {
  public static let operationName: String = "activateLicense"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation activateLicense($workspaceId: String!, $license: String!) { activateLicense(workspaceId: $workspaceId, license: $license) { __typename ...licenseBody } }"#,
      fragments: [LicenseBody.self]
    ))

  public var workspaceId: String
  public var license: String

  public init(
    workspaceId: String,
    license: String
  ) {
    self.workspaceId = workspaceId
    self.license = license
  }

  public var __variables: Variables? { [
    "workspaceId": workspaceId,
    "license": license
  ] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("activateLicense", ActivateLicense.self, arguments: [
        "workspaceId": .variable("workspaceId"),
        "license": .variable("license")
      ]),
    ] }

    public var activateLicense: ActivateLicense { __data["activateLicense"] }

    /// ActivateLicense
    ///
    /// Parent Type: `License`
    public struct ActivateLicense: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.License }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .fragment(LicenseBody.self),
      ] }

      public var expiredAt: AffineGraphQL.DateTime? { __data["expiredAt"] }
      public var installedAt: AffineGraphQL.DateTime { __data["installedAt"] }
      public var quantity: Int { __data["quantity"] }
      public var recurring: GraphQLEnum<AffineGraphQL.SubscriptionRecurring> { __data["recurring"] }
      public var validatedAt: AffineGraphQL.DateTime { __data["validatedAt"] }
      public var variant: GraphQLEnum<AffineGraphQL.SubscriptionVariant>? { __data["variant"] }

      public struct Fragments: FragmentContainer {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public var licenseBody: LicenseBody { _toFragment() }
      }
    }
  }
}
