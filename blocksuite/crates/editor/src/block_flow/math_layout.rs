//! Zero-dependency pure-Rust 2D mathematical typesetting for LaTeX expressions.
//!
//! Renders common LaTeX constructs (`\frac`, `\sqrt`, superscripts/subscripts,
//! `\int`/`\sum`/`\prod` limits, Greek letters, and mathematical operators) into
//! GPUI `Prim::Text` and `Prim::Quad` vector primitives using the already-bundled
//! fonts, avoiding any binary size overhead in the main Web Wasm bundle.

use std::rc::Rc;

use ui::{Hsla, Window};

use crate::theme::FONT_SANS;

use super::{
    FlowRect, InlineAlign, InlineBaseline, InlineStyle, Prim,
    inline::{layout_inline, shape},
};

#[derive(Clone, Debug, PartialEq)]
enum MathNode {
    Text(String),
    BigOp(String),
    Frac {
        num: Vec<MathNode>,
        den: Vec<MathNode>,
    },
    Sqrt(Vec<MathNode>),
    Script {
        base: Box<MathNode>,
        sup: Option<Vec<MathNode>>,
        sub: Option<Vec<MathNode>>,
    },
    Group(Vec<MathNode>),
}

fn latex_symbol(cmd: &str) -> Option<&'static str> {
    Some(match cmd {
        "alpha" => "\u{03B1}",
        "beta" => "\u{03B2}",
        "gamma" => "\u{03B3}",
        "delta" => "\u{03B4}",
        "epsilon" | "varepsilon" => "\u{03B5}",
        "zeta" => "\u{03B6}",
        "eta" => "\u{03B7}",
        "theta" | "vartheta" => "\u{03B8}",
        "iota" => "\u{03B9}",
        "kappa" => "\u{03BA}",
        "lambda" => "\u{03BB}",
        "mu" => "\u{03BC}",
        "nu" => "\u{03BD}",
        "xi" => "\u{03BE}",
        "pi" | "varpi" => "\u{03C0}",
        "rho" | "varrho" => "\u{03C1}",
        "sigma" | "varsigma" => "\u{03C3}",
        "tau" => "\u{03C4}",
        "upsilon" => "\u{03C5}",
        "phi" | "varphi" => "\u{03C6}",
        "chi" => "\u{03C7}",
        "psi" => "\u{03C8}",
        "omega" => "\u{03C9}",
        "Gamma" => "\u{0393}",
        "Delta" => "\u{0394}",
        "Theta" => "\u{0398}",
        "Lambda" => "\u{039B}",
        "Xi" => "\u{039E}",
        "Pi" => "\u{03A0}",
        "Sigma" => "\u{03A3}",
        "Phi" => "\u{03A6}",
        "Psi" => "\u{03A8}",
        "Omega" => "\u{03A9}",
        "infty" => "\u{221E}",
        "pm" => "\u{00B1}",
        "mp" => "\u{2213}",
        "times" => "\u{00D7}",
        "cdot" => "\u{00B7}",
        "div" => "\u{00F7}",
        "leq" | "le" => "\u{2264}",
        "geq" | "ge" => "\u{2265}",
        "neq" | "ne" => "\u{2260}",
        "approx" => "\u{2248}",
        "equiv" => "\u{2261}",
        "to" | "rightarrow" => "\u{2192}",
        "leftarrow" => "\u{2190}",
        "Rightarrow" => "\u{21D2}",
        "Leftarrow" => "\u{21D0}",
        "iff" | "Leftrightarrow" => "\u{21D4}",
        "partial" => "\u{2202}",
        "nabla" => "\u{2207}",
        "forall" => "\u{2200}",
        "exists" => "\u{2203}",
        "in" => "\u{2208}",
        "notin" => "\u{2209}",
        "subset" => "\u{2282}",
        "subseteq" => "\u{2286}",
        "cup" => "\u{222A}",
        "cap" => "\u{2229}",
        "dots" | "ldots" | "cdots" => "\u{2026}",
        "sin" => "sin",
        "cos" => "cos",
        "tan" => "tan",
        "log" => "log",
        "ln" => "ln",
        "exp" => "exp",
        "lim" => "lim",
        "max" => "max",
        "min" => "min",
        "," | ";" | " " | "quad" | "qquad" => " ",
        "left" | "right" | "displaystyle" | "textstyle" => "",
        _ => return None,
    })
}

