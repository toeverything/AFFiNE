import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../domain/entities/user.dart';
import '../models/user_dto.dart';
import '../models/login_request_dto.dart';
import '../../../../core/constants/api_constants.dart';

final authDataSourceProvider = Provider<AuthRemoteDataSource>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return AuthRemoteDataSource(storage);
});

final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});

class AuthRemoteDataSource {
  final FlutterSecureStorage _storage;

  AuthRemoteDataSource(this._storage);

  Future<User> signIn(String email, String password) async {
    final dto = LoginRequestDto(email: email, password: password);
    final response = await _apiPost('/api/auth/sign-in', dto.toJson());
    return _processAuthResponse(response);
  }

  Future<User> signUp(String name, String email, String password) async {
    final dto = SignUpRequestDto(name: name, email: email, password: password);
    final response = await _apiPost('/api/auth/sign-up', dto.toJson());
    return _processAuthResponse(response);
  }

  Future<void> sendMagicLink(String email) async {
    final dto = MagicLinkRequestDto(email: email);
    await _apiPost('/api/auth/magic-link', dto.toJson());
  }

  Future<User> verifyMagicLink(String token) async {
    final response = await _apiPost('/api/auth/magic-link/verify', {'token': token});
    return _processAuthResponse(response);
  }

  Future<User> oAuthLogin(String provider, String code) async {
    final dto = OAuthRequestDto(provider: provider, code: code);
    final response = await _apiPost('/api/auth/oauth/callback', dto.toJson());
    return _processAuthResponse(response);
  }

  Future<void> signOut() async {
    await _storage.delete(key: ApiConstants.authTokenKey);
    await _storage.delete(key: ApiConstants.refreshTokenKey);
    await _storage.delete(key: ApiConstants.userDataKey);
  }

  Future<User?> getCurrentUser() async {
    final userData = await _storage.read(key: ApiConstants.userDataKey);
    if (userData == null) return null;
    final decoded = jsonDecode(userData) as Map<String, dynamic>;
    final dto = UserDto.fromJson(decoded);
    return User(id: dto.id, name: dto.name, email: dto.email, avatarUrl: dto.avatarUrl);
  }

  Future<bool> isAuthenticated() async {
    final token = await _storage.read(key: ApiConstants.authTokenKey);
    return token != null && token.isNotEmpty;
  }

  Future<String?> getAccessToken() async {
    return await _storage.read(key: ApiConstants.authTokenKey);
  }

  Future<Map<String, dynamic>> _apiPost(String path, Map<String, dynamic> body) async {
    final baseUrl = ApiConstants.defaultBaseUrl;
    final uri = Uri.parse('$baseUrl$path');
    final token = await _storage.read(key: ApiConstants.authTokenKey);

    final client = HttpClient();
    client.connectionTimeout = ApiConstants.connectionTimeout;
    try {
      final request = await client.postUrl(uri);
      request.headers.set('Content-Type', 'application/json');
      if (token != null && token.isNotEmpty) {
        request.headers.set('Authorization', 'Bearer $token');
      }
      request.write(jsonEncode(body));
      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();
      final decoded = jsonDecode(responseBody) as Map<String, dynamic>;
      if (response.statusCode >= 400) {
        throw AuthException('Request failed with status ${response.statusCode}');
      }
      return decoded;
    } finally {
      client.close();
    }
  }

  Future<User> _processAuthResponse(Map<String, dynamic> response) async {
    final token = response['token'] as String?;
    final userJson = response['user'] as Map<String, dynamic>? ?? response;

    if (token != null) {
      await _storage.write(key: ApiConstants.authTokenKey, value: token);
    }

    final dto = UserDto.fromJson(userJson);
    await _storage.write(key: ApiConstants.userDataKey, value: jsonEncode(dto.toJson()));

    return User(id: dto.id, name: dto.name, email: dto.email, avatarUrl: dto.avatarUrl);
  }
}

class AuthException implements Exception {
  final String message;
  AuthException(this.message);

  @override
  String toString() => message;
}
