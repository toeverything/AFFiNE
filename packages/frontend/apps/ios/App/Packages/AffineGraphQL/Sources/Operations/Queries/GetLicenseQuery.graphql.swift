// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetLicenseQuery: GraphQLQuery {
  public static let operationName: String = "getLicense"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getLicense($workspaceId: String!) { workspace(id: $workspaceId) { __typename license { __typename ...licenseBody } } }"#,
      fragments: [LicenseBody.self]
    ))

  public var workspaceId: String

  public init(workspaceId: String) {
    self.workspaceId = workspaceId
  }

  public var __variables: Variables? { ["workspaceId": workspaceId] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspace", Workspace.self, arguments: ["id": .variable("workspaceId")]),
    ] }

    /// Get workspace by id
    public var workspace: Workspace { __data["workspace"] }

    /// Workspace
    ///
    /// Parent Type: `WorkspaceType`
    public struct Workspace: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("license", License?.self),
      ] }

      /// The selfhost license of the workspace
      public var license: License? { __data["license"] }

      /// Workspace.License
      ///
      /// Parent Type: `License`
      public struct License: AffineGraphQL.SelectionSet {
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
}
