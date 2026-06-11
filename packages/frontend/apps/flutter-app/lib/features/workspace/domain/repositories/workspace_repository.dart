import '../entities/workspace.dart';

abstract class WorkspaceRepository {
  Future<List<Workspace>> getWorkspaces();
  Future<Workspace> getWorkspace(String id);
  Future<Workspace> createWorkspace(String name, String? description);
  Future<void> deleteWorkspace(String id);
}
