//! 25-language i18n catalog and deterministic fallback chain matching
//! `packages/frontend/i18n/src/resources/index.ts`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::ClientResult;

/// Metadata for one of the 25 supported AFFiNE locales.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LanguageMeta {
    pub code: &'static str,
    pub name: &'static str,
    pub original_name: &'static str,
    pub rtl: bool,
}

/// Exact 25 supported locales matching `packages/frontend/i18n/src/resources/index.ts`.
pub const SUPPORTED_LANGUAGES: &[LanguageMeta] = &[
    LanguageMeta {
        code: "en",
        name: "English",
        original_name: "English",
        rtl: false,
    },
    LanguageMeta {
        code: "ko",
        name: "Korean (South Korea)",
        original_name: "한국어(대한민국)",
        rtl: false,
    },
    LanguageMeta {
        code: "pt-BR",
        name: "Portuguese (Brazil)",
        original_name: "português (Brasil)",
        rtl: false,
    },
    LanguageMeta {
        code: "zh-Hans",
        name: "Simplified Chinese",
        original_name: "简体中文",
        rtl: false,
    },
    LanguageMeta {
        code: "zh-Hant",
        name: "Traditional Chinese",
        original_name: "繁體中文",
        rtl: false,
    },
    LanguageMeta {
        code: "fr",
        name: "French",
        original_name: "français",
        rtl: false,
    },
    LanguageMeta {
        code: "es",
        name: "Spanish",
        original_name: "español",
        rtl: false,
    },
    LanguageMeta {
        code: "es-AR",
        name: "Spanish (Argentina)",
        original_name: "español (Argentina)",
        rtl: false,
    },
    LanguageMeta {
        code: "es-CL",
        name: "Spanish (Chile)",
        original_name: "español (Chile)",
        rtl: false,
    },
    LanguageMeta {
        code: "pl",
        name: "Polish",
        original_name: "Polski",
        rtl: false,
    },
    LanguageMeta {
        code: "de",
        name: "German",
        original_name: "Deutsch",
        rtl: false,
    },
    LanguageMeta {
        code: "ru",
        name: "Russian",
        original_name: "русский",
        rtl: false,
    },
    LanguageMeta {
        code: "ja",
        name: "Japanese",
        original_name: "日本語",
        rtl: false,
    },
    LanguageMeta {
        code: "it",
        name: "Italian",
        original_name: "italiano",
        rtl: false,
    },
    LanguageMeta {
        code: "ca",
        name: "Catalan",
        original_name: "català",
        rtl: false,
    },
    LanguageMeta {
        code: "da",
        name: "Danish",
        original_name: "dansk",
        rtl: false,
    },
    LanguageMeta {
        code: "hi",
        name: "Hindi",
        original_name: "हिन्दी",
        rtl: false,
    },
    LanguageMeta {
        code: "sv-SE",
        name: "Swedish (Sweden)",
        original_name: "svenska (Sverige)",
        rtl: false,
    },
    LanguageMeta {
        code: "ur",
        name: "Urdu",
        original_name: "اردو",
        rtl: true,
    },
    LanguageMeta {
        code: "ar",
        name: "Arabic",
        original_name: "العربية",
        rtl: true,
    },
    LanguageMeta {
        code: "fa",
        name: "Persian",
        original_name: "فارسی",
        rtl: true,
    },
    LanguageMeta {
        code: "uk",
        name: "Ukrainian",
        original_name: "українська",
        rtl: false,
    },
    LanguageMeta {
        code: "nb-NO",
        name: "Norwegian",
        original_name: "Norsk (Bokmål)",
        rtl: false,
    },
    LanguageMeta {
        code: "kk",
        name: "Kazakh",
        original_name: "Қазақша",
        rtl: false,
    },
    LanguageMeta {
        code: "tr",
        name: "Turkish",
        original_name: "Türkçe",
        rtl: false,
    },
];

/// Look up metadata for a canonical supported locale code.
pub fn find_language(code: &str) -> Option<LanguageMeta> {
    SUPPORTED_LANGUAGES
        .iter()
        .copied()
        .find(|meta| meta.code.eq_ignore_ascii_case(code))
}

