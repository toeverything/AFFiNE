class Workspace {
  final String id;
  final String name;
  final String? avatarUrl;
  final String? description;
  final String? memberCount;
  final bool isTeam;

  const Workspace({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.description,
    this.memberCount,
    this.isTeam = false,
  });

  Workspace copyWith({
    String? id,
    String? name,
    String? avatarUrl,
    String? description,
    String? memberCount,
    bool? isTeam,
  }) {
    return Workspace(
      id: id ?? this.id,
      name: name ?? this.name,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      description: description ?? this.description,
      memberCount: memberCount ?? this.memberCount,
      isTeam: isTeam ?? this.isTeam,
    );
  }
}
