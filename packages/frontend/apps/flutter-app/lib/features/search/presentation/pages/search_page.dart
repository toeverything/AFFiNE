import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';
import '../providers/search_providers.dart';
import '../../../../shared/widgets/empty_state.dart';

class SearchPage extends ConsumerStatefulWidget {
  final String workspaceId;
  const SearchPage({super.key, required this.workspaceId});

  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(searchQueryProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search documents...',
            border: InputBorder.none,
            filled: false,
            contentPadding: EdgeInsets.zero,
          ),
          style: AppTypography.bodyLarge,
          onChanged: (v) => ref.read(searchQueryProvider.notifier).state = v,
        ),
        actions: [
          if (query.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                _controller.clear();
                ref.read(searchQueryProvider.notifier).state = '';
              },
            ),
        ],
      ),
      body: query.isEmpty
          ? const Center(
              child: EmptyState(
                icon: Icons.search_outlined,
                title: 'Search documents',
                subtitle: 'Type to search across all documents',
              ),
            )
          : const EmptyState(
              icon: Icons.search_outlined,
              title: 'Searching...',
              subtitle: 'Results will appear here',
            ),
    );
  }
}
