import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_datasource.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final dataSource = ref.watch(authDataSourceProvider);
  return AuthRepositoryImpl(dataSource);
});

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDataSource _dataSource;

  AuthRepositoryImpl(this._dataSource);

  @override
  Future<User> signIn({required String email, required String password}) {
    return _dataSource.signIn(email, password);
  }

  @override
  Future<User> signUp({required String name, required String email, required String password}) {
    return _dataSource.signUp(name, email, password);
  }

  @override
  Future<void> sendMagicLink(String email) {
    return _dataSource.sendMagicLink(email);
  }

  @override
  Future<User> verifyMagicLink(String token) {
    return _dataSource.verifyMagicLink(token);
  }

  @override
  Future<User> oAuthLogin(String provider, String code) {
    return _dataSource.oAuthLogin(provider, code);
  }

  @override
  Future<void> signOut() {
    return _dataSource.signOut();
  }

  @override
  Future<User?> getCurrentUser() {
    return _dataSource.getCurrentUser();
  }

  @override
  Future<bool> isAuthenticated() {
    return _dataSource.isAuthenticated();
  }

  @override
  Future<String?> getAccessToken() {
    return _dataSource.getAccessToken();
  }
}
