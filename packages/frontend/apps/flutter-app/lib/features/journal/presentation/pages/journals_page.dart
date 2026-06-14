import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';
import '../providers/journal_providers.dart';
import '../../../../shared/widgets/empty_state.dart';

class JournalsPage extends ConsumerWidget {
  final String workspaceId;
  const JournalsPage({super.key, required this.workspaceId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedDate = ref.watch(selectedJournalDateProvider);
    final today = DateTime.now();
    final isToday = selectedDate.year == today.year &&
        selectedDate.month == today.month &&
        selectedDate.day == today.day;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: Text(isToday ? 'Today' : _formatDate(selectedDate))),
      body: Column(
        children: [
          _DateNavigationBar(
            selectedDate: selectedDate,
            onPrevious: () {
              ref.read(selectedJournalDateProvider.notifier).state =
                  selectedDate.subtract(const Duration(days: 1));
            },
            onNext: () {
              ref.read(selectedJournalDateProvider.notifier).state =
                  selectedDate.add(const Duration(days: 1));
            },
          ),
          const Divider(height: 1),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _JournalDateHeader(date: selectedDate),
                  const SizedBox(height: 24),
                  const EmptyState(
                    icon: Icons.edit_note_outlined,
                    title: 'Write about your day',
                    subtitle: 'Journal entries will appear here',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[d.month - 1]} ${d.day}, ${d.year}';
  }
}

class _DateNavigationBar extends StatelessWidget {
  final DateTime selectedDate;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  const _DateNavigationBar({required this.selectedDate, required this.onPrevious, required this.onNext});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(icon: const Icon(Icons.chevron_left), onPressed: onPrevious, color: AppColors.textSecondary),
          Text(_dayLabel(selectedDate), style: AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary)),
          IconButton(icon: const Icon(Icons.chevron_right), onPressed: onNext, color: AppColors.textSecondary),
        ],
      ),
    );
  }

  String _dayLabel(DateTime d) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days[d.weekday - 1];
  }
}

class _JournalDateHeader extends StatelessWidget {
  final DateTime date;
  const _JournalDateHeader({required this.date});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${_daySuffix(date.day)} ${_monthName(date.month)}',
          style: AppTypography.headlineLarge.copyWith(color: AppColors.textPrimary),
        ),
        const SizedBox(height: 4),
        Text(
          'Write about your day...',
          style: AppTypography.bodyMedium.copyWith(color: AppColors.textTertiary),
        ),
      ],
    );
  }

  String _daySuffix(int day) {
    if (day >= 11 && day <= 13) return '${day}th';
    switch (day % 10) {
      case 1: return '${day}st';
      case 2: return '${day}nd';
      case 3: return '${day}rd';
      default: return '${day}th';
    }
  }

  String _monthName(int m) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[m - 1];
  }
}
