import '../entities/tag.dart';

abstract class TagRepository {
  Future<List<Tag>> getTags(String workspaceId);
  Future<Tag> createTag(String workspaceId, String name, String? color);
  Future<void> deleteTag(String workspaceId, String tagId);
}
