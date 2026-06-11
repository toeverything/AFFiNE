import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/document.dart';
import '../../../../core/constants/api_constants.dart';

final documentDataSourceProvider = Provider<DocumentRemoteDataSource>((ref) {
  return DocumentRemoteDataSource();
});

class DocumentRemoteDataSource {
  Future<String?> _getToken() async {
    return null;
  }

  Future<List<Document>> getDocuments(String workspaceId, {String? searchQuery}) async {
    final variables = <String, dynamic>{'workspaceId': workspaceId};
    if (searchQuery != null) {
      variables['query'] = searchQuery;
    }

    final response = await _graphQlRequest({
      'query': '''
      query GetDocuments(\$workspaceId: String!, \$query: String) {
        workspace(id: \$workspaceId) {
          docs(query: \$query) {
            id
            title
            description
            createdAt
            updatedAt
            createdBy
            favorite
            tags
            parentId
          }
        }
      }
      ''',
      'variables': variables,
    });

    final data = response['data'] as Map<String, dynamic>?;
    final workspace = data?['workspace'] as Map<String, dynamic>?;
    final docsJson = workspace?['docs'] as List<dynamic>? ?? [];

    return docsJson.map((d) => _parseDocument(d as Map<String, dynamic>, workspaceId)).toList();
  }

  Future<Document> getDocument(String workspaceId, String documentId) async {
    final response = await _graphQlRequest({
      'query': '''
      query GetDocument(\$workspaceId: String!, \$documentId: String!) {
        workspace(id: \$workspaceId) {
          doc(id: \$documentId) {
            id
            title
            description
            content
            createdAt
            updatedAt
            createdBy
            favorite
            tags
            parentId
          }
        }
      }
      ''',
      'variables': {'workspaceId': workspaceId, 'documentId': documentId},
    });

    final data = response['data'] as Map<String, dynamic>?;
    final workspace = data?['workspace'] as Map<String, dynamic>?;
    final docJson = workspace?['doc'] as Map<String, dynamic>? ?? {};

    return _parseDocument(docJson, workspaceId);
  }

  Future<Document> createDocument(String workspaceId, {String? title, String? content, String? parentId}) async {
    final variables = <String, dynamic>{
      'workspaceId': workspaceId,
    };
    if (title != null) variables['title'] = title;
    if (content != null) variables['content'] = content;
    if (parentId != null) variables['parentId'] = parentId;

    final response = await _graphQlRequest({
      'query': '''
      mutation CreateDocument(\$workspaceId: String!, \$title: String, \$content: String, \$parentId: String) {
        createDoc(workspaceId: \$workspaceId, input: {title: \$title, content: \$content, parentId: \$parentId}) {
          id
          title
          description
          content
          createdAt
          updatedAt
          createdBy
          favorite
          tags
          parentId
        }
      }
      ''',
      'variables': variables,
    });

    final data = response['data'] as Map<String, dynamic>?;
    final docJson = data?['createDoc'] as Map<String, dynamic>? ?? {};
    return _parseDocument(docJson, workspaceId);
  }

  Future<Document> updateDocument(String workspaceId, String documentId, {String? title, String? content, List<String>? tags}) async {
    final variables = <String, dynamic>{
      'workspaceId': workspaceId,
      'documentId': documentId,
    };
    if (title != null) variables['title'] = title;
    if (content != null) variables['content'] = content;
    if (tags != null) variables['tags'] = tags;

    final response = await _graphQlRequest({
      'query': '''
      mutation UpdateDocument(\$workspaceId: String!, \$documentId: String!, \$title: String, \$content: String, \$tags: [String!]) {
        updateDoc(workspaceId: \$workspaceId, documentId: \$documentId, input: {title: \$title, content: \$content, tags: \$tags}) {
          id
          title
          description
          content
          createdAt
          updatedAt
          createdBy
          favorite
          tags
          parentId
        }
      }
      ''',
      'variables': variables,
    });

    final data = response['data'] as Map<String, dynamic>?;
    final docJson = data?['updateDoc'] as Map<String, dynamic>? ?? {};
    return _parseDocument(docJson, workspaceId);
  }

  Future<void> deleteDocument(String workspaceId, String documentId) async {
    await _graphQlRequest({
      'query': '''
      mutation DeleteDocument(\$workspaceId: String!, \$documentId: String!) {
        deleteDoc(workspaceId: \$workspaceId, documentId: \$documentId)
      }
      ''',
      'variables': {'workspaceId': workspaceId, 'documentId': documentId},
    });
  }

  Future<void> toggleFavorite(String workspaceId, String documentId, bool isFavorite) async {
    if (isFavorite) {
      await _graphQlRequest({
        'query': '''
        mutation FavoriteDocument(\$workspaceId: String!, \$documentId: String!) {
          favoriteDoc(workspaceId: \$workspaceId, documentId: \$documentId)
        }
        ''',
        'variables': {'workspaceId': workspaceId, 'documentId': documentId},
      });
    } else {
      await _graphQlRequest({
        'query': '''
        mutation UnfavoriteDocument(\$workspaceId: String!, \$documentId: String!) {
          unfavoriteDoc(workspaceId: \$workspaceId, documentId: \$documentId)
        }
        ''',
        'variables': {'workspaceId': workspaceId, 'documentId': documentId},
      });
    }
  }

  Document _parseDocument(Map<String, dynamic> json, String workspaceId) {
    final tagsRaw = json['tags'];
    final tagsList = <String>[];
    if (tagsRaw is List) {
      for (final t in tagsRaw) {
        tagsList.add(t.toString());
      }
    }

    return Document(
      id: json['id'] as String? ?? '',
      workspaceId: workspaceId,
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      content: json['content'] as String?,
      createdAt: _parseDate(json['createdAt']),
      updatedAt: _parseDate(json['updatedAt']),
      createdBy: json['createdBy'] as String?,
      isFavorite: json['favorite'] as bool? ?? false,
      tags: tagsList,
      parentId: json['parentId'] as String?,
    );
  }

  DateTime _parseDate(dynamic date) {
    if (date == null) return DateTime.now();
    if (date is String) return DateTime.tryParse(date) ?? DateTime.now();
    if (date is int) return DateTime.fromMillisecondsSinceEpoch(date);
    return DateTime.now();
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
        throw DocumentException(decoded['errors'].toString());
      }
      return decoded;
    } finally {
      client.close();
    }
  }
}

class DocumentException implements Exception {
  final String message;
  DocumentException(this.message);

  @override
  String toString() => message;
}
