export enum DocRole {
  /**
   * `None` equals to `role = null`, it only exists to give a value that API can use
   */
  None = -(1 << 15),
  External = 0,
  Reader = 10,
  Commenter = 15,
  Editor = 20,
  Manager = 30,
  Owner = 99,
}

export enum WorkspaceRole {
  External = -99,
  Collaborator = 1,
  Admin = 10,
  Owner = 99,
}
