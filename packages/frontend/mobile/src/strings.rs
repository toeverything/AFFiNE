//! Localized UI strings for `en`, `zh-Hans`, and `ar` (RTL) mobile shell views.

use ui::Direction;

/// Supported showcase and audit locales for the mobile shell.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum MobileLocale {
    En,
    ZhHans,
    Ar,
    /// RTL languages without a dedicated catalog (e.g. `fa`, `ur`): keep RTL layout with English copy.
    RtlFallback,
}

impl MobileLocale {
    pub const ALL: [Self; 3] = [Self::En, Self::ZhHans, Self::Ar];

    pub const fn code(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::ZhHans => "zh-Hans",
            Self::Ar => "ar",
            Self::RtlFallback => "fa",
        }
    }

    pub const fn display_name(self) -> &'static str {
        match self {
            Self::En => "English",
            Self::ZhHans => "简体中文",
            Self::Ar => "العربية",
            Self::RtlFallback => "English (RTL)",
        }
    }

    pub const fn direction(self) -> Direction {
        match self {
            Self::Ar | Self::RtlFallback => Direction::Rtl,
            Self::En | Self::ZhHans => Direction::Ltr,
        }
    }

    pub fn parse(code: &str) -> Self {
        let lower = code.trim().to_ascii_lowercase();
        let primary = lower.split(['-', '_']).next().unwrap_or("");
        match primary {
            "zh" => Self::ZhHans,
            "ar" => Self::Ar,
            "fa" | "ur" | "he" | "iw" => Self::RtlFallback,
            _ => Self::En,
        }
    }

    pub const fn strings(self) -> &'static MobileStrings {
        match self {
            Self::En | Self::RtlFallback => &EN_STRINGS,
            Self::ZhHans => &ZH_STRINGS,
            Self::Ar => &AR_STRINGS,
        }
    }
}

