import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/tag_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';
import '../../../../shared/widgets/loading_widget.dart';
import '../../../../shared/widgets/error_display.dart';
import '../../../../shared/widgets/empty_state.dart';

class TagsListPage extends ConsumerWidget {
  final String workspaceId;
  const TagsListPage({super.key, required this.workspaceId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(tagsListProvider(workspaceId));
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Tags')),
      body: async.when(
        loading: () => const LoadingWidget(),
        error: (e, _) => ErrorDisplay(message: e.toString(), onRetry: () => ref.invalidate(tagsListProvider(workspaceId))),
        data: (list) => list.isEmpty
            ? const EmptyState(icon: Icons.label_outline, title: 'No tags', subtitle: 'Create tags to organize your documents')
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                itemBuilder: (_, i) => _TagCard(tag: list[i], onTap: () => context.go('/workspace/$workspaceId/tag/${list[i].id}')),
              ),
      ),
    );
  }
}

class _TagCard extends StatelessWidget {
  final dynamic tag;
  final VoidCallback onTap;
  const _TagCard({required this.tag, required this.onTap});

  Color _tagColor() {
    if (tag.color == null) return AppColors.primary;
    return Color(int.parse(tag.color!.replaceFirst('#', '0xFF')));
  }

  @override
  Widget build(BuildContext context) {
    final color = _tagColor();
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(width: 12, height: 12, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 12),
              Expanded(child: Text(tag.name, style: AppTypography.titleMedium.copyWith(color: AppColors.textPrimary))),
              Text('${tag.documentCount}', style: AppTypography.labelSmall.copyWith(color: AppColors.textTertiary)),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right, color: AppColors.textTertiary, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
