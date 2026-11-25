//! Localized UI strings for `en`, `zh-Hans`, and `ar` (RTL) mobile shell views.

use ui::Direction;

/// Supported showcase and audit locales for the mobile shell.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum MobileLocale {
    En,
    ZhHans,
    Ar,
}

impl MobileLocale {
    pub const ALL: [Self; 3] = [Self::En, Self::ZhHans, Self::Ar];

    pub const fn code(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::ZhHans => "zh-Hans",
            Self::Ar => "ar",
        }
    }

    pub const fn direction(self) -> Direction {
        match self {
            Self::Ar => Direction::Rtl,
            Self::En | Self::ZhHans => Direction::Ltr,
        }
    }

    pub fn parse(code: &str) -> Self {
        match code.trim().to_ascii_lowercase().as_str() {
            "zh" | "zh-hans" | "zh-cn" => Self::ZhHans,
            "ar" | "fa" | "ur" => Self::Ar,
            _ => Self::En,
        }
    }

    pub const fn strings(self) -> &'static MobileStrings {
        match self {
            Self::En => &EN_STRINGS,
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
    pub collections: &'static str,
    pub tags: &'static str,
    pub trash: &'static str,
    pub today_journal: &'static str,
    pub create_journal: &'static str,
    pub search_placeholder: &'static str,
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
    pub close_label: &'static str,
    pub settings_groups: [&'static str; 10],
    pub theme_light: &'static str,
    pub theme_dark: &'static str,
    pub theme_system: &'static str,
    pub about_version_label: &'static str,
}

impl MobileStrings {
    pub fn multi_location_label(&self, locale: MobileLocale, count: usize) -> String {
        match locale {
            MobileLocale::En => format!("In {count} locations"),
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
            MobileLocale::En => format!("{owner_title} · In {count} locations"),
            MobileLocale::ZhHans => format!("{owner_title} · 位于 {count} 个位置"),
            MobileLocale::Ar => format!("{owner_title} · في {count} مواقع"),
        }
    }

    pub fn backlinks_pill_label(
        &self,
        locale: MobileLocale,
        count: usize,
        is_ready: bool,
    ) -> String {
        match (locale, is_ready) {
            (MobileLocale::En, true) if count == 0 => self.backlinks_ready_zero.to_string(),
            (MobileLocale::En, true) => format!("{count} Backlinks"),
            (MobileLocale::En, false) => format!("At least {count} Backlinks (Indexing)"),
            (MobileLocale::ZhHans, true) if count == 0 => self.backlinks_ready_zero.to_string(),
            (MobileLocale::ZhHans, true) => format!("{count} 处反向链接"),
            (MobileLocale::ZhHans, false) => format!("已发现 {count} 处（索引中）"),
            (MobileLocale::Ar, true) if count == 0 => self.backlinks_ready_zero.to_string(),
            (MobileLocale::Ar, true) => format!("روابط خلفية ({count})"),
            (MobileLocale::Ar, false) => format!("روابط خلفية ({count}+ · جارٍ الفهرسة)"),
        }
    }
}

const EN_STRINGS: MobileStrings = MobileStrings {
    tab_home: "Home",
    tab_explorer: "All Docs",
    tab_journals: "Journals",
    tab_search: "Search",
    recent_docs: "Recent Documents",
    favorites: "Favorites",
    folders: "Folders",
    collections: "Collections",
    tags: "Tags",
    trash: "Trash",
    today_journal: "Today's Journal",
    create_journal: "New Journal Entry",
    search_placeholder: "Exact substring search…",
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
};

const ZH_STRINGS: MobileStrings = MobileStrings {
    tab_home: "首页",
    tab_explorer: "全部文档",
    tab_journals: "日记",
    tab_search: "搜索",
    recent_docs: "最近文档",
    favorites: "收藏夹",
    folders: "文件夹",
    collections: "集合",
    tags: "标签",
    trash: "回收站",
    today_journal: "今日日记",
    create_journal: "新建今日日记",
    search_placeholder: "精确子串搜索…",
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
};

const AR_STRINGS: MobileStrings = MobileStrings {
    tab_home: "الرئيسية",
    tab_explorer: "المستندات",
    tab_journals: "اليوميات",
    tab_search: "بحث",
    recent_docs: "المستندات الأخيرة",
    favorites: "المفضلة",
    folders: "المجلدات",
    collections: "المجموعات",
    tags: "الوسوم",
    trash: "المهملات",
    today_journal: "يومية اليوم",
    create_journal: "إنشاء يومية جديدة",
    search_placeholder: "بحث نصي دقيق…",
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
};
