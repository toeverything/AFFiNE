import 'package:flutter_riverpod/flutter_riverpod.dart';

final selectedJournalDateProvider = StateProvider<DateTime>((ref) => DateTime.now());
