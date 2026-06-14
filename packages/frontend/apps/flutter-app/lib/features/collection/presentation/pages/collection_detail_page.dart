import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/collection_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';
import '../../../../shared/widgets/loading_widget.dart';
import '../../../../shared/widgets/error_display.dart';

class CollectionDetailPage extends ConsumerWidget {
  final String workspaceId;
  final String collectionId;
  const CollectionDetailPage({
    super.key,
    required this.workspaceId,
    required this.collectionId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(collectionsListProvider(workspaceId));
    return async.when(
      loading: () => _scaffold(const LoadingWidget()),
      error: (e, _) => _scaffold(ErrorDisplay(message: e.toString())),
      data: (list) {
        final col = list.where((c) => c.id == collectionId).firstOrNull;
        if (col == null) return _scaffold(const Text('Collection not found'));
        return _scaffold(
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(col.name, style: AppTypography.headlineLarge.copyWith(color: AppColors.textPrimary)),
                if (col.description != null) ...[
                  const SizedBox(height: 8),
                  Text(col.description!, style: AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary)),
                ],
                const SizedBox(height: 16),
                Text('${col.documentCount} documents', style: AppTypography.bodySmall.copyWith(color: AppColors.textTertiary)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _scaffold(Widget body) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(title: const Text('Collection')),
    body: body,
  );
}
