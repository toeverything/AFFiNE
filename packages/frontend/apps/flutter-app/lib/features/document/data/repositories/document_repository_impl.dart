import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/document.dart';
import '../../domain/repositories/document_repository.dart';
import '../datasources/document_remote_datasource.dart';

final documentRepositoryProvider = Provider<DocumentRepository>((ref) {
  final dataSource = ref.watch(documentDataSourceProvider);
  return DocumentRepositoryImpl(dataSource);
});

class DocumentRepositoryImpl implements DocumentRepository {
  final DocumentRemoteDataSource _dataSource;

  DocumentRepositoryImpl(this._dataSource);

  @override
  Future<List<Document>> getDocuments(String workspaceId, {String? searchQuery}) {
    return _dataSource.getDocuments(workspaceId, searchQuery: searchQuery);
  }

  @override
  Future<Document> getDocument(String workspaceId, String documentId) {
    return _dataSource.getDocument(workspaceId, documentId);
  }

  @override
  Future<Document> createDocument(String workspaceId, {String? title, String? content, String? parentId}) {
    return _dataSource.createDocument(workspaceId, title: title, content: content, parentId: parentId);
  }

  @override
  Future<Document> updateDocument(String workspaceId, String documentId, {String? title, String? content, List<String>? tags}) {
    return _dataSource.updateDocument(workspaceId, documentId, title: title, content: content, tags: tags);
  }

  @override
  Future<void> deleteDocument(String workspaceId, String documentId) {
    return _dataSource.deleteDocument(workspaceId, documentId);
  }

  @override
  Future<void> toggleFavorite(String workspaceId, String documentId, bool isFavorite) {
    return _dataSource.toggleFavorite(workspaceId, documentId, isFavorite);
  }
}