fn big_op_symbol(cmd: &str) -> Option<&'static str> {
    Some(match cmd {
        "int" => "\u{222B}",
        "iint" => "\u{222C}",
        "oint" => "\u{222E}",
        "sum" => "\u{2211}",
        "prod" => "\u{220F}",
        _ => return None,
    })
}

const MAX_MATH_NESTING: usize = 64;

struct Parser<'a> {
    src: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(src: &'a str) -> Self {
        Self { src, pos: 0 }
    }

    fn peek(&self) -> Option<char> {
        self.src[self.pos..].chars().next()
    }

    fn bump(&mut self) -> Option<char> {
        let ch = self.peek()?;
        self.pos += ch.len_utf8();
        Some(ch)
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(c) if c.is_whitespace()) {
            self.bump();
        }
    }

    fn parse_seq(&mut self, stop_brace: bool, depth: usize) -> Vec<MathNode> {
        let mut nodes = Vec::new();
        while let Some(ch) = self.peek() {
            if stop_brace && ch == '}' {
                self.bump();
                break;
            }
            if ch.is_whitespace() {
                self.bump();
                continue;
            }
            if depth >= MAX_MATH_NESTING {
                self.bump();
                nodes.push(MathNode::Text(ch.to_string()));
                continue;
            }
            if ch == '^' || ch == '_' {
                let is_sup = ch == '^';
                self.bump();
                let arg = self.parse_arg(depth + 1);
                let base = nodes.pop().unwrap_or_else(|| MathNode::Text(String::new()));
                let merged = match base {
                    MathNode::Script {
                        base,
                        mut sup,
                        mut sub,
                    } => {
                        if is_sup {
                            sup = Some(arg);
                        } else {
                            sub = Some(arg);
                        }
                        MathNode::Script { base, sup, sub }
                    }
                    other => MathNode::Script {
                        base: Box::new(other),
                        sup: is_sup.then_some(arg.clone()),
                        sub: (!is_sup).then_some(arg),
                    },
                };
                nodes.push(merged);
                continue;
            }
            if let Some(atom) = self.parse_atom(depth) {
                nodes.push(atom);
            }
        }
        nodes
    }

    fn consume_flat_token(&mut self) -> Option<String> {
        let ch = self.bump()?;
        if ch == '\\' {
            let start = self.pos;
            if let Some(next) = self.peek() {
                if next.is_ascii_alphabetic() {
                    while matches!(self.peek(), Some(c) if c.is_ascii_alphabetic()) {
                        self.bump();
                    }
                } else {
                    self.bump();
                }
            }
            let cmd = &self.src[start..self.pos];
            return Some(format!("\\{cmd}"));
        }
        Some(ch.to_string())
    }

    fn parse_arg(&mut self, depth: usize) -> Vec<MathNode> {
        self.skip_ws();
        if depth >= MAX_MATH_NESTING {
            if self.peek() == Some('{') {
                self.bump();
                let mut lit = String::new();
                let mut balance = 1usize;
                while let Some(c) = self.bump() {
                    match c {
                        '{' => {
                            balance += 1;
                            lit.push(c);
                        }
                        '}' => {
                            balance -= 1;
                            if balance == 0 {
                                break;
                            }
                            lit.push(c);
                        }
                        _ => lit.push(c),
                    }
                }
                return vec![MathNode::Text(lit)];
            }
            return self
                .consume_flat_token()
                .map(|t| vec![MathNode::Text(t)])
                .unwrap_or_default();
        }
        if self.peek() == Some('{') {
            self.bump();
            self.parse_seq(true, depth + 1)
        } else {
            self.parse_atom(depth).into_iter().collect()
        }
    }

    fn parse_braced_plain(&mut self) -> String {
        self.skip_ws();
        if self.peek() != Some('{') {
            return self.bump().map(|c| c.to_string()).unwrap_or_default();
        }
        self.bump();
        let mut out = String::new();
        while let Some(c) = self.bump() {
            if c == '}' {
                break;
            }
            out.push(c);
        }
        out
    }

    fn parse_atom(&mut self, depth: usize) -> Option<MathNode> {
        if depth >= MAX_MATH_NESTING {
            return self.consume_flat_token().map(MathNode::Text);
        }
        let ch = self.bump()?;
        match ch {
            '{' => {
                if depth >= MAX_MATH_NESTING {
                    Some(MathNode::Text("{".into()))
                } else {
                    Some(MathNode::Group(self.parse_seq(true, depth + 1)))
                }
            }
            '\\' => {
                let start = self.pos;
                if let Some(next) = self.peek() {
                    if next.is_ascii_alphabetic() {
                        while matches!(self.peek(), Some(c) if c.is_ascii_alphabetic()) {
                            self.bump();
                        }
                    } else {
                        self.bump();
                    }
                }
                let cmd = &self.src[start..self.pos];
                match cmd {
                    "\\" => Some(MathNode::Text("; ".into())),
                    "frac" | "dfrac" | "tfrac" => {
                        let num = self.parse_arg(depth + 1);
                        let den = self.parse_arg(depth + 1);
                        Some(MathNode::Frac { num, den })
                    }
                    "sqrt" => {
                        self.skip_ws();
                        if self.peek() == Some('[') {
                            while let Some(c) = self.bump() {
                                if c == ']' {
                                    break;
                                }
                            }
                        }
                        let body = self.parse_arg(depth + 1);
                        Some(MathNode::Sqrt(body))
                    }
                    "mathbb" => {
                        let arg = self.parse_braced_plain();
                        let mapped: String = arg
                            .chars()
                            .map(|c| match c {
                                'R' => '\u{211D}',
                                'N' => '\u{2115}',
                                'Z' => '\u{2124}',
                                'Q' => '\u{211A}',
                                'C' => '\u{2102}',
                                other => other,
                            })
                            .collect();
                        Some(MathNode::Text(mapped))
                    }
                    "vec" | "hat" | "bar" | "tilde" => {
                        let arg = self.parse_braced_plain();
                        let mark = match cmd {
                            "vec" => '\u{20D7}',
                            "hat" => '\u{0302}',
                            "bar" => '\u{0304}',
                            _ => '\u{0303}',
                        };
                        let mut out = String::new();
                        for c in arg.chars() {
                            out.push(c);
                            out.push(mark);
                        }
                        Some(MathNode::Text(out))
                    }
                    "begin" => {
                        let env = self.parse_braced_plain();
                        let open = match env.as_str() {
                            "pmatrix" => "(",
                            "bmatrix" => "[",
                            "Bmatrix" => "{",
                            "vmatrix" => "|",
                            _ => "",
                        };
                        if open.is_empty() {
                            None
                        } else {
                            Some(MathNode::Text(open.to_string()))
                        }
                    }
                    "end" => {
                        let env = self.parse_braced_plain();
                        let close = match env.as_str() {
                            "pmatrix" => ")",
                            "bmatrix" => "]",
                            "Bmatrix" => "}",
                            "vmatrix" => "|",
                            _ => "",
                        };
                        if close.is_empty() {
                            None
                        } else {
                            Some(MathNode::Text(close.to_string()))
                        }
                    }
                    "text" | "mathrm" | "mathbf" | "mathit" | "operatorname" => {
                        Some(MathNode::Group(self.parse_arg(depth + 1)))
                    }
                    _ if big_op_symbol(cmd).is_some() => {
                        Some(MathNode::BigOp(big_op_symbol(cmd).unwrap().to_string()))
                    }
                    _ if latex_symbol(cmd).is_some() => {
                        let sym = latex_symbol(cmd).unwrap();
                        if sym.is_empty() {
                            None
                        } else {
                            Some(MathNode::Text(sym.to_string()))
                        }
                    }
                    _ => Some(MathNode::Text(cmd.to_string())),
                }
            }
            '&' => Some(MathNode::Text(" ".into())),
            '-' => Some(MathNode::Text("\u{2212}".into())),
            '=' | '+' | '<' | '>' => Some(MathNode::Text(format!(" {ch} "))),
            other => Some(MathNode::Text(other.to_string())),
        }
    }
}

