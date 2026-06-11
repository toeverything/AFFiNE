class ApiConstants {
  ApiConstants._();

  static const String defaultBaseUrl = 'https://app.affine.pro';
  static const String graphQlPath = '/graphql';
  static const String apiPath = '/api';

  static const Duration connectionTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);

  static const String authTokenKey = 'auth_token';
  static const String refreshTokenKey = 'refresh_token';
  static const String userDataKey = 'user_data';
}
