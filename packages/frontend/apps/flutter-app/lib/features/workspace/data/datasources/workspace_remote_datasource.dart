import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/workspace.dart';
import '../../../../core/constants/api_constants.dart';

final workspaceDataSourceProvider = Provider<WorkspaceRemoteDataSource>((ref) {
  return WorkspaceRemoteDataSource();
});

class WorkspaceRemoteDataSource {
  Future<String?> _getToken() async {
    return null;
  }

  Future<List<Workspace>> getWorkspaces() async {
    final response = await _graphQlRequest({
      'query': '''
      query {
        workspaces {
          id
          name
          avatarUrl
          description
          memberCount
          team
        }
      }
      '''
    });
    final data = response['data'] as Map<String, dynamic>?;
    final workspaces = data?['workspaces'] as List<dynamic>? ?? [];
    return workspaces.map((w) {
      final ws = w as Map<String, dynamic>;
      return Workspace(
        id: ws['id'] as String? ?? '',
        name: ws['name'] as String? ?? '',
        avatarUrl: ws['avatarUrl'] as String?,
        description: ws['description'] as String?,
        memberCount: ws['memberCount']?.toString(),
        isTeam: ws['team'] as bool? ?? false,
      );
    }).toList();
  }

  Future<Workspace> getWorkspace(String id) async {
    final response = await _graphQlRequest({
      'query': '''
      query GetWorkspace(\$id: String!) {
        workspace(id: \$id) {
          id
          name
          avatarUrl
          description
          memberCount
          team
        }
      }
      ''',
      'variables': {'id': id},
    });
    final data = response['data'] as Map<String, dynamic>?;
    final ws = data?['workspace'] as Map<String, dynamic>? ?? {};
    return Workspace(
      id: ws['id'] as String? ?? '',
      name: ws['name'] as String? ?? '',
      avatarUrl: ws['avatarUrl'] as String?,
      description: ws['description'] as String?,
      memberCount: ws['memberCount']?.toString(),
      isTeam: ws['team'] as bool? ?? false,
    );
  }

  Future<Workspace> createWorkspace(String name, String? description) async {
    final response = await _graphQlRequest({
      'query': '''
      mutation CreateWorkspace(\$name: String!, \$description: String) {
        createWorkspace(input: {name: \$name, description: \$description}) {
          id
          name
          avatarUrl
          description
          memberCount
          team
        }
      }
      ''',
      'variables': {'name': name, 'description': description},
    });
    final data = response['data'] as Map<String, dynamic>?;
    final ws = data?['createWorkspace'] as Map<String, dynamic>? ?? {};
    return Workspace(
      id: ws['id'] as String? ?? '',
      name: ws['name'] as String? ?? '',
      avatarUrl: ws['avatarUrl'] as String?,
      description: ws['description'] as String?,
      memberCount: ws['memberCount']?.toString(),
      isTeam: ws['team'] as bool? ?? false,
    );
  }

  Future<void> deleteWorkspace(String id) async {
    await _graphQlRequest({
      'query': '''
      mutation DeleteWorkspace(\$id: String!) {
        deleteWorkspace(id: \$id)
      }
      ''',
      'variables': {'id': id},
    });
  }

  Future<Map<String, dynamic>> _graphQlRequest(Map<String, dynamic> body) async {
    final baseUrl = ApiConstants.defaultBaseUrl;
    final uri = Uri.parse('$baseUrl${ApiConstants.graphQlPath}');
    final token = await _getToken();

    final client = HttpClient();
    client.connectionTimeout = ApiConstants.connectionTimeout;
    try {
      final request = await client.postUrl(uri);
      request.headers.set('Content-Type', 'application/json');
      if (token != null) {
        request.headers.set('Authorization', 'Bearer $token');
      }
      request.write(jsonEncode(body));
      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();
      final decoded = jsonDecode(responseBody) as Map<String, dynamic>;

      if (decoded.containsKey('errors')) {
        throw WorkspaceException(decoded['errors'].toString());
      }
      return decoded;
    } finally {
      client.close();
    }
  }
}

class WorkspaceException implements Exception {
  final String message;
  WorkspaceException(this.message);

  @override
  String toString() => message;
}