/// Static localized copy for all mobile shell routes and sheets.
#[derive(Clone, Copy, Debug)]
pub struct MobileStrings {
    pub tab_home: &'static str,
    pub tab_explorer: &'static str,
    pub tab_journals: &'static str,
    pub tab_search: &'static str,
    pub recent_docs: &'static str,
    pub favorites: &'static str,
    pub folders: &'static str,
    pub documents_heading: &'static str,
    pub new_doc_label: &'static str,
    pub untitled_doc: &'static str,
    pub page_title_placeholder: &'static str,
    pub page_body_placeholder: &'static str,
    pub collections: &'static str,
    pub tags: &'static str,
    pub trash: &'static str,
    pub today_journal: &'static str,
    pub open_journal: &'static str,
    pub create_journal: &'static str,
    pub no_journal_for_date: &'static str,
    pub search_placeholder: &'static str,
    pub search_no_results: &'static str,
    pub exact_match_badge: &'static str,
    pub settings_title: &'static str,
    pub back_label: &'static str,
    pub switch_workspace: &'static str,
    pub location_trail_title: &'static str,
    pub current_trail_heading: &'static str,
    pub doc_locations_heading: &'static str,
    pub use_trail_action: &'static str,
    pub backlinks_label: &'static str,
    pub backlinks_ready_zero: &'static str,
    pub backlinks_partial_suffix: &'static str,
    pub in_trash_badge: &'static str,
    pub restore_doc_label: &'static str,
    pub delete_permanently_label: &'static str,
    pub confirm_delete_title: &'static str,
    pub confirm_delete_body: &'static str,
    pub cancel_label: &'static str,
    pub doc_not_found_title: &'static str,
    pub doc_not_found_body: &'static str,
    pub toggle_on: &'static str,
    pub toggle_off: &'static str,
    pub weekday_short: [&'static str; 7],
    pub close_label: &'static str,
    pub settings_groups: [&'static str; 10],
    pub theme_light: &'static str,
    pub theme_dark: &'static str,
    pub theme_system: &'static str,
    pub about_version_label: &'static str,
    pub drawer_title: &'static str,
    pub drawer_filter_placeholder: &'static str,
    pub all_docs_heading: &'static str,
    pub sync_synced: &'static str,
    pub sync_syncing: &'static str,
    pub sync_connecting: &'static str,
    pub sync_offline: &'static str,
    pub sync_auth_required: &'static str,
    pub media_image_label: &'static str,
    pub media_attachment_label: &'static str,
    pub upload_queued: &'static str,
    pub upload_uploaded: &'static str,
    pub open_drawer_label: &'static str,
    pub doc_actions_title: &'static str,
    pub add_to_favorites: &'static str,
    pub remove_from_favorites: &'static str,
    pub move_to_trash: &'static str,
    pub empty_list_label: &'static str,
    pub empty_trash_label: &'static str,
    pub no_locations_label: &'static str,
    pub today_btn_label: &'static str,
    pub sign_in_label: &'static str,
}

impl MobileStrings {
    pub fn journal_title(&self, locale: MobileLocale, date: &str) -> String {
        match locale {
            MobileLocale::En | MobileLocale::RtlFallback => format!("Journal {date}"),
            MobileLocale::ZhHans => format!("日记 {date}"),
            MobileLocale::Ar => format!("يومية {date}"),
        }
    }

    pub fn flags_count(&self, locale: MobileLocale, count: usize) -> String {
        match locale {
            MobileLocale::En | MobileLocale::RtlFallback => format!("{count} flags"),
            MobileLocale::ZhHans => format!("{count} 项开关"),
            MobileLocale::Ar => format!("{count} خيارات"),
        }
    }

    pub fn multi_location_label(&self, locale: MobileLocale, count: usize) -> String {
        match locale {
            MobileLocale::En | MobileLocale::RtlFallback => format!("In {count} locations"),
            MobileLocale::ZhHans => format!("位于 {count} 个位置"),
            MobileLocale::Ar => format!("في {count} مواقع"),
        }
    }

    pub fn owner_multi_location_label(
        &self,
        locale: MobileLocale,
        owner_title: &str,
        count: usize,
    ) -> String {
        match locale {
            MobileLocale::En | MobileLocale::RtlFallback => {
                format!("{owner_title} · In {count} locations")
            }
            MobileLocale::ZhHans => format!("{owner_title} · 位于 {count} 个位置"),
            MobileLocale::Ar => format!("{owner_title} · في {count} مواقع"),
        }
    }

    pub fn compact_owner_multi_location_label(
        &self,
        locale: MobileLocale,
        owner_title: &str,
        count: usize,
    ) -> String {
        let short = truncate_display_width(owner_title, 28);
        match locale {
            MobileLocale::En | MobileLocale::RtlFallback => format!("{short} · {count} places"),
            MobileLocale::ZhHans => format!("{short} · {count} 处"),
            MobileLocale::Ar => format!("{short} · {count} مواقع"),
        }
    }

    pub fn backlinks_pill_label(
        &self,
        locale: MobileLocale,
        count: usize,
        is_ready: bool,
    ) -> String {
        match (locale, is_ready) {
            (MobileLocale::En | MobileLocale::RtlFallback, true) if count == 0 => {
                self.backlinks_ready_zero.to_string()
            }
            (MobileLocale::En | MobileLocale::RtlFallback, true) => format!("{count} Backlinks"),
            (MobileLocale::En | MobileLocale::RtlFallback, false) => {
                format!("At least {count} Backlinks (Indexing)")
            }
            (MobileLocale::ZhHans, true) if count == 0 => self.backlinks_ready_zero.to_string(),
            (MobileLocale::ZhHans, true) => format!("{count} 处反向链接"),
            (MobileLocale::ZhHans, false) => format!("已发现 {count} 处（索引中）"),
            (MobileLocale::Ar, true) if count == 0 => self.backlinks_ready_zero.to_string(),
            (MobileLocale::Ar, true) => format!("روابط خلفية ({count})"),
            (MobileLocale::Ar, false) => format!("روابط خلفية ({count}+ · جارٍ الفهرسة)"),
        }
    }
}

fn char_display_width(ch: char) -> usize {
    if ch.is_ascii() { 1 } else { 2 }
}

fn truncate_display_width(text: &str, max_units: usize) -> String {
    let total: usize = text.chars().map(char_display_width).sum();
    if total <= max_units {
        return text.to_string();
    }
    let budget = max_units.saturating_sub(2);
    let mut used = 0usize;
    let mut prefix = String::new();
    for ch in text.chars() {
        let w = char_display_width(ch);
        if used + w > budget {
            break;
        }
        prefix.push(ch);
        used += w;
    }
    format!("{}…", prefix.trim_end())
}

const EN_STRINGS: MobileStrings = MobileStrings {
    tab_home: "Home",
    tab_explorer: "All Docs",
    tab_journals: "Journals",
    tab_search: "Search",
    recent_docs: "Recent Documents",
    favorites: "Favorites",
    folders: "Folders",
    documents_heading: "Documents",
    new_doc_label: "New Document",
    untitled_doc: "Untitled",
    page_title_placeholder: "Title",
    page_body_placeholder: "Empty document",
    collections: "Collections",
    tags: "Tags",
    trash: "Trash",
    today_journal: "Today's Journal",
    open_journal: "Open Journal",
    create_journal: "New Journal Entry",
    no_journal_for_date: "No journal entry for this date yet.",
    search_placeholder: "Search docs…",
    search_no_results: "No matching documents",
    exact_match_badge: "Exact Match",
    settings_title: "Settings",
    back_label: "Back",
    switch_workspace: "Workspaces",
    location_trail_title: "Location & Trail",
    current_trail_heading: "Current Trail",
    doc_locations_heading: "All Locations of This Document",
    use_trail_action: "Return to Trail",
    backlinks_label: "Backlinks",
    backlinks_ready_zero: "No backlinks",
    backlinks_partial_suffix: "Indexing…",
    in_trash_badge: "In Trash",
    restore_doc_label: "Restore",
    delete_permanently_label: "Delete Permanently",
    confirm_delete_title: "Delete Permanently?",
    confirm_delete_body: "This action cannot be undone. The document and its links will be removed from this workspace.",
    cancel_label: "Cancel",
    doc_not_found_title: "Document not found",
    doc_not_found_body: "This document was deleted or is no longer available in this workspace.",
    toggle_on: "On",
    toggle_off: "Off",
    weekday_short: ["M", "T", "W", "T", "F", "S", "S"],
    close_label: "Done",
    settings_groups: [
        "Account",
        "Workspace",
        "Appearance",
        "Language",
        "Editor",
        "Sync & Offline",
        "Storage",
        "Notifications",
        "Experimental",
        "About",
    ],
    theme_light: "Light",
    theme_dark: "Dark",
    theme_system: "System",
    about_version_label: "Version 0.27.5",
    drawer_title: "Workspace",
    drawer_filter_placeholder: "Filter documents…",
    all_docs_heading: "All Docs",
    sync_synced: "Synced",
    sync_syncing: "Syncing",
    sync_connecting: "Connecting",
    sync_offline: "Offline",
    sync_auth_required: "Sign in",
    media_image_label: "Image",
    media_attachment_label: "Attachment",
    upload_queued: "Queued",
    upload_uploaded: "Uploaded",
    open_drawer_label: "Workspace Drawer",
    doc_actions_title: "Document Actions",
    add_to_favorites: "Add to Favorites",
    remove_from_favorites: "Remove from Favorites",
    move_to_trash: "Move to Trash",
    empty_list_label: "No items yet",
    empty_trash_label: "Trash is empty",
    no_locations_label: "Not filed in any folder",
    today_btn_label: "Today",
    sign_in_label: "Sign in",
};

const ZH_STRINGS: MobileStrings = MobileStrings {
    tab_home: "首页",
    tab_explorer: "全部文档",
    tab_journals: "日记",
    tab_search: "搜索",
    recent_docs: "最近文档",
    favorites: "收藏夹",
    folders: "文件夹",
    documents_heading: "文档",
    new_doc_label: "新建文档",
    untitled_doc: "无标题",
    page_title_placeholder: "标题",
    page_body_placeholder: "空白文档",
    collections: "集合",
    tags: "标签",
    trash: "回收站",
    today_journal: "今日日记",
    open_journal: "打开日记",
    create_journal: "新建日记",
    no_journal_for_date: "该日期尚未创建日记。",
    search_placeholder: "搜索文档…",
    search_no_results: "无匹配结果",
    exact_match_badge: "精确匹配",
    settings_title: "设置",
    back_label: "返回",
    switch_workspace: "切换工作区",
    location_trail_title: "位置与来路",
    current_trail_heading: "当前来路",
    doc_locations_heading: "当前文档全部位置",
    use_trail_action: "切回当前来路",
    backlinks_label: "反向链接",
    backlinks_ready_zero: "暂无引用",
    backlinks_partial_suffix: "索引中",
    in_trash_badge: "已移入回收站",
    restore_doc_label: "恢复",
    delete_permanently_label: "永久删除",
    confirm_delete_title: "永久删除此文档？",
    confirm_delete_body: "此操作不可撤销，该文档及其所有链接将从当前工作区永久移除。",
    cancel_label: "取消",
    doc_not_found_title: "文档不存在",
    doc_not_found_body: "该文档已被删除或不在当前工作区中。",
    toggle_on: "已开启",
    toggle_off: "已关闭",
    weekday_short: ["一", "二", "三", "四", "五", "六", "日"],
    close_label: "完成",
    settings_groups: [
        "账户",
        "工作区",
        "外观",
        "语言",
        "编辑器",
        "同步与离线",
        "存储空间",
        "通知",
        "实验性功能",
        "关于",
    ],
    theme_light: "浅色",
    theme_dark: "深色",
    theme_system: "跟随系统",
    about_version_label: "版本 0.27.5",
    drawer_title: "工作区",
    drawer_filter_placeholder: "筛选文档…",
    all_docs_heading: "全部文档",
    sync_synced: "已同步",
    sync_syncing: "同步中",
    sync_connecting: "连接中",
    sync_offline: "离线",
    sync_auth_required: "需登录",
    media_image_label: "图片",
    media_attachment_label: "附件",
    upload_queued: "待上传",
    upload_uploaded: "已上传",
    open_drawer_label: "工作区抽屉",
    doc_actions_title: "文档操作",
    add_to_favorites: "加入收藏",
    remove_from_favorites: "取消收藏",
    move_to_trash: "移入回收站",
    empty_list_label: "暂无内容",
    empty_trash_label: "回收站为空",
    no_locations_label: "尚未归入文件夹",
    today_btn_label: "今天",
    sign_in_label: "登录",
};

const AR_STRINGS: MobileStrings = MobileStrings {
    tab_home: "الرئيسية",
    tab_explorer: "المستندات",
    tab_journals: "اليوميات",
    tab_search: "بحث",
    recent_docs: "المستندات الأخيرة",
    favorites: "المفضلة",
    folders: "المجلدات",
    documents_heading: "المستندات",
    new_doc_label: "مستند جديد",
    untitled_doc: "بدون عنوان",
    page_title_placeholder: "العنوان",
    page_body_placeholder: "مستند فارغ",
    collections: "المجموعات",
    tags: "الوسوم",
    trash: "المهملات",
    today_journal: "يومية اليوم",
    open_journal: "فتح اليومية",
    create_journal: "إدخال يومية جديد",
    no_journal_for_date: "لا توجد يومية لهذا التاريخ بعد.",
    search_placeholder: "البحث في المستندات…",
    search_no_results: "لا توجد نتائج",
    exact_match_badge: "مطابقة دقيقة",
    settings_title: "الإعدادات",
    back_label: "رجوع",
    switch_workspace: "مساحات العمل",
    location_trail_title: "الموقع والمسار",
    current_trail_heading: "المسار الحالي",
    doc_locations_heading: "جميع مواقع هذا المستند",
    use_trail_action: "العودة إلى المسار",
    backlinks_label: "الروابط الخلفية",
    backlinks_ready_zero: "لا توجد روابط خلفية",
    backlinks_partial_suffix: "جارٍ الفهرسة",
    in_trash_badge: "في المهملات",
    restore_doc_label: "استعادة",
    delete_permanently_label: "حذف نهائي",
    confirm_delete_title: "حذف المستند نهائياً؟",
    confirm_delete_body: "لا يمكن التراجع عن هذا الإجراء. سيتم حذف المستند وجميع روابطه من مساحة العمل.",
    cancel_label: "إلغاء",
    doc_not_found_title: "المستند غير موجود",
    doc_not_found_body: "تم حذف هذا المستند أو لم يعد متاحاً في مساحة العمل هذه.",
    toggle_on: "مفعّل",
    toggle_off: "متوقف",
    weekday_short: ["ن", "ث", "ر", "خ", "ج", "س", "ح"],
    close_label: "تم",
    settings_groups: [
        "الحساب",
        "مساحة العمل",
        "المظهر",
        "اللغة",
        "المحرر",
        "المزامنة والعمل دون اتصال",
        "التخزين",
        "الإشعارات",
        "الميزات التجريبية",
        "حول",
    ],
    theme_light: "فاتح",
    theme_dark: "داكن",
    theme_system: "النظام",
    about_version_label: "الإصدار 0.27.5",
    drawer_title: "مساحة العمل",
    drawer_filter_placeholder: "تصفية المستندات…",
    all_docs_heading: "جميع المستندات",
    sync_synced: "تمت المزامنة",
    sync_syncing: "جارٍ المزامنة",
    sync_connecting: "جارٍ الاتصال",
    sync_offline: "دون اتصال",
    sync_auth_required: "تسجيل الدخول",
    media_image_label: "صورة",
    media_attachment_label: "مرفق",
    upload_queued: "في الانتظار",
    upload_uploaded: "تم الرفع",
    open_drawer_label: "درج مساحة العمل",
    doc_actions_title: "إجراءات المستند",
    add_to_favorites: "إضافة إلى المفضلة",
    remove_from_favorites: "إزالة من المفضلة",
    move_to_trash: "نقل إلى المهملات",
    empty_list_label: "لا توجد عناصر",
    empty_trash_label: "المهملات فارغة",
    no_locations_label: "غير مصنف في مجلد",
    today_btn_label: "اليوم",
    sign_in_label: "تسجيل الدخول",
};