struct MathBox {
    width: f32,
    ascent: f32,
    descent: f32,
    prims: Vec<Prim>,
}

impl MathBox {
    fn height(&self) -> f32 {
        self.ascent + self.descent
    }
}

fn translate_prims(prims: &mut [Prim], dx: f32, dy: f32) {
    for prim in prims {
        match prim {
            Prim::Text { x, y, .. } => {
                *x += dx;
                *y += dy;
            }
            Prim::Quad { rect, .. } | Prim::Image { rect, .. } | Prim::Icon { rect, .. } => {
                *rect = rect.translated(dx, dy);
            }
            _ => {}
        }
    }
}

fn layout_text_atom(text: &str, size: f32, color: Hsla, window: &Window) -> MathBox {
    let style = InlineStyle::new(FONT_SANS, size, 400.0, color);
    let width = f32::from(shape(window, text, &style).width).max(1.0);
    let line_height = (size * 1.25).ceil();
    let layout = Rc::new(layout_inline(
        text,
        &style,
        width + 2.0,
        line_height,
        InlineBaseline::Of(&style),
        InlineAlign::Left,
        window,
    ));
    let ascent = (line_height * 0.78).round();
    let descent = (line_height - ascent).max(2.0);
    MathBox {
        width,
        ascent,
        descent,
        prims: vec![Prim::Text {
            x: 0.0,
            y: 0.0,
            layout,
            clip: None,
        }],
    }
}

