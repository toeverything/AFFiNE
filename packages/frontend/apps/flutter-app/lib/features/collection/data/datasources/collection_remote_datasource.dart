import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/collection.dart';
import '../../../../core/constants/api_constants.dart';

final collectionDataSourceProvider = Provider<CollectionRemoteDataSource>((ref) {
  return CollectionRemoteDataSource();
});

class CollectionRemoteDataSource {
  Future<String?> _getToken() async => null;

  Future<List<Collection>> getCollections(String workspaceId) async {
    final response = await _graphQlRequest({
      'query': '''
      query GetCollections(\$workspaceId: String!) {
        workspace(id: \$workspaceId) {
          collections {
            id
            name
            description
            coverUrl
            documentCount
            createdAt
            updatedAt
          }
        }
      }
      ''',
      'variables': {'workspaceId': workspaceId},
    });
    final data = response['data'] as Map<String, dynamic>?;
    final workspace = data?['workspace'] as Map<String, dynamic>?;
    final list = workspace?['collections'] as List<dynamic>? ?? [];
    return list.map((c) => _parse(c as Map<String, dynamic>, workspaceId)).toList();
  }

  Future<Collection> getCollection(String workspaceId, String collectionId) async {
    final response = await _graphQlRequest({
      'query': '''
      query GetCollection(\$workspaceId: String!, \$collectionId: String!) {
        workspace(id: \$workspaceId) {
          collection(id: \$collectionId) {
            id
            name
            description
            coverUrl
            documentCount
            createdAt
            updatedAt
          }
        }
      }
      ''',
      'variables': {'workspaceId': workspaceId, 'collectionId': collectionId},
    });
    final data = response['data'] as Map<String, dynamic>?;
    final workspace = data?['workspace'] as Map<String, dynamic>?;
    final c = workspace?['collection'] as Map<String, dynamic>? ?? {};
    return _parse(c, workspaceId);
  }

  Future<Collection> createCollection(String workspaceId, String name, String? description) async {
    final response = await _graphQlRequest({
      'query': '''
      mutation CreateCollection(\$workspaceId: String!, \$name: String!, \$description: String) {
        createCollection(workspaceId: \$workspaceId, input: {name: \$name, description: \$description}) {
          id
          name
          description
          coverUrl
          documentCount
          createdAt
          updatedAt
        }
      }
      ''',
      'variables': {'workspaceId': workspaceId, 'name': name, 'description': description},
    });
    final data = response['data'] as Map<String, dynamic>?;
    final c = data?['createCollection'] as Map<String, dynamic>? ?? {};
    return _parse(c, workspaceId);
  }

  Future<Collection> updateCollection(String workspaceId, String collectionId, {String? name, String? description}) async {
    final variables = <String, dynamic>{'workspaceId': workspaceId, 'collectionId': collectionId};
    if (name != null) variables['name'] = name;
    if (description != null) variables['description'] = description;
    final response = await _graphQlRequest({
      'query': '''
      mutation UpdateCollection(\$workspaceId: String!, \$collectionId: String!, \$name: String, \$description: String) {
        updateCollection(workspaceId: \$workspaceId, collectionId: \$collectionId, input: {name: \$name, description: \$description}) {
          id
          name
          description
          coverUrl
          documentCount
          createdAt
          updatedAt
        }
      }
      ''',
      'variables': variables,
    });
    final data = response['data'] as Map<String, dynamic>?;
    final c = data?['updateCollection'] as Map<String, dynamic>? ?? {};
    return _parse(c, workspaceId);
  }

  Future<void> deleteCollection(String workspaceId, String collectionId) async {
    await _graphQlRequest({
      'query': '''
      mutation DeleteCollection(\$workspaceId: String!, \$collectionId: String!) {
        deleteCollection(workspaceId: \$workspaceId, collectionId: \$collectionId)
      }
      ''',
      'variables': {'workspaceId': workspaceId, 'collectionId': collectionId},
    });
  }

  Collection _parse(Map<String, dynamic> json, String workspaceId) => Collection(
    id: json['id'] as String? ?? '',
    workspaceId: workspaceId,
    name: json['name'] as String? ?? '',
    description: json['description'] as String?,
    coverUrl: json['coverUrl'] as String?,
    documentCount: json['documentCount'] as int? ?? 0,
    createdAt: _date(json['createdAt']),
    updatedAt: _date(json['updatedAt']),
  );

  DateTime _date(dynamic d) {
    if (d == null) return DateTime.now();
    if (d is String) return DateTime.tryParse(d) ?? DateTime.now();
    if (d is int) return DateTime.fromMillisecondsSinceEpoch(d);
    return DateTime.now();
  }

  Future<Map<String, dynamic>> _graphQlRequest(Map<String, dynamic> body) async {
    final uri = Uri.parse('${ApiConstants.defaultBaseUrl}${ApiConstants.graphQlPath}');
    final token = await _getToken();
    final client = HttpClient();
    client.connectionTimeout = ApiConstants.connectionTimeout;
    try {
      final request = await client.postUrl(uri);
      request.headers.set('Content-Type', 'application/json');
      if (token != null) request.headers.set('Authorization', 'Bearer $token');
      request.write(jsonEncode(body));
      final response = await request.close();
      final decoded = jsonDecode(await response.transform(utf8.decoder).join()) as Map<String, dynamic>;
      if (decoded.containsKey('errors')) throw CollectionException(decoded['errors'].toString());
      return decoded;
    } finally {
      client.close();
    }
  }
}

class CollectionException implements Exception {
  final String message;
  CollectionException(this.message);
  @override
  String toString() => message;
}
