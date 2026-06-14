class Collection {
  final String id;
  final String workspaceId;
  final String name;
  final String? description;
  final String? coverUrl;
  final int documentCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Collection({
    required this.id,
    required this.workspaceId,
    required this.name,
    this.description,
    this.coverUrl,
    this.documentCount = 0,
    required this.createdAt,
    required this.updatedAt,
  });

  Collection copyWith({
    String? id,
    String? workspaceId,
    String? name,
    String? description,
    String? coverUrl,
    int? documentCount,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Collection(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      name: name ?? this.name,
      description: description ?? this.description,
      coverUrl: coverUrl ?? this.coverUrl,
      documentCount: documentCount ?? this.documentCount,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
