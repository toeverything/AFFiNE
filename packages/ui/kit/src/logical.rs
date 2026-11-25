//! Logical inline-start / inline-end geometry helpers over `ui::Edges` and `ui::Styled`.

use std::fmt::Debug;

use ui::{AbsoluteLength, DefiniteLength, Direction, Edges, Length, Styled};

/// Logical box edges parameterized by writing direction (`inline_start` / `inline_end`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct LogicalEdges<T> {
    pub top: T,
    pub inline_start: T,
    pub bottom: T,
    pub inline_end: T,
}

impl<T: Clone + Debug + Default + PartialEq> LogicalEdges<T> {
    pub const fn new(top: T, inline_start: T, bottom: T, inline_end: T) -> Self {
        Self {
            top,
            inline_start,
            bottom,
            inline_end,
        }
    }

    pub fn all(value: T) -> Self {
        Self {
            top: value.clone(),
            inline_start: value.clone(),
            bottom: value.clone(),
            inline_end: value,
        }
    }

    /// Resolves logical sides into physical `ui::Edges` for `direction`.
    pub fn resolve(self, direction: Direction) -> Edges<T> {
        Edges::from_logical(
            self.top,
            self.inline_start,
            self.bottom,
            self.inline_end,
            direction,
        )
    }

    /// Projects physical `ui::Edges` into logical sides for `direction`.
    pub fn from_physical(edges: &Edges<T>, direction: Direction) -> Self {
        Self {
            top: edges.top.clone(),
            inline_start: edges.inline_start(direction).clone(),
            bottom: edges.bottom.clone(),
            inline_end: edges.inline_end(direction).clone(),
        }
    }
}

/// Extension trait adding direction-aware logical layout setters to any `ui::Styled` element.
pub trait LogicalStyled: Styled {
    fn p_logical(mut self, edges: LogicalEdges<DefiniteLength>, direction: Direction) -> Self {
        let physical = edges.resolve(direction);
        let padding = &mut self.style().padding;
        padding.top = Some(physical.top);
        padding.right = Some(physical.right);
        padding.bottom = Some(physical.bottom);
        padding.left = Some(physical.left);
        self
    }

    fn ps(mut self, value: impl Into<DefiniteLength>, direction: Direction) -> Self {
        let value = Some(value.into());
        let padding = &mut self.style().padding;
        match direction {
            Direction::Ltr => padding.left = value,
            Direction::Rtl => padding.right = value,
        }
        self
    }

    fn pe(mut self, value: impl Into<DefiniteLength>, direction: Direction) -> Self {
        let value = Some(value.into());
        let padding = &mut self.style().padding;
        match direction {
            Direction::Ltr => padding.right = value,
            Direction::Rtl => padding.left = value,
        }
        self
    }

    fn m_logical(mut self, edges: LogicalEdges<Length>, direction: Direction) -> Self {
        let physical = edges.resolve(direction);
        let margin = &mut self.style().margin;
        margin.top = Some(physical.top);
        margin.right = Some(physical.right);
        margin.bottom = Some(physical.bottom);
        margin.left = Some(physical.left);
        self
    }

    fn ms(mut self, value: impl Into<Length>, direction: Direction) -> Self {
        let value = Some(value.into());
        let margin = &mut self.style().margin;
        match direction {
            Direction::Ltr => margin.left = value,
            Direction::Rtl => margin.right = value,
        }
        self
    }

    fn me(mut self, value: impl Into<Length>, direction: Direction) -> Self {
        let value = Some(value.into());
        let margin = &mut self.style().margin;
        match direction {
            Direction::Ltr => margin.right = value,
            Direction::Rtl => margin.left = value,
        }
        self
    }

    fn inset_logical(mut self, edges: LogicalEdges<Length>, direction: Direction) -> Self {
        let physical = edges.resolve(direction);
        let inset = &mut self.style().inset;
        inset.top = Some(physical.top);
        inset.right = Some(physical.right);
        inset.bottom = Some(physical.bottom);
        inset.left = Some(physical.left);
        self
    }