fn layout_seq(nodes: &[MathNode], size: f32, color: Hsla, window: &Window) -> MathBox {
    let mut boxes: Vec<MathBox> = nodes
        .iter()
        .map(|n| layout_node(n, size, color, window))
        .collect();
    let ascent = boxes
        .iter()
        .map(|b| b.ascent)
        .fold((size * 0.78).round(), f32::max);
    let descent = boxes
        .iter()
        .map(|b| b.descent)
        .fold((size * 0.25).round(), f32::max);
    let mut x = 0.0;
    let mut prims = Vec::new();
    for b in &mut boxes {
        let dy = ascent - b.ascent;
        translate_prims(&mut b.prims, x, dy);
        prims.append(&mut b.prims);
        x += b.width;
    }
    MathBox {
        width: x.max(1.0),
        ascent,
        descent,
        prims,
    }
}

fn layout_node(node: &MathNode, size: f32, color: Hsla, window: &Window) -> MathBox {
    match node {
        MathNode::Text(s) => layout_text_atom(s, size, color, window),
        MathNode::BigOp(s) => layout_text_atom(s, size * 1.45, color, window),
        MathNode::Group(children) => layout_seq(children, size, color, window),
        MathNode::Frac { num, den } => {
            let sub_size = (size * 0.84).max(10.0);
            let mut n = layout_seq(num, sub_size, color, window);
            let mut d = layout_seq(den, sub_size, color, window);
            let n_h = n.height();
            let d_h = d.height();
            let bar_w = n.width.max(d.width) + 6.0;
            let bar_h = 1.25;
            let gap = 2.5;
            let num_x = ((bar_w - n.width) / 2.0).round();
            let den_x = ((bar_w - d.width) / 2.0).round();
            let axis_y = n_h + gap;
            let den_y = axis_y + bar_h + gap;
            translate_prims(&mut n.prims, num_x, 0.0);
            translate_prims(&mut d.prims, den_x, den_y);
            let mut prims = n.prims;
            prims.push(Prim::Quad {
                rect: FlowRect::new(0.0, axis_y, bar_w, bar_h),
                fill: Some(color),
                border: None,
                radius: 0.0,
                dashed: false,
            });
            prims.append(&mut d.prims);
            let total_h = den_y + d_h;
            let math_axis_from_baseline = size * 0.30;
            let ascent = (axis_y + math_axis_from_baseline).max(n_h);
            let descent = (total_h - ascent).max(d_h * 0.5);
            MathBox {
                width: bar_w + 4.0,
                ascent,
                descent,
                prims,
            }
        }
        MathNode::Sqrt(body) => {
            let mut inner = layout_seq(body, size, color, window);
            let mut rad = layout_text_atom("\u{221A}", size * 1.1, color, window);
            let pad_top = 3.0;
            let rad_w = rad.width;
            let rad_dy = (inner.height() - rad.height()).max(0.0);
            let bar_y = 1.0;
            translate_prims(&mut rad.prims, 0.0, rad_dy);
            translate_prims(&mut inner.prims, rad_w + 1.0, pad_top);
            let mut prims = rad.prims;
            prims.push(Prim::Quad {
                rect: FlowRect::new(rad_w, bar_y, inner.width + 3.0, 1.2),
                fill: Some(color),
                border: None,
                radius: 0.0,
                dashed: false,
            });
            prims.append(&mut inner.prims);
            MathBox {
                width: rad_w + inner.width + 5.0,
                ascent: inner.ascent + pad_top,
                descent: inner.descent,
                prims,
            }
        }
        MathNode::Script { base, sup, sub } => {
            let mut b = layout_node(base, size, color, window);
            let script_size = (size * 0.70).max(9.0);
            let mut sup_box = sup
                .as_ref()
                .map(|s| layout_seq(s, script_size, color, window));
            let mut sub_box = sub
                .as_ref()
                .map(|s| layout_seq(s, script_size, color, window));
            let script_x = b.width + 1.0;
            let script_w = sup_box
                .as_ref()
                .map_or(0.0, |s| s.width)
                .max(sub_box.as_ref().map_or(0.0, |s| s.width));
            let sup_lift = (b.ascent * 0.52).round();
            let extra_top = sup_box
                .as_ref()
                .map_or(0.0, |s| (s.ascent + sup_lift - b.ascent).max(0.0));
            let sub_drop = (b.descent + script_size * 0.35).round();
            let extra_bottom = sub_box
                .as_ref()
                .map_or(0.0, |s| (sub_drop + s.descent - b.descent).max(0.0));
            translate_prims(&mut b.prims, 0.0, extra_top);
            let mut prims = b.prims;
            let baseline = extra_top + b.ascent;
            if let Some(mut s) = sup_box.take() {
                let sy = (baseline - sup_lift - s.ascent).max(0.0);
                translate_prims(&mut s.prims, script_x, sy);
                prims.append(&mut s.prims);
            }
            if let Some(mut s) = sub_box.take() {
                let sy = baseline + sub_drop - s.ascent;
                translate_prims(&mut s.prims, script_x, sy);
                prims.append(&mut s.prims);
            }
            MathBox {
                width: script_x + script_w + 2.0,
                ascent: b.ascent + extra_top,
                descent: b.descent + extra_bottom,
                prims,
            }
        }
    }
}

