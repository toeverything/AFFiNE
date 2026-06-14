import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/collection.dart';
import '../../data/repositories/collection_repository_impl.dart';

final collectionsListProvider = FutureProvider.family<List<Collection>, String>((ref, wsId) async {
  return ref.watch(collectionRepositoryProvider).getCollections(wsId);
});
