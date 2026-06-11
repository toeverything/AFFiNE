import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';

class DocumentEditor extends StatelessWidget {
  final String initialContent;
  final ValueChanged<String>? onChanged;

  const DocumentEditor({
    super.key,
    this.initialContent = '',
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextFormField(
          initialValue: '',
          decoration: const InputDecoration(
            hintText: 'Untitled',
            border: InputBorder.none,
            contentPadding: EdgeInsets.zero,
            isDense: true,
          ),
          style: AppTypography.headlineLarge.copyWith(
            color: AppColors.textPrimary,
          ),
          onChanged: onChanged,
        ),
        const SizedBox(height: 24),
        TextFormField(
          initialValue: initialContent,
          maxLines: null,
          decoration: const InputDecoration(
            hintText: 'Start writing...',
            border: InputBorder.none,
            contentPadding: EdgeInsets.zero,
            isDense: true,
          ),
          style: AppTypography.bodyLarge.copyWith(
            color: AppColors.textPrimary,
            height: 1.6,
          ),
          onChanged: onChanged,
        ),
      ],
    );
  }
}
