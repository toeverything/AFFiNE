import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/tag.dart';
import '../../data/repositories/tag_repository_impl.dart';

final tagsListProvider = FutureProvider.family<List<Tag>, String>((ref, wsId) async {
  return ref.watch(tagRepositoryProvider).getTags(wsId);
});