    fn inset_s(mut self, value: impl Into<Length>, direction: Direction) -> Self {
        let value = Some(value.into());
        let inset = &mut self.style().inset;
        match direction {
            Direction::Ltr => inset.left = value,
            Direction::Rtl => inset.right = value,
        }
        self
    }

    fn inset_e(mut self, value: impl Into<Length>, direction: Direction) -> Self {
        let value = Some(value.into());
        let inset = &mut self.style().inset;
        match direction {
            Direction::Ltr => inset.right = value,
            Direction::Rtl => inset.left = value,
        }
        self
    }

    fn border_logical(mut self, edges: LogicalEdges<AbsoluteLength>, direction: Direction) -> Self {
        let physical = edges.resolve(direction);
        let border = &mut self.style().border_widths;
        border.top = Some(physical.top);
        border.right = Some(physical.right);
        border.bottom = Some(physical.bottom);
        border.left = Some(physical.left);
        self
    }

    fn border_s(mut self, value: impl Into<AbsoluteLength>, direction: Direction) -> Self {
        let value = Some(value.into());
        let border = &mut self.style().border_widths;
        match direction {
            Direction::Ltr => border.left = value,
            Direction::Rtl => border.right = value,
        }
        self
    }

    fn border_e(mut self, value: impl Into<AbsoluteLength>, direction: Direction) -> Self {
        let value = Some(value.into());
        let border = &mut self.style().border_widths;
        match direction {
            Direction::Ltr => border.right = value,
            Direction::Rtl => border.left = value,
        }
        self
    }
}

impl<T: Styled> LogicalStyled for T {}

#[cfg(test)]
mod tests {
    use ui::{div, px};

    use super::*;

    #[test]
    fn logical_edges_mirror_horizontally_between_ltr_and_rtl() {
        let logical = LogicalEdges::new(px(4.0), px(12.0), px(8.0), px(20.0));
        let ltr = logical.resolve(Direction::Ltr);
        let rtl = logical.resolve(Direction::Rtl);

        assert_eq!(ltr.top, px(4.0));
        assert_eq!(ltr.bottom, px(8.0));
        assert_eq!(ltr.left, px(12.0));
        assert_eq!(ltr.right, px(20.0));

        assert_eq!(rtl.top, ltr.top);
        assert_eq!(rtl.bottom, ltr.bottom);
        assert_eq!(rtl.left, ltr.right);
        assert_eq!(rtl.right, ltr.left);

        assert_eq!(LogicalEdges::from_physical(&ltr, Direction::Ltr), logical);
        assert_eq!(LogicalEdges::from_physical(&rtl, Direction::Rtl), logical);
    }

    #[test]
    fn logical_styled_setters_mirror_padding_margin_inset_and_border() {
        let mut ltr = div()
            .ps(px(10.0), Direction::Ltr)
            .pe(px(24.0), Direction::Ltr)
            .ms(px(6.0), Direction::Ltr)
            .me(px(14.0), Direction::Ltr)
            .inset_s(px(3.0), Direction::Ltr)
            .inset_e(px(9.0), Direction::Ltr)
            .border_s(px(2.0), Direction::Ltr)
            .border_e(px(5.0), Direction::Ltr);

        let mut rtl = div()
            .ps(px(10.0), Direction::Rtl)
            .pe(px(24.0), Direction::Rtl)
            .ms(px(6.0), Direction::Rtl)
            .me(px(14.0), Direction::Rtl)
            .inset_s(px(3.0), Direction::Rtl)
            .inset_e(px(9.0), Direction::Rtl)
            .border_s(px(2.0), Direction::Rtl)
            .border_e(px(5.0), Direction::Rtl);

        let ls = ltr.style();
        let rs = rtl.style();

        assert_eq!(ls.padding.left, rs.padding.right);
        assert_eq!(ls.padding.right, rs.padding.left);
        assert_eq!(ls.margin.left, rs.margin.right);
        assert_eq!(ls.margin.right, rs.margin.left);
        assert_eq!(ls.inset.left, rs.inset.right);
        assert_eq!(ls.inset.right, rs.inset.left);
        assert_eq!(ls.border_widths.left, rs.border_widths.right);
        assert_eq!(ls.border_widths.right, rs.border_widths.left);
    }
}
