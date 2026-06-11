import '../../domain/entities/workspace.dart';
import '../../domain/repositories/workspace_repository.dart';
import '../datasources/workspace_remote_datasource.dart';

class WorkspaceRepositoryImpl implements WorkspaceRepository {
  final WorkspaceRemoteDataSource _dataSource;

  WorkspaceRepositoryImpl(this._dataSource);

  @override
  Future<List<Workspace>> getWorkspaces() {
    return _dataSource.getWorkspaces();
  }

  @override
  Future<Workspace> getWorkspace(String id) {
    return _dataSource.getWorkspace(id);
  }

  @override
  Future<Workspace> createWorkspace(String name, String? description) {
    return _dataSource.createWorkspace(name, description);
  }

  @override
  Future<void> deleteWorkspace(String id) {
    return _dataSource.deleteWorkspace(id);
  }
}
