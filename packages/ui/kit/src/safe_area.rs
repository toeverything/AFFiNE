//! Safe-area and keyboard (IME) inset container built on logical edges.

use ui::{DefiniteLength, Direction, Div, Edges, Pixels, Window, WindowInsets, div, px};

use super::logical::{LogicalEdges, LogicalStyled};

/// Independent toggles for each logical side of a [`SafeArea`], plus IME keyboard avoidance.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SafeAreaEdges {
    pub top: bool,
    pub bottom: bool,
    pub inline_start: bool,
    pub inline_end: bool,
    pub avoid_ime: bool,
}

impl Default for SafeAreaEdges {
    fn default() -> Self {
        Self::all()
    }
}

impl SafeAreaEdges {
    pub const fn all() -> Self {
        Self {
            top: true,
            bottom: true,
            inline_start: true,
            inline_end: true,
            avoid_ime: true,
        }
    }

    pub const fn none() -> Self {
        Self {
            top: false,
            bottom: false,
            inline_start: false,
            inline_end: false,
            avoid_ime: false,
        }
    }

    pub const fn vertical() -> Self {
        Self {
            top: true,
            bottom: true,
            inline_start: false,
            inline_end: false,
            avoid_ime: true,
        }
    }

    pub const fn horizontal() -> Self {
        Self {
            top: false,
            bottom: false,
            inline_start: true,
            inline_end: true,
            avoid_ime: false,
        }
    }

    pub const fn with_top(mut self, enabled: bool) -> Self {
        self.top = enabled;
        self
    }

    pub const fn with_bottom(mut self, enabled: bool) -> Self {
        self.bottom = enabled;
        self
    }

    pub const fn with_inline_start(mut self, enabled: bool) -> Self {
        self.inline_start = enabled;
        self
    }

    pub const fn with_inline_end(mut self, enabled: bool) -> Self {
        self.inline_end = enabled;
        self
    }

    pub const fn with_avoid_ime(mut self, enabled: bool) -> Self {
        self.avoid_ime = enabled;
        self
    }
}

/// Safe-area helper that reads `Window::insets()` and applies logical padding.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SafeArea {
    pub edges: SafeAreaEdges,
}

impl SafeArea {
    pub const fn new(edges: SafeAreaEdges) -> Self {
        Self { edges }
    }

    /// Resolves logical safe-area (and optional IME) insets for the given writing direction.
    pub fn resolve_logical(
        insets: &WindowInsets,
        direction: Direction,
        edges: SafeAreaEdges,
    ) -> LogicalEdges<Pixels> {
        let base = if edges.avoid_ime {
            insets.effective()
        } else {
            insets.safe_area
        };
        let logical = LogicalEdges::from_physical(&base, direction);
        LogicalEdges {
            top: if edges.top { logical.top } else { px(0.0) },
            inline_start: if edges.inline_start {
                logical.inline_start
            } else {
                px(0.0)
            },
            bottom: if edges.bottom {
                logical.bottom
            } else {
                px(0.0)
            },
            inline_end: if edges.inline_end {
                logical.inline_end
            } else {
                px(0.0)
            },
        }
    }

    /// Resolves physical safe-area padding for the given writing direction.
    pub fn resolve_physical(
        insets: &WindowInsets,
        direction: Direction,
        edges: SafeAreaEdges,
    ) -> Edges<Pixels> {
        Self::resolve_logical(insets, direction, edges).resolve(direction)
    }

    /// Builds a `Div` container padded by the window's active safe-area and IME insets.
    pub fn container(&self, window: &Window) -> Div {
        let direction = window.layout_direction();
        let insets = window.insets();
        let logical = Self::resolve_logical(&insets, direction, self.edges);
        let padding = LogicalEdges::new(
            DefiniteLength::from(logical.top),
            DefiniteLength::from(logical.inline_start),
            DefiniteLength::from(logical.bottom),
            DefiniteLength::from(logical.inline_end),
        );
        div().p_logical(padding, direction)
    }
}

#[cfg(test)]
mod tests {
    use ui::Corners;

    use super::*;

    fn sample_insets() -> WindowInsets {
        WindowInsets {
            safe_area: Edges {
                top: px(47.0),
                right: px(16.0),
                bottom: px(34.0),
                left: px(59.0),
            },
            ime: Edges {
                top: px(0.0),
                right: px(0.0),
                bottom: px(302.0),
                left: px(0.0),
            },
            corner_radii: Corners::all(px(39.0)),
        }
    }

    #[test]
    fn safe_area_respects_edge_toggles_and_ime_avoidance() {
        let insets = sample_insets();
        let cases = [
            (
                SafeAreaEdges::all(),
                Direction::Ltr,
                LogicalEdges::new(px(47.0), px(59.0), px(302.0), px(16.0)),
            ),
            (
                SafeAreaEdges::all().with_avoid_ime(false),
                Direction::Ltr,
                LogicalEdges::new(px(47.0), px(59.0), px(34.0), px(16.0)),
            ),
            (
                SafeAreaEdges::vertical().with_top(false),
                Direction::Ltr,
                LogicalEdges::new(px(0.0), px(0.0), px(302.0), px(0.0)),
            ),
            (
                SafeAreaEdges::horizontal().with_inline_end(false),
                Direction::Ltr,
                LogicalEdges::new(px(0.0), px(59.0), px(0.0), px(0.0)),
            ),
            (
                SafeAreaEdges::horizontal().with_inline_end(false),
                Direction::Rtl,
                LogicalEdges::new(px(0.0), px(16.0), px(0.0), px(0.0)),
            ),
        ];

        for (edges, dir, expected) in cases {
            assert_eq!(SafeArea::resolve_logical(&insets, dir, edges), expected);
        }
    }

    #[test]
    fn safe_area_mirrors_inline_edges_under_rtl() {
        let insets = sample_insets();
        let only_start = SafeAreaEdges::none().with_inline_start(true);
        let ltr_phys = SafeArea::resolve_physical(&insets, Direction::Ltr, only_start);
        let rtl_phys = SafeArea::resolve_physical(&insets, Direction::Rtl, only_start);

        assert_eq!(ltr_phys.left, px(59.0));
        assert_eq!(ltr_phys.right, px(0.0));
        assert_eq!(rtl_phys.left, px(0.0));
        assert_eq!(rtl_phys.right, px(16.0));
    }
}
