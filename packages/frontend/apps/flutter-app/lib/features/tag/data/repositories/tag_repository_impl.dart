import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/tag.dart';
import '../../domain/repositories/tag_repository.dart';
import '../datasources/tag_remote_datasource.dart';

final tagRepositoryProvider = Provider<TagRepository>((ref) {
  return TagRepositoryImpl(ref.watch(tagDataSourceProvider));
});

class TagRepositoryImpl implements TagRepository {
  final TagRemoteDataSource _ds;
  TagRepositoryImpl(this._ds);

  @override Future<List<Tag>> getTags(String wsId) => _ds.getTags(wsId);
  @override Future<Tag> createTag(String wsId, String name, String? color) => _ds.createTag(wsId, name, color);
  @override Future<void> deleteTag(String wsId, String tagId) => _ds.deleteTag(wsId, tagId);
}
