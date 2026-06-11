import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/document.dart';
import '../../data/datasources/document_local_datasource.dart';
import '../../data/repositories/document_repository_impl.dart';

final documentListProvider = FutureProvider.family<List<Document>, String>((ref, workspaceId) async {
  final repo = ref.watch(documentRepositoryProvider);
  final localDS = ref.watch(documentLocalDataSourceProvider);
  try {
    final docs = await repo.getDocuments(workspaceId);
    localDS.cacheDocuments(workspaceId, docs);
    return docs;
  } catch (e) {
    final cached = localDS.getCachedDocuments(workspaceId);
    if (cached != null) return cached;
    rethrow;
  }
});

final documentDetailProvider = FutureProvider.family<Document, ({String workspaceId, String documentId})>(
  (ref, params) async {
    final repo = ref.watch(documentRepositoryProvider);
    final localDS = ref.watch(documentLocalDataSourceProvider);
    try {
      final doc = await repo.getDocument(params.workspaceId, params.documentId);
      localDS.cacheDocument(doc);
      return doc;
    } catch (e) {
      final cached = localDS.getCachedDocument(params.workspaceId, params.documentId);
      if (cached != null) return cached;
      rethrow;
    }
  },
);
