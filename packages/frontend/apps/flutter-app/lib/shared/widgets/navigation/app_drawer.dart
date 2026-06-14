import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';

class AppDrawer extends StatelessWidget {
  final String workspaceId;
  final String? currentPath;

  const AppDrawer({
    super.key,
    required this.workspaceId,
    this.currentPath,
  });

  @override
  Widget build(BuildContext context) {
    final wsBase = '/workspace/$workspaceId';
    return Drawer(
      backgroundColor: AppColors.surface,
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            _DrawerHeader(workspaceId: workspaceId),
            _SectionLabel(label: 'Navigate'),
            _DrawerItem(
              icon: Icons.home_outlined,
              label: 'Home',
              selected: currentPath == '$wsBase/home',
              onTap: () { Navigator.pop(context); context.go('$wsBase/home'); },
            ),
            _DrawerItem(
              icon: Icons.description_outlined,
              label: 'All Documents',
              selected: currentPath?.contains('/all') ?? false,
              onTap: () { Navigator.pop(context); context.go('$wsBase/all'); },
            ),
            _SectionLabel(label: 'Organize'),
            _DrawerItem(
              icon: Icons.collections_bookmark_outlined,
              label: 'Collections',
              selected: currentPath?.contains('/collection') ?? false,
              onTap: () { Navigator.pop(context); context.go('$wsBase/collections'); },
            ),
            _DrawerItem(
              icon: Icons.label_outline,
              label: 'Tags',
              selected: currentPath?.contains('/tag') ?? false,
              onTap: () { Navigator.pop(context); context.go('$wsBase/tags'); },
            ),
            _DrawerItem(
              icon: Icons.auto_stories_outlined,
              label: 'Journals',
              selected: currentPath?.contains('/journals') ?? false,
              onTap: () { Navigator.pop(context); context.go('$wsBase/journals'); },
            ),
            const Divider(),
            _SectionLabel(label: 'Favorites'),
            _DrawerItem(icon: Icons.favorite_outline, label: 'Favorites', selected: false, onTap: () { Navigator.pop(context); }),
            const Divider(),
            _DrawerItem(
              icon: Icons.search_outlined,
              label: 'Search',
              selected: currentPath?.contains('/search') ?? false,
              onTap: () { Navigator.pop(context); context.go('$wsBase/search'); },
            ),
            _DrawerItem(
              icon: Icons.settings_outlined,
              label: 'Settings',
              selected: false,
              onTap: () { Navigator.pop(context); context.go('/settings'); },
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerHeader extends StatelessWidget {
  final String workspaceId;
  const _DrawerHeader({required this.workspaceId});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.divider, width: 0.5)),
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.auto_stories, color: AppColors.primary, size: 22),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('AFFiNE', style: AppTypography.titleMedium.copyWith(color: AppColors.textPrimary)),
              Text('Workspace', style: AppTypography.labelSmall.copyWith(color: AppColors.textTertiary)),
            ],
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
      child: Text(label.toUpperCase(), style: AppTypography.labelSmall.copyWith(color: AppColors.textTertiary, letterSpacing: 1)),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _DrawerItem({required this.icon, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: selected ? AppColors.primary : AppColors.textSecondary, size: 22),
      title: Text(label, style: AppTypography.bodyMedium.copyWith(
        color: selected ? AppColors.primary : AppColors.textPrimary,
        fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
      )),
      onTap: onTap,
      dense: true,
      horizontalTitleGap: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
  }
}
