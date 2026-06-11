class LoginRequestDto {
  final String email;
  final String password;

  const LoginRequestDto({
    required this.email,
    required this.password,
  });

  Map<String, dynamic> toJson() {
    return {
      'email': email,
      'password': password,
    };
  }
}

class SignUpRequestDto {
  final String name;
  final String email;
  final String password;

  const SignUpRequestDto({
    required this.name,
    required this.email,
    required this.password,
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'email': email,
      'password': password,
    };
  }
}

class MagicLinkRequestDto {
  final String email;

  const MagicLinkRequestDto({required this.email});

  Map<String, dynamic> toJson() {
    return {'email': email};
  }
}

class OAuthRequestDto {
  final String provider;
  final String code;

  const OAuthRequestDto({
    required this.provider,
    required this.code,
  });

  Map<String, dynamic> toJson() {
    return {
      'provider': provider,
      'code': code,
    };
  }
}
