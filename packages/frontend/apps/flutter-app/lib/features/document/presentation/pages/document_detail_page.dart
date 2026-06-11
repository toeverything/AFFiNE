import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/document.dart';
import '../providers/document_list_provider.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';
import '../../../../shared/widgets/loading_widget.dart';
import '../../../../shared/widgets/error_display.dart';
import '../widgets/document_editor.dart';

class DocumentDetailPage extends ConsumerWidget {
  final String workspaceId;
  final String documentId;

  const DocumentDetailPage({
    super.key,
    required this.workspaceId,
    required this.documentId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final docAsync = ref.watch(documentDetailProvider(
      (workspaceId: workspaceId, documentId: documentId),
    ));

    return docAsync.when(
      loading: () => Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(title: const Text('Loading...')),
        body: const LoadingWidget(),
      ),
      error: (error, stack) => Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(title: const Text('Error')),
        body: ErrorDisplay(
          message: error.toString(),
          onRetry: () => ref.invalidate(documentDetailProvider(
            (workspaceId: workspaceId, documentId: documentId),
          )),
        ),
      ),
      data: (document) => _DocumentDetailContent(document: document),
    );
  }
}

class _DocumentDetailContent extends StatelessWidget {
  final Document document;

  const _DocumentDetailContent({required this.document});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(
          document.title.isEmpty ? 'Untitled' : document.title,
        ),
        actions: [
          IconButton(
            icon: Icon(
              document.isFavorite ? Icons.favorite : Icons.favorite_border,
              color: document.isFavorite ? AppColors.error : null,
            ),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.more_vert),
            onPressed: () {},
          ),
        ],
      ),
      body: Column(
        children: [
          if (document.tags.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 4,
                children: document.tags.map((tag) {
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      tag,
                      style: AppTypography.labelSmall.copyWith(
                        color: AppColors.primary,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(
              children: [
                Icon(
                  Icons.access_time,
                  size: 14,
                  color: AppColors.textTertiary,
                ),
                const SizedBox(width: 6),
                Text(
                  document.formattedDate,
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.textTertiary,
                  ),
                ),
                if (document.createdBy != null) ...[
                  const SizedBox(width: 16),
                  Icon(
                    Icons.person_outline,
                    size: 14,
                    color: AppColors.textTertiary,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    document.createdBy!,
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.textTertiary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const Divider(),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: DocumentEditor(
                initialContent: document.content ?? '',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
