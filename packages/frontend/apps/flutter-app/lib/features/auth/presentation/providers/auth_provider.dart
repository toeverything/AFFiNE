import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/auth_state.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../data/repositories/auth_repository_impl.dart';
import '../../data/datasources/auth_remote_datasource.dart';

final authNotifierProvider = NotifierProvider<AuthNotifier, AuthState>(
  AuthNotifier.new,
);

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final dataSource = ref.watch(authDataSourceProvider);
  return AuthRepositoryImpl(dataSource);
});

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() {
    _checkAuth();
    return AuthState.initial();
  }

  Future<void> _checkAuth() async {
    final repo = ref.read(authRepositoryProvider);
    final isAuth = await repo.isAuthenticated();
    if (isAuth) {
      final user = await repo.getCurrentUser();
      if (user != null) {
        state = AuthState.authenticated(user);
        return;
      }
    }
    state = AuthState.unauthenticated();
  }

  Future<void> signIn(String email, String password) async {
    state = AuthState.loading();
    try {
      final repo = ref.read(authRepositoryProvider);
      final user = await repo.signIn(email: email, password: password);
      state = AuthState.authenticated(user);
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> signUp(String name, String email, String password) async {
    state = AuthState.loading();
    try {
      final repo = ref.read(authRepositoryProvider);
      final user = await repo.signUp(name: name, email: email, password: password);
      state = AuthState.authenticated(user);
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> sendMagicLink(String email) async {
    state = AuthState.loading();
    try {
      final repo = ref.read(authRepositoryProvider);
      await repo.sendMagicLink(email);
      state = AuthState.unauthenticated();
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> verifyMagicLink(String token) async {
    state = AuthState.loading();
    try {
      final repo = ref.read(authRepositoryProvider);
      final user = await repo.verifyMagicLink(token);
      state = AuthState.authenticated(user);
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> oAuthLogin(String provider, String code) async {
    state = AuthState.loading();
    try {
      final repo = ref.read(authRepositoryProvider);
      final user = await repo.oAuthLogin(provider, code);
      state = AuthState.authenticated(user);
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> signOut() async {
    try {
      final repo = ref.read(authRepositoryProvider);
      await repo.signOut();
    } finally {
      state = AuthState.unauthenticated();
    }
  }

  void clearError() {
    if (state.status == AuthStatus.error) {
      state = AuthState.unauthenticated();
    }
  }
}
