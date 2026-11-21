//! The window's text style stack, which remembers the styles it resolves.

use crate::refineable::Refineable;
use crate::{TextAlign, TextStyle, TextStyleRefinement, Window};
use std::{cell::RefCell, rc::Rc};

/// The text style refinements pushed while drawing, as `Window` keeps them,
/// and the text styles they resolve to.
///
/// Every text element asks for the text style in effect where it is, which
/// refines the default style by every refinement on the stack, and gets a
/// copy of its own. Elements under the same refinements, like the cells of a
/// table, all ask for the same style, so the style resolved at each depth is
/// kept until the stack changes there, and handed out as an `Rc`.
pub(crate) struct TextStyleStack {
    refinements: Vec<TextStyleRefinement>,
    /// `resolved[i]`, when known, is the default text style refined by the
    /// first `i` refinements. It always holds one more entry than
    /// `refinements`.
    resolved: RefCell<Vec<Option<Rc<TextStyle>>>>,
}

impl Default for TextStyleStack {
    fn default() -> Self {
        Self {
            refinements: Vec::new(),
            resolved: RefCell::new(vec![None]),
        }
    }
}

impl Clone for TextStyleStack {
    fn clone(&self) -> Self {
        Self {
            refinements: self.refinements.clone(),
            resolved: self.resolved.clone(),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        self.refinements.clone_from(&source.refinements);
        self.resolved
            .get_mut()
            .clone_from(&source.resolved.borrow());
    }
}

impl TextStyleStack {
    pub(crate) fn push(&mut self, refinement: TextStyleRefinement) {
        self.refinements.push(refinement);
        self.resolved.get_mut().push(None);
    }

    /// Pops the refinement pushed last, dropping it where it lies rather
    /// than handing it back: nothing wants it, and it is 200-odd bytes.
    pub(crate) fn pop(&mut self) {
        if let Some(depth) = self.refinements.len().checked_sub(1) {
            self.refinements.truncate(depth);
            self.resolved.get_mut().truncate(depth + 1);
        }
    }

    pub(crate) fn clear(&mut self) {
        self.refinements.clear();
        self.resolved.get_mut().truncate(1);
    }

    /// The default text style refined by every refinement on the stack, as
    /// [`Window::text_style`] returns it.
    pub(crate) fn resolve(&self) -> Rc<TextStyle> {
        let mut resolved = self.resolved.borrow_mut();
        let depth = self.refinements.len();
        if let Some(style) = &resolved[depth] {
            return style.clone();
        }
        // `Rc::make_mut` clones the known style straight into the new
        // style's allocation, where a clone refined and then wrapped would be
        // copied twice more.
        let (mut style, from) = match resolved[..depth].iter().rposition(|style| style.is_some()) {
            Some(known) => (resolved[known].clone().unwrap(), known),
            None => (Rc::new(TextStyle::default()), 0),
        };
        let refined = Rc::make_mut(&mut style);
        for refinement in &self.refinements[from..] {
            refined.refine(refinement);
        }
        resolved[depth] = Some(style.clone());
        style
    }
}

impl TextStyleStack {
    /// The `text_align` of [`Self::resolve`]'s style, without resolving the
    /// rest of it: the refinement pushed last that sets it decides it.
    pub(crate) fn text_align(&self) -> TextAlign {
        let depth = self.refinements.len();
        if let Some(style) = &self.resolved.borrow()[depth] {
            return style.text_align;
        }
        self.refinements
            .iter()
            .rev()
            .find_map(|refinement| refinement.text_align)
            // As `TextStyle::default()` has it.
            .unwrap_or_default()
    }
}

/// The text style in effect, as [`Window::text_style`] returns it, without
/// copying it.
#[inline]
pub(crate) fn text_style(window: &Window) -> Rc<TextStyle> {
    window.text_style_stack.resolve()
}

/// What painting a text element reads of the text style in effect.
pub(crate) struct TextPaintStyle {
    pub(crate) text_align: TextAlign,
}

/// The part of the text style in effect that painting text reads. Resolving
/// the whole style for it, once for every text element painted, cost more
/// than painting a short one.
#[inline]
pub(crate) fn text_paint_style(window: &Window) -> TextPaintStyle {
    TextPaintStyle {
        text_align: window.text_style_stack.text_align(),
    }
}