/// Resolve an ordered fallback chain of supported locale codes terminating in `"en"`.
pub fn resolve_fallback_chain(requested: &str) -> Vec<&'static str> {
    let normalized = requested.trim().replace('_', "-");
    let mut chain = Vec::new();

    if let Some(exact) = find_language(&normalized) {
        chain.push(exact.code);
    } else {
        let lower = normalized.to_ascii_lowercase();
        if lower.starts_with("zh-tw")
            || lower.starts_with("zh-hk")
            || lower.starts_with("zh-mo")
            || lower.starts_with("zh-hant")
        {
            chain.push("zh-Hant");
        } else if lower.starts_with("zh") {
            chain.push("zh-Hans");
        } else if lower.starts_with("pt") {
            chain.push("pt-BR");
        } else if lower.starts_with("sv") {
            chain.push("sv-SE");
        } else if lower.starts_with("nb") || lower.starts_with("no") {
            chain.push("nb-NO");
        }
    }

    if let Some((base, _)) = normalized.split_once('-')
        && let Some(base_meta) = find_language(base)
        && !chain.contains(&base_meta.code)
    {
        chain.push(base_meta.code);
    }

    if !chain.contains(&"en") {
        chain.push("en");
    }
    chain
}

/// Runtime i18n dictionary store supporting dynamic locale loading and fallback lookup.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct I18nCatalog {
    active_locale: String,
    bundles: BTreeMap<String, BTreeMap<String, String>>,
}

impl I18nCatalog {
    pub fn new(active_locale: impl Into<String>) -> Self {
        let req = active_locale.into();
        let resolved = resolve_fallback_chain(&req)[0].to_string();
        Self {
            active_locale: resolved,
            bundles: BTreeMap::new(),
        }
    }

    pub fn active_locale(&self) -> &str {
        &self.active_locale
    }

    pub fn is_rtl(&self) -> bool {
        find_language(&self.active_locale).is_some_and(|m| m.rtl)
    }

    pub fn set_locale(&mut self, locale: &str) {
        self.active_locale = resolve_fallback_chain(locale)[0].to_string();
    }

    /// Load a flat JSON resource bundle (`{ "key": "value" }`) for `locale`.
    pub fn load_json_bundle(&mut self, locale: &str, json_bytes: &[u8]) -> ClientResult<usize> {
        let parsed: Value = serde_json::from_slice(json_bytes)?;
        let Some(obj) = parsed.as_object() else {
            return Ok(0);
        };
        let canonical = find_language(locale)
            .map(|m| m.code.to_string())
            .unwrap_or_else(|| locale.to_string());
        let entry = self.bundles.entry(canonical).or_default();
        let mut count = 0usize;
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                entry.insert(k.clone(), s.to_string());
                count += 1;
            }
        }
        Ok(count)
    }

    /// Translate `key` walking [`resolve_fallback_chain`] for the active locale, falling back to `key`.
    pub fn t<'a>(&'a self, key: &'a str) -> &'a str {
        for locale in resolve_fallback_chain(&self.active_locale) {
            if let Some(bundle) = self.bundles.get(locale)
                && let Some(val) = bundle.get(key)
            {
                return val.as_str();
            }
        }
        key
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    #[test]
    fn supports_all_25_languages_and_parses_all_repo_resource_files() {
        assert_eq!(SUPPORTED_LANGUAGES.len(), 25);
        assert_eq!(resolve_fallback_chain("es-AR"), vec!["es-AR", "es", "en"]);
        assert_eq!(resolve_fallback_chain("zh-TW"), vec!["zh-Hant", "en"]);
        assert_eq!(resolve_fallback_chain("zh-CN"), vec!["zh-Hans", "en"]);
        assert_eq!(resolve_fallback_chain("unknown-XX"), vec!["en"]);

        let resources_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../i18n/src/resources");
        let mut catalog = I18nCatalog::new("es-AR");
        for lang in SUPPORTED_LANGUAGES {
            let file_path = resources_dir.join(format!("{}.json", lang.code));
            let raw = std::fs::read(&file_path)
                .unwrap_or_else(|e| panic!("failed to read {}: {e}", file_path.display()));
            let loaded = catalog.load_json_bundle(lang.code, &raw).unwrap();
            assert!(loaded > 0, "locale {} had zero string entries", lang.code);
        }

        // Arabic/Persian/Urdu are RTL; English is LTR.
        catalog.set_locale("ar");
        assert!(catalog.is_rtl());
        catalog.set_locale("en");
        assert!(!catalog.is_rtl());
    }
}
