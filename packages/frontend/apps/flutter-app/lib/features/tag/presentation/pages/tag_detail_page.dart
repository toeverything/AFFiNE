import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/tag_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';
import '../../../../shared/widgets/loading_widget.dart';
import '../../../../shared/widgets/error_display.dart';

class TagDetailPage extends ConsumerWidget {
  final String workspaceId;
  final String tagId;
  const TagDetailPage({super.key, required this.workspaceId, required this.tagId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(tagsListProvider(workspaceId));
    return async.when(
      loading: () => _scaffold(const LoadingWidget()),
      error: (e, _) => _scaffold(ErrorDisplay(message: e.toString())),
      data: (list) {
        final tag = list.where((t) => t.id == tagId).firstOrNull;
        if (tag == null) return _scaffold(const Text('Tag not found'));
        Color tagColor = AppColors.primary;
        if (tag.color != null) tagColor = Color(int.parse(tag.color!.replaceFirst('#', '0xFF')));
        return _scaffold(
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(width: 16, height: 16, decoration: BoxDecoration(color: tagColor, shape: BoxShape.circle)),
                  const SizedBox(width: 12),
                  Text(tag.name, style: AppTypography.headlineMedium.copyWith(color: AppColors.textPrimary)),
                ]),
                const SizedBox(height: 8),
                Text('${tag.documentCount} documents', style: AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _scaffold(Widget body) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(title: const Text('Tag')),
    body: body,
  );
}
