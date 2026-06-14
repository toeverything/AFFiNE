import '../entities/collection.dart';

abstract class CollectionRepository {
  Future<List<Collection>> getCollections(String workspaceId);
  Future<Collection> getCollection(String workspaceId, String collectionId);
  Future<Collection> createCollection(String workspaceId, String name, String? description);
  Future<Collection> updateCollection(String workspaceId, String collectionId, {String? name, String? description});
  Future<void> deleteCollection(String workspaceId, String collectionId);
}