/// Lay out a LaTeX expression into 2D vector primitives (`(width, height, prims)`).
pub(super) fn layout_math_2d(
    latex: &str,
    font_size: f32,
    color: Hsla,
    window: &Window,
) -> (f32, f32, Vec<Prim>) {
    let nodes = Parser::new(latex).parse_seq(false, 0);
    let mbox = layout_seq(&nodes, font_size, color, window);
    (mbox.width, mbox.height(), mbox.prims)
}

fn to_superscript_char(ch: char) -> Option<char> {
    Some(match ch {
        '0' => '\u{2070}',
        '1' => '\u{00B9}',
        '2' => '\u{00B2}',
        '3' => '\u{00B3}',
        '4' => '\u{2074}',
        '5' => '\u{2075}',
        '6' => '\u{2076}',
        '7' => '\u{2077}',
        '8' => '\u{2078}',
        '9' => '\u{2079}',
        '+' => '\u{207A}',
        '-' | '\u{2212}' => '\u{207B}',
        '=' => '\u{207C}',
        '(' => '\u{207D}',
        ')' => '\u{207E}',
        'i' => '\u{2071}',
        'n' => '\u{207F}',
        _ => return None,
    })
}

fn to_subscript_char(ch: char) -> Option<char> {
    Some(match ch {
        '0' => '\u{2080}',
        '1' => '\u{2081}',
        '2' => '\u{2082}',
        '3' => '\u{2083}',
        '4' => '\u{2084}',
        '5' => '\u{2085}',
        '6' => '\u{2086}',
        '7' => '\u{2087}',
        '8' => '\u{2088}',
        '9' => '\u{2089}',
        '+' => '\u{208A}',
        '-' | '\u{2212}' => '\u{208B}',
        '=' => '\u{208C}',
        '(' => '\u{208D}',
        ')' => '\u{208E}',
        'i' => '\u{1D62}',
        'n' => '\u{2099}',
        'x' => '\u{2093}',
        _ => return None,
    })
}

