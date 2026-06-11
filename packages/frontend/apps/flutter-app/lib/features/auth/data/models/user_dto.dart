class UserDto {
  final String id;
  final String name;
  final String email;
  final String? avatarUrl;
  final String? token;

  const UserDto({
    required this.id,
    required this.name,
    required this.email,
    this.avatarUrl,
    this.token,
  });

  factory UserDto.fromJson(Map<String, dynamic> json) {
    return UserDto(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      avatarUrl: json['avatarUrl'] as String?,
      token: json['token'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'avatarUrl': avatarUrl,
      'token': token,
    };
  }
}
