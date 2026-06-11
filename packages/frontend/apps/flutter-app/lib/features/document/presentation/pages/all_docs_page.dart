import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/document_list_provider.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/loading_widget.dart';
import '../../../../shared/widgets/error_display.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../widgets/doc_card_widget.dart';

class AllDocsPage extends ConsumerWidget {
  final String workspaceId;

  const AllDocsPage({
    super.key,
    required this.workspaceId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final docsAsync = ref.watch(documentListProvider(workspaceId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('All Documents'),
      ),
      body: docsAsync.when(
        loading: () => const LoadingWidget(message: 'Loading documents...'),
        error: (error, stack) => ErrorDisplay(
          message: error.toString(),
          onRetry: () => ref.invalidate(documentListProvider(workspaceId)),
        ),
        data: (documents) {
          if (documents.isEmpty) {
            return const EmptyState(
              icon: Icons.description_outlined,
              title: 'No documents yet',
              subtitle: 'Create your first document to get started',
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: documents.length,
            itemBuilder: (context, index) {
              final doc = documents[index];
              return DocCardWidget(
                document: doc,
                onTap: () {
                  context.go('/workspace/$workspaceId/doc/${doc.id}');
                },
              );
            },
          );
        },
      ),
    );
  }
}
