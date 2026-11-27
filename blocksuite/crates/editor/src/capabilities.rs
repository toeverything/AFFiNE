//! Orthogonal host input and form-factor capability descriptors shared by
//! BlockSuite editor views and platform hosts.

/// Primary pointer modality reported by the host platform.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum PointerKind {
    #[default]
    Mouse,
    Touch,
    Pen,
}

/// Physical device form factor reported by the host platform.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum FormFactor {
    Phone,
    Tablet,
    #[default]
    Desktop,
}

impl FormFactor {
    /// Returns `true` for native touch form factors (`Phone` and `Tablet`).
    pub const fn is_touch_form_factor(self) -> bool {
        matches!(self, Self::Phone | Self::Tablet)
    }

    /// Maps an Android `smallestScreenWidthDp` value to `Phone` (`< 600`) or `Tablet` (`>= 600`).
    pub const fn from_android_smallest_width_dp(smallest_width_dp: i32) -> Self {
        if smallest_width_dp >= 600 {
            Self::Tablet
        } else {
            Self::Phone
        }
    }

    /// Maps an iOS `UIUserInterfaceIdiom` raw flag (`true` for `.pad`) to `Tablet` or `Phone`.
    pub const fn from_ios_idiom(is_pad: bool) -> Self {
        if is_pad { Self::Tablet } else { Self::Phone }
    }
}

/// Orthogonal capability defaults derived from a host's [`FormFactor`].
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct EditorCapabilities {
    pub pointer_kind: PointerKind,
    pub form_factor: FormFactor,
    pub page_readonly: bool,
    pub edgeless_readonly: bool,
    pub database_readonly: bool,
}

impl EditorCapabilities {
    /// Stage-1 capability defaults for a given host [`FormFactor`].
    ///
    /// Touch hosts (`Phone`, `Tablet`) default to read-only Edgeless and Database
    /// surfaces while keeping Page editing enabled; `Desktop` defaults to full
    /// authoring regardless of window width.
    pub const fn for_form_factor(form_factor: FormFactor) -> Self {
        match form_factor {
            FormFactor::Phone | FormFactor::Tablet => Self {
                pointer_kind: PointerKind::Touch,
                form_factor,
                page_readonly: false,
                edgeless_readonly: true,
                database_readonly: true,
            },
            FormFactor::Desktop => Self {
                pointer_kind: PointerKind::Mouse,
                form_factor: FormFactor::Desktop,
                page_readonly: false,
                edgeless_readonly: false,
                database_readonly: false,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn form_factor_defaults_match_stage_one_readonly_matrix() {
        let cases = [
            (FormFactor::Phone, PointerKind::Touch, false, true, true),
            (FormFactor::Tablet, PointerKind::Touch, false, true, true),
            (FormFactor::Desktop, PointerKind::Mouse, false, false, false),
        ];
        for (form, pointer, page_ro, edgeless_ro, db_ro) in cases {
            let caps = EditorCapabilities::for_form_factor(form);
            assert_eq!(caps.form_factor, form);
            assert_eq!(caps.pointer_kind, pointer);
            assert_eq!(caps.page_readonly, page_ro);
            assert_eq!(caps.edgeless_readonly, edgeless_ro);
            assert_eq!(caps.database_readonly, db_ro);
        }
        assert_eq!(
            FormFactor::from_android_smallest_width_dp(390),
            FormFactor::Phone
        );
        assert_eq!(
            FormFactor::from_android_smallest_width_dp(600),
            FormFactor::Tablet
        );
        assert_eq!(FormFactor::from_ios_idiom(false), FormFactor::Phone);
        assert_eq!(FormFactor::from_ios_idiom(true), FormFactor::Tablet);
        // N1: Phone form factor always defaults database_readonly to true independently of edgeless_readonly.
        let phone = EditorCapabilities::for_form_factor(FormFactor::Phone);
        assert!(phone.database_readonly);
        assert!(phone.edgeless_readonly);
        let desktop = EditorCapabilities::for_form_factor(FormFactor::Desktop);
        assert!(!desktop.database_readonly);
        assert!(!desktop.edgeless_readonly);
    }
}
