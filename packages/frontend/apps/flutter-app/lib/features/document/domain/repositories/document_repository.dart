import '../entities/document.dart';

abstract class DocumentRepository {
  Future<List<Document>> getDocuments(String workspaceId, {String? searchQuery});
  Future<Document> getDocument(String workspaceId, String documentId);
  Future<Document> createDocument(String workspaceId, {String? title, String? content, String? parentId});
  Future<Document> updateDocument(String workspaceId, String documentId, {String? title, String? content, List<String>? tags});
  Future<void> deleteDocument(String workspaceId, String documentId);
  Future<void> toggleFavorite(String workspaceId, String documentId, bool isFavorite);
}
