// @generated
// This file was automatically generated and should not be edited.

@_exported import ApolloAPI

public class GetWorkspaceRolePermissionsQuery: GraphQLQuery {
  public static let operationName: String = "getWorkspaceRolePermissions"
  public static let operationDocument: ApolloAPI.OperationDocument = .init(
    definition: .init(
      #"query getWorkspaceRolePermissions($id: String!) { workspaceRolePermissions(id: $id) { __typename permissions { __typename Workspace_Administrators_Manage Workspace_Blobs_List Workspace_Blobs_Read Workspace_Blobs_Write Workspace_Copilot Workspace_CreateDoc Workspace_Delete Workspace_Organize_Read Workspace_Payment_Manage Workspace_Properties_Create Workspace_Properties_Delete Workspace_Properties_Read Workspace_Properties_Update Workspace_Read Workspace_Settings_Read Workspace_Settings_Update Workspace_Sync Workspace_TransferOwner Workspace_Users_Manage Workspace_Users_Read } } }"#
    ))

  public var id: String

  public init(id: String) {
    self.id = id
  }

  public var __variables: Variables? { ["id": id] }

  public struct Data: AffineGraphQL.SelectionSet {
    public let __data: DataDict
    public init(_dataDict: DataDict) { __data = _dataDict }

    public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.Query }
    public static var __selections: [ApolloAPI.Selection] { [
      .field("workspaceRolePermissions", WorkspaceRolePermissions.self, arguments: ["id": .variable("id")]),
    ] }

    /// Get workspace role permissions
    @available(*, deprecated, message: "use WorkspaceType[permissions] instead")
    public var workspaceRolePermissions: WorkspaceRolePermissions { __data["workspaceRolePermissions"] }

    /// WorkspaceRolePermissions
    ///
    /// Parent Type: `WorkspaceRolePermissions`
    public struct WorkspaceRolePermissions: AffineGraphQL.SelectionSet {
      public let __data: DataDict
      public init(_dataDict: DataDict) { __data = _dataDict }

      public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspaceRolePermissions }
      public static var __selections: [ApolloAPI.Selection] { [
        .field("__typename", String.self),
        .field("permissions", Permissions.self),
      ] }

      public var permissions: Permissions { __data["permissions"] }

      /// WorkspaceRolePermissions.Permissions
      ///
      /// Parent Type: `WorkspacePermissions`
      public struct Permissions: AffineGraphQL.SelectionSet {
        public let __data: DataDict
        public init(_dataDict: DataDict) { __data = _dataDict }

        public static var __parentType: any ApolloAPI.ParentType { AffineGraphQL.Objects.WorkspacePermissions }
        public static var __selections: [ApolloAPI.Selection] { [
          .field("__typename", String.self),
          .field("Workspace_Administrators_Manage", Bool.self),
          .field("Workspace_Blobs_List", Bool.self),
          .field("Workspace_Blobs_Read", Bool.self),
          .field("Workspace_Blobs_Write", Bool.self),
          .field("Workspace_Copilot", Bool.self),
          .field("Workspace_CreateDoc", Bool.self),
          .field("Workspace_Delete", Bool.self),
          .field("Workspace_Organize_Read", Bool.self),
          .field("Workspace_Payment_Manage", Bool.self),
          .field("Workspace_Properties_Create", Bool.self),
          .field("Workspace_Properties_Delete", Bool.self),
          .field("Workspace_Properties_Read", Bool.self),
          .field("Workspace_Properties_Update", Bool.self),
          .field("Workspace_Read", Bool.self),
          .field("Workspace_Settings_Read", Bool.self),
          .field("Workspace_Settings_Update", Bool.self),
          .field("Workspace_Sync", Bool.self),
          .field("Workspace_TransferOwner", Bool.self),
          .field("Workspace_Users_Manage", Bool.self),
          .field("Workspace_Users_Read", Bool.self),
        ] }

        public var workspace_Administrators_Manage: Bool { __data["Workspace_Administrators_Manage"] }
        public var workspace_Blobs_List: Bool { __data["Workspace_Blobs_List"] }
        public var workspace_Blobs_Read: Bool { __data["Workspace_Blobs_Read"] }
        public var workspace_Blobs_Write: Bool { __data["Workspace_Blobs_Write"] }
        public var workspace_Copilot: Bool { __data["Workspace_Copilot"] }
        public var workspace_CreateDoc: Bool { __data["Workspace_CreateDoc"] }
        public var workspace_Delete: Bool { __data["Workspace_Delete"] }
        public var workspace_Organize_Read: Bool { __data["Workspace_Organize_Read"] }
        public var workspace_Payment_Manage: Bool { __data["Workspace_Payment_Manage"] }
        public var workspace_Properties_Create: Bool { __data["Workspace_Properties_Create"] }
        public var workspace_Properties_Delete: Bool { __data["Workspace_Properties_Delete"] }
        public var workspace_Properties_Read: Bool { __data["Workspace_Properties_Read"] }
        public var workspace_Properties_Update: Bool { __data["Workspace_Properties_Update"] }
        public var workspace_Read: Bool { __data["Workspace_Read"] }
        public var workspace_Settings_Read: Bool { __data["Workspace_Settings_Read"] }
        public var workspace_Settings_Update: Bool { __data["Workspace_Settings_Update"] }
        public var workspace_Sync: Bool { __data["Workspace_Sync"] }
        public var workspace_TransferOwner: Bool { __data["Workspace_TransferOwner"] }
        public var workspace_Users_Manage: Bool { __data["Workspace_Users_Manage"] }
        public var workspace_Users_Read: Bool { __data["Workspace_Users_Read"] }
      }
    }
  }
}
