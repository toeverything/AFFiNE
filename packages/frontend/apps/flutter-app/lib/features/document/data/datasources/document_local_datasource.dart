import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/document.dart';

final documentLocalDataSourceProvider = Provider<DocumentLocalDataSource>((ref) {
  return DocumentLocalDataSource();
});

class DocumentLocalDataSource {
  final Map<String, List<Document>> _cache = {};
  final Map<String, Document> _docCache = {};
  final Set<String> _pendingSync = {};

  void cacheDocuments(String workspaceId, List<Document> documents) {
    _cache[workspaceId] = documents;
    for (final doc in documents) {
      _docCache['${workspaceId}_${doc.id}'] = doc;
    }
  }

  List<Document>? getCachedDocuments(String workspaceId) {
    return _cache[workspaceId];
  }

  Document? getCachedDocument(String workspaceId, String documentId) {
    return _docCache['${workspaceId}_$documentId'];
  }

  void cacheDocument(Document document) {
    _docCache['${document.workspaceId}_${document.id}'] = document;
    final list = _cache[document.workspaceId];
    if (list != null) {
      final index = list.indexWhere((d) => d.id == document.id);
      if (index >= 0) {
        _cache[document.workspaceId] = [
          for (int i = 0; i < list.length; i++)
            if (i == index) document else list[i]
        ];
      } else {
        _cache[document.workspaceId] = [...list, document];
      }
    }
  }

  void removeDocument(String workspaceId, String documentId) {
    _docCache.remove('${workspaceId}_$documentId');
    final list = _cache[workspaceId];
    if (list != null) {
      _cache[workspaceId] = list.where((d) => d.id != documentId).toList();
    }
  }

  void markPendingSync(String workspaceId, String documentId) {
    _pendingSync.add('${workspaceId}_$documentId');
  }

  bool isPendingSync(String workspaceId, String documentId) {
    return _pendingSync.contains('${workspaceId}_$documentId');
  }

  void clearPendingSync(String workspaceId, String documentId) {
    _pendingSync.remove('${workspaceId}_$documentId');
  }

  bool hasCachedDocs(String workspaceId) => _cache.containsKey(workspaceId);
}
