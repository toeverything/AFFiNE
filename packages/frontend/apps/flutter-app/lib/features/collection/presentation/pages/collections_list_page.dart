import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/collection_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';
import '../../../../shared/widgets/loading_widget.dart';
import '../../../../shared/widgets/error_display.dart';
import '../../../../shared/widgets/empty_state.dart';

class CollectionsListPage extends ConsumerWidget {
  final String workspaceId;
  const CollectionsListPage({super.key, required this.workspaceId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(collectionsListProvider(workspaceId));
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Collections')),
      body: async.when(
        loading: () => const LoadingWidget(),
        error: (e, _) => ErrorDisplay(message: e.toString(), onRetry: () => ref.invalidate(collectionsListProvider(workspaceId))),
        data: (list) => list.isEmpty
            ? const EmptyState(icon: Icons.collections_bookmark_outlined, title: 'No collections', subtitle: 'Create a collection to organize your docs')
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                itemBuilder: (_, i) => _CollectionCard(
                  collection: list[i],
                  onTap: () => context.go('/workspace/$workspaceId/collection/${list[i].id}'),
                ),
              ),
      ),
    );
  }
}

class _CollectionCard extends StatelessWidget {
  final dynamic collection;
  final VoidCallback onTap;
  const _CollectionCard({required this.collection, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.collections_bookmark, color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(collection.name, style: AppTypography.titleMedium.copyWith(color: AppColors.textPrimary)),
                    if (collection.description != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(collection.description!, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary)),
                      ),
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text('${collection.documentCount} docs', style: AppTypography.labelSmall.copyWith(color: AppColors.textTertiary)),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textTertiary),
            ],
          ),
        ),
      ),
    );
  }
}
