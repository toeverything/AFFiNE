class Tag {
  final String id;
  final String workspaceId;
  final String name;
  final String? color;
  final int documentCount;

  const Tag({
    required this.id,
    required this.workspaceId,
    required this.name,
    this.color,
    this.documentCount = 0,
  });

  Tag copyWith({String? id, String? workspaceId, String? name, String? color, int? documentCount}) {
    return Tag(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      name: name ?? this.name,
      color: color ?? this.color,
      documentCount: documentCount ?? this.documentCount,
    );
  }
}
