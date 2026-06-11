import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/workspace.dart';
import '../../domain/repositories/workspace_repository.dart';
import '../../data/datasources/workspace_remote_datasource.dart';
import '../../data/repositories/workspace_repository_impl.dart';

final workspaceListProvider = FutureProvider<List<Workspace>>((ref) async {
  final repo = ref.watch(workspaceRepositoryProvider);
  return repo.getWorkspaces();
});

final workspaceRepositoryProvider = Provider<WorkspaceRepository>((ref) {
  final dataSource = ref.watch(workspaceDataSourceProvider);
  return WorkspaceRepositoryImpl(dataSource);
});

final currentWorkspaceIdProvider = StateProvider<String?>((ref) => null);
