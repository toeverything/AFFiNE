import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/collection.dart';
import '../../domain/repositories/collection_repository.dart';
import '../datasources/collection_remote_datasource.dart';

final collectionRepositoryProvider = Provider<CollectionRepository>((ref) {
  return CollectionRepositoryImpl(ref.watch(collectionDataSourceProvider));
});

class CollectionRepositoryImpl implements CollectionRepository {
  final CollectionRemoteDataSource _ds;
  CollectionRepositoryImpl(this._ds);

  @override
  Future<List<Collection>> getCollections(String workspaceId) => _ds.getCollections(workspaceId);
  @override
  Future<Collection> getCollection(String workspaceId, String collectionId) => _ds.getCollection(workspaceId, collectionId);
  @override
  Future<Collection> createCollection(String workspaceId, String name, String? description) => _ds.createCollection(workspaceId, name, description);
  @override
  Future<Collection> updateCollection(String workspaceId, String collectionId, {String? name, String? description}) => _ds.updateCollection(workspaceId, collectionId, name: name, description: description);
  @override
  Future<void> deleteCollection(String workspaceId, String collectionId) => _ds.deleteCollection(workspaceId, collectionId);
}
