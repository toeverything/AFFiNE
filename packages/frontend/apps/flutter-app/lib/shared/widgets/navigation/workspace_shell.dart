import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/typography.dart';
import 'app_drawer.dart';

class WorkspaceShell extends StatefulWidget {
  final String workspaceId;
  final Widget child;
  const WorkspaceShell({super.key, required this.workspaceId, required this.child});

  @override
  State<WorkspaceShell> createState() => _WorkspaceShellState();
}

class _WorkspaceShellState extends State<WorkspaceShell> {
  int _currentIndex = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final path = GoRouterState.of(context).matchedLocation;
    _currentIndex = _tabIndexFromPath(path);
  }

  int _tabIndexFromPath(String path) {
    if (path.contains('/all')) return 0;
    if (path.contains('/search')) return 1;
    if (path.contains('/journals')) return 2;
    if (path.contains('/settings')) return 3;
    return 0;
  }

  void _onTabTapped(int index, String wsId) {
    setState(() => _currentIndex = index);
    final routes = ['/workspace/$wsId/home', '/workspace/$wsId/all', '/workspace/$wsId/search', '/workspace/$wsId/journals'];
    if (index < routes.length) context.go(routes[index]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: AppDrawer(
        workspaceId: widget.workspaceId,
        currentPath: GoRouterState.of(context).matchedLocation,
      ),
      body: SafeArea(child: widget.child),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.divider, width: 0.5)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _NavItem(icon: Icons.home_outlined, label: 'Home', isSelected: _currentIndex == 0, onTap: () => _onTabTapped(0, widget.workspaceId)),
                _NavItem(icon: Icons.description_outlined, label: 'Docs', isSelected: _currentIndex == 1, onTap: () => _onTabTapped(1, widget.workspaceId)),
                _NavItem(icon: Icons.search_outlined, label: 'Search', isSelected: _currentIndex == 2, onTap: () => _onTabTapped(2, widget.workspaceId)),
                _NavItem(icon: Icons.auto_stories_outlined, label: 'Journal', isSelected: _currentIndex == 3, onTap: () => _onTabTapped(3, widget.workspaceId)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;
  const _NavItem({required this.icon, required this.label, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = isSelected ? AppColors.primary : AppColors.textTertiary;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 2),
            Text(label, style: AppTypography.labelSmall.copyWith(color: color)),
          ],
        ),
      ),
    );
  }
}