fn format_nodes_inline(nodes: &[MathNode], out: &mut String) {
    for node in nodes {
        match node {
            MathNode::Text(s) | MathNode::BigOp(s) => out.push_str(s),
            MathNode::Group(g) => format_nodes_inline(g, out),
            MathNode::Frac { num, den } => {
                out.push('(');
                format_nodes_inline(num, out);
                out.push('/');
                format_nodes_inline(den, out);
                out.push(')');
            }
            MathNode::Sqrt(body) => {
                out.push('\u{221A}');
                out.push('(');
                format_nodes_inline(body, out);
                out.push(')');
            }
            MathNode::Script { base, sup, sub } => {
                format_nodes_inline(std::slice::from_ref(base.as_ref()), out);
                if let Some(s) = sub {
                    let mut tmp = String::new();
                    format_nodes_inline(s, &mut tmp);
                    if tmp.chars().all(|c| to_subscript_char(c).is_some()) {
                        for c in tmp.chars() {
                            out.push(to_subscript_char(c).unwrap());
                        }
                    } else {
                        out.push('_');
                        out.push_str(&tmp);
                    }
                }
                if let Some(s) = sup {
                    let mut tmp = String::new();
                    format_nodes_inline(s, &mut tmp);
                    if tmp.chars().all(|c| to_superscript_char(c).is_some()) {
                        for c in tmp.chars() {
                            out.push(to_superscript_char(c).unwrap());
                        }
                    } else {
                        out.push('^');
                        out.push_str(&tmp);
                    }
                }
            }
        }
    }
}

/// Format an inline LaTeX expression into Unicode math symbols and scripts when
/// no external `MathPreviewProvider` rasterizer is mounted.
pub fn format_inline_math_unicode(latex: &str) -> String {
    let nodes = Parser::new(latex).parse_seq(false, 0);
    let mut out = String::new();
    format_nodes_inline(&nodes, &mut out);
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::{MathNode, Parser, format_inline_math_unicode};

    fn ast_depth(nodes: &[MathNode]) -> usize {
        nodes
            .iter()
            .map(|n| match n {
                MathNode::Text(_) | MathNode::BigOp(_) => 1,
                MathNode::Group(inner) | MathNode::Sqrt(inner) => 1 + ast_depth(inner),
                MathNode::Frac { num, den } => 1 + ast_depth(num).max(ast_depth(den)),
                MathNode::Script { base, sup, sub } => {
                    let b = ast_depth(std::slice::from_ref(base.as_ref()));
                    let s1 = sup.as_deref().map(ast_depth).unwrap_or(0);
                    let s2 = sub.as_deref().map(ast_depth).unwrap_or(0);
                    1 + b.max(s1).max(s2)
                }
            })
            .max()
            .unwrap_or(0)
    }

    #[test]
    fn math_parser_handles_deep_nesting_on_1mib_stack_and_common_commands() {
        assert_eq!(
            format_inline_math_unicode(r"\mathbb{R}^n"),
            "\u{211D}\u{207F}"
        );
        let matrix = format_inline_math_unicode(r"\begin{matrix} a & b \\ c & d \end{matrix}");
        assert!(
            !matrix.contains("beginmatrix"),
            "unexpected matrix output: {matrix}"
        );
        assert!(matrix.contains("; "));

        // Braced and unbraced command chains must never overflow a 1 MiB stack
        // and must produce strictly bounded AST depth (<= 66).
        let handle = std::thread::Builder::new()
            .stack_size(1024 * 1024)
            .spawn(|| {
                let cases = [
                    format!("{}x{}", "{".repeat(128_000), "}".repeat(128_000)),
                    format!("{}x", r"\sqrt".repeat(64_000)),
                    format!("{}2", r"\frac 1 ".repeat(32_000)),
                    r"\text a ".repeat(64_000),
                ];
                for src in &cases {
                    let nodes = Parser::new(src).parse_seq(false, 0);
                    let depth = ast_depth(&nodes);
                    assert!(depth <= 66, "AST depth exceeded bound: {depth}");
                    let out = format_inline_math_unicode(src);
                    assert!(!out.is_empty());
                }
            })
            .expect("spawn 1MiB thread");
        handle
            .join()
            .expect("deep nesting must not overflow 1 MiB stack");
    }
}
