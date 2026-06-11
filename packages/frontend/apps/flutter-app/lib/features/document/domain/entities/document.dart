import 'package:intl/intl.dart';

class Document {
  final String id;
  final String workspaceId;
  final String title;
  final String? description;
  final String? content;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? createdBy;
  final bool isFavorite;
  final List<String> tags;
  final String? parentId;

  const Document({
    required this.id,
    required this.workspaceId,
    required this.title,
    this.description,
    this.content,
    required this.createdAt,
    required this.updatedAt,
    this.createdBy,
    this.isFavorite = false,
    this.tags = const [],
    this.parentId,
  });

  String get formattedDate => DateFormat('MMM d, yyyy').format(updatedAt);

  bool get isEmpty => title.isEmpty && (content == null || content!.isEmpty);

  Document copyWith({
    String? id,
    String? workspaceId,
    String? title,
    String? description,
    String? content,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? createdBy,
    bool? isFavorite,
    List<String>? tags,
    String? parentId,
  }) {
    return Document(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      title: title ?? this.title,
      description: description ?? this.description,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      createdBy: createdBy ?? this.createdBy,
      isFavorite: isFavorite ?? this.isFavorite,
      tags: tags ?? this.tags,
      parentId: parentId ?? this.parentId,
    );
  }
}
