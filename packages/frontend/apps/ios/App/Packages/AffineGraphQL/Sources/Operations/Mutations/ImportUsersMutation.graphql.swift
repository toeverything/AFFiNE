// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class ImportUsersMutation: GraphQLMutation {
  public static let operationName: String = "ImportUsers"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"mutation ImportUsers($input: ImportUsersInput!) { importUsers(input: $input) { __typename ... on UserType { id name email } ... on UserImportFailedType { email error } } }"#
    ))

  public var input: ImportUsersInput

  public init(input: ImportUsersInput) {
    self.input = input
  }

  public var __variables: Variables? { ["input": input] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Mutation }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("importUsers", [ImportUser].self, arguments: ["input": .variable("input")]),
    ] }

    /// import users
    public var importUsers: [ImportUser] { __data["importUsers"] }

    /// ImportUser
    ///
    /// Parent Type: `UserImportResultType`
    public struct ImportUser: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Unions.UserImportResultType }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .inlineFragment(AsUserType.self),
        .inlineFragment(AsUserImportFailedType.self),
      ] }

      public var asUserType: AsUserType? { _asInlineFragment() }
      public var asUserImportFailedType: AsUserImportFailedType? { _asInlineFragment() }

      /// ImportUser.AsUserType
      ///
      /// Parent Type: `UserType`
      public struct AsUserType: AffineGraphQL.InlineFragment {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public typealias RootEntityType = ImportUsersMutation.Data.ImportUser
        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("id", AffineGraphQL.ID.self),
          .field("name", String.self),
          .field("email", String.self),
        ] }

        public var id: AffineGraphQL.ID { __data["id"] }
        /// User name
        public var name: String { __data["name"] }
        /// User email
        public var email: String { __data["email"] }
      }

      /// ImportUser.AsUserImportFailedType
      ///
      /// Parent Type: `UserImportFailedType`
      public struct AsUserImportFailedType: AffineGraphQL.InlineFragment {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public typealias RootEntityType = ImportUsersMutation.Data.ImportUser
        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.UserImportFailedType }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("email", String.self),
          .field("error", String.self),
        ] }

        public var email: String { __data["email"] }
        public var error: String { __data["error"] }
      }
    }
  }
}
