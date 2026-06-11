import 'user.dart';

enum AuthStatus {
  initial,
  authenticated,
  unauthenticated,
  loading,
  error,
}

class AuthState {
  final AuthStatus status;
  final User? user;
  final String? errorMessage;
  final bool isAuthenticated;

  const AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.errorMessage,
    this.isAuthenticated = false,
  });

  factory AuthState.initial() => const AuthState(
    status: AuthStatus.initial,
  );

  factory AuthState.authenticated(User user) => AuthState(
    status: AuthStatus.authenticated,
    user: user,
    isAuthenticated: true,
  );

  factory AuthState.unauthenticated() => const AuthState(
    status: AuthStatus.unauthenticated,
  );

  factory AuthState.loading() => const AuthState(
    status: AuthStatus.loading,
  );

  factory AuthState.error(String message) => AuthState(
    status: AuthStatus.error,
    errorMessage: message,
  );

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    String? errorMessage,
    bool? isAuthenticated,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      errorMessage: errorMessage ?? this.errorMessage,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
    );
  }
}
