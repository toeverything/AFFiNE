import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/tag.dart';
import '../../../../core/constants/api_constants.dart';

final tagDataSourceProvider = Provider<TagRemoteDataSource>((ref) => TagRemoteDataSource());

class TagRemoteDataSource {
  Future<String?> _getToken() async => null;

  Future<List<Tag>> getTags(String workspaceId) async {
    final r = await _gql({
      'query': '''
      query GetTags(\$workspaceId: String!) {
        workspace(id: \$workspaceId) { tags { id name color documentCount } }
      }''',
      'variables': {'workspaceId': workspaceId},
    });
    final list = ((r['data'] as Map?)??{})['workspace']['tags'] as List? ?? [];
    return list.map((t) => _parse(t as Map, workspaceId)).toList();
  }

  Future<Tag> createTag(String workspaceId, String name, String? color) async {
    final r = await _gql({
      'query': '''
      mutation CreateTag(\$workspaceId: String!, \$name: String!, \$color: String) {
        createTag(workspaceId: \$workspaceId, input: {name: \$name, color: \$color}) { id name color documentCount }
      }''',
      'variables': {'workspaceId': workspaceId, 'name': name, 'color': color},
    });
    return _parse(((r['data'] as Map?)??{})['createTag'] as Map? ?? {}, workspaceId);
  }

  Future<void> deleteTag(String workspaceId, String tagId) async {
    await _gql({
      'query': 'mutation DeleteTag(\$workspaceId: String!, \$tagId: String!) { deleteTag(workspaceId: \$workspaceId, tagId: \$tagId) }',
      'variables': {'workspaceId': workspaceId, 'tagId': tagId},
    });
  }

  Tag _parse(Map json, String wsId) => Tag(
    id: (json['id'] as String?) ?? '',
    workspaceId: wsId,
    name: (json['name'] as String?) ?? '',
    color: json['color'] as String?,
    documentCount: (json['documentCount'] as int?) ?? 0,
  );

  Future<Map<String, dynamic>> _gql(Map<String, dynamic> body) async {
    final uri = Uri.parse('${ApiConstants.defaultBaseUrl}${ApiConstants.graphQlPath}');
    final client = HttpClient();
    client.connectionTimeout = ApiConstants.connectionTimeout;
    try {
      final req = await client.postUrl(uri);
      req.headers.set('Content-Type', 'application/json');
      final t = await _getToken();
      if (t != null) req.headers.set('Authorization', 'Bearer $t');
      req.write(jsonEncode(body));
      final res = await req.close();
      final d = jsonDecode(await res.transform(utf8.decoder).join()) as Map<String, dynamic>;
      if (d.containsKey('errors')) throw TagException(d['errors'].toString());
      return d;
    } finally { client.close(); }
  }
}

class TagException implements Exception {
  final String message;
  TagException(this.message);
  @override
  String toString() => message;
}
