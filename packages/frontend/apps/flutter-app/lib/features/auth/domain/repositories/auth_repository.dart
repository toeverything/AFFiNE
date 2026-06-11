import '../entities/user.dart';

abstract class AuthRepository {
  Future<User> signIn({required String email, required String password});
  Future<User> signUp({required String name, required String email, required String password});
  Future<void> sendMagicLink(String email);
  Future<User> verifyMagicLink(String token);
  Future<User> oAuthLogin(String provider, String code);
  Future<void> signOut();
  Future<User?> getCurrentUser();
  Future<bool> isAuthenticated();
  Future<String?> getAccessToken();
}
