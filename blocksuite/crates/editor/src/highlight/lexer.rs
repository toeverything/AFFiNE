use super::{HighlightSpan, HighlightedLine, LanguageId, TokenKind, language_spec};

/// Cross-line lexer state propagated from the end of one line to the start of the next.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum LineState {
    #[default]
    Normal,
    BlockComment {
        depth: u8,
    },
    MultiLineString {
        quote: u8,
        triple: bool,
    },
    HtmlComment,
}

fn push_span(spans: &mut Vec<HighlightSpan>, start: usize, end: usize, kind: TokenKind) {
    if start >= end {
        return;
    }
    if let Some(last) = spans.last_mut()
        && last.kind == kind
        && last.bytes.end == start
    {
        last.bytes.end = end;
        return;
    }
    spans.push(HighlightSpan {
        bytes: start..end,
        kind,
    });
}

/// Lex a single line in linear time with zero regex backtracking.
pub fn lex_line(lang: LanguageId, line: &str, mut state: LineState) -> HighlightedLine {
    if line.is_empty() {
        return HighlightedLine {
            spans: Vec::new(),
            end_state: state,
        };
    }
    match lang {
        LanguageId::Plain => HighlightedLine {
            spans: vec![HighlightSpan {
                bytes: 0..line.len(),
                kind: TokenKind::Plain,
            }],
            end_state: LineState::Normal,
        },
        LanguageId::Diff => lex_diff_line(line),
        LanguageId::Latex => lex_latex_line(line),
        LanguageId::Html => lex_html_line(line, state),
        LanguageId::Markdown => lex_markdown_line(line),
        _ => {
            let spec = language_spec(lang);
            let bytes = line.as_bytes();
            let mut spans = Vec::new();
            let mut i = 0;

            while i < bytes.len() {
                match state {
                    LineState::BlockComment { mut depth } => {
                        let start = i;
                        let (open, close) = spec.block_comment.unwrap_or(("/*", "*/"));
                        while i < bytes.len() {
                            if spec.nested_block_comments && line[i..].starts_with(open) {
                                depth = depth.saturating_add(1);
                                i += open.len();
                            } else if line[i..].starts_with(close) {
                                i += close.len();
                                depth = depth.saturating_sub(1);
                                if depth == 0 {
                                    state = LineState::Normal;
                                    break;
                                }
                            } else {
                                i += next_char_len(line, i);
                            }
                        }
                        if depth > 0 {
                            state = LineState::BlockComment { depth };
                        }
                        push_span(&mut spans, start, i, TokenKind::Comment);
                    }
                    LineState::MultiLineString { quote, triple } => {
                        let start = i;
                        while i < bytes.len() {
                            if bytes[i] == b'\\' && i + 1 < bytes.len() {
                                i += 1 + next_char_len(line, i + 1);
                                continue;
                            }
                            if triple {
                                if i + 2 < bytes.len()
                                    && bytes[i] == quote
                                    && bytes[i + 1] == quote
                                    && bytes[i + 2] == quote
                                {
                                    i += 3;
                                    state = LineState::Normal;
                                    break;
                                }
                            } else if bytes[i] == quote {
                                i += 1;
                                state = LineState::Normal;
                                break;
                            }
                            i += next_char_len(line, i);
                        }
                        push_span(&mut spans, start, i, TokenKind::String);
                    }
                    LineState::HtmlComment => {
                        state = LineState::Normal;
                    }
                    LineState::Normal => {
                        if let Some(prefix) = spec.line_comment
                            && line[i..].starts_with(prefix)
                        {
                            push_span(&mut spans, i, bytes.len(), TokenKind::Comment);
                            i = bytes.len();
                            continue;
                        }
                        if spec.hash_comment && bytes[i] == b'#' {
                            push_span(&mut spans, i, bytes.len(), TokenKind::Comment);
                            i = bytes.len();
                            continue;
                        }
                        if let Some((open, _)) = spec.block_comment
                            && line[i..].starts_with(open)
                        {
                            let start = i;
                            i += open.len();
                            state = LineState::BlockComment { depth: 1 };
                            push_span(&mut spans, start, i, TokenKind::Comment);
                            continue;
                        }
                        // Triple-quoted strings (Python/Kotlin/Swift/TOML/GraphQL)
                        if spec.triple_quotes
                            && matches!(bytes[i], b'"' | b'\'')
                            && i + 2 < bytes.len()
                            && bytes[i + 1] == bytes[i]
                            && bytes[i + 2] == bytes[i]
                        {
                            let quote = bytes[i];
                            let start = i;
                            i += 3;
                            state = LineState::MultiLineString {
                                quote,
                                triple: true,
                            };
                            push_span(&mut spans, start, i, TokenKind::String);
                            continue;
                        }
                        // Backtick template / raw strings
                        if spec.backtick_strings && bytes[i] == b'`' {
                            let start = i;
                            i += 1;
                            state = LineState::MultiLineString {
                                quote: b'`',
                                triple: false,
                            };
                            push_span(&mut spans, start, i, TokenKind::String);
                            continue;
                        }
                        // Rust raw strings: r"...", r#"..."#, br#"..."#
                        if matches!(lang, LanguageId::Rust)
                            && let Some(end) = scan_rust_raw_string(bytes, i)
                        {
                            push_span(&mut spans, i, end, TokenKind::String);
                            i = end;
                            continue;
                        }
                        // Single-line double or single quoted strings
                        if bytes[i] == b'"'
                            || (bytes[i] == b'\'' && !matches!(lang, LanguageId::Rust))
                        {
                            let quote = bytes[i];
                            let start = i;
                            i += 1;
                            while i < bytes.len() {
                                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                                    i += 1 + next_char_len(line, i + 1);
                                    continue;
                                }
                                if bytes[i] == quote {
                                    i += 1;
                                    break;
                                }
                                i += next_char_len(line, i);
                            }
                            let is_json_key = matches!(lang, LanguageId::Json)
                                && line[i..].trim_start().starts_with(':');
                            let kind = if is_json_key {
                                TokenKind::Property
                            } else {
                                TokenKind::String
                            };
                            push_span(&mut spans, start, i, kind);
                            continue;
                        }
                        // Rust char literals ('a', '\n') vs lifetimes ('static)
                        if matches!(lang, LanguageId::Rust) && bytes[i] == b'\'' {
                            let start = i;
                            if let Some(end) = scan_rust_char(line, i) {
                                i = end;
                                push_span(&mut spans, start, i, TokenKind::String);
                                continue;
                            }
                            i += 1;
                            while i < bytes.len() && is_ident_continue(bytes[i]) {
                                i += 1;
                            }
                            push_span(&mut spans, start, i, TokenKind::Type);
                            continue;
                        }
                        // Rust attributes (#[...]) / C preprocessor (#include)
                        if bytes[i] == b'#'
                            && matches!(lang, LanguageId::Rust | LanguageId::C | LanguageId::Cpp)
                        {
                            let start = i;
                            i += 1;
                            while i < bytes.len()
                                && (is_ident_continue(bytes[i]) || bytes[i] == b'!')
                            {
                                i += 1;
                            }
                            push_span(&mut spans, start, i, TokenKind::Macro);
                            continue;
                        }
                        // Numbers (hex, bin, oct, decimal, float, scientific)
                        if bytes[i].is_ascii_digit() {
                            let start = i;
                            i = scan_number(bytes, i);
                            push_span(&mut spans, start, i, TokenKind::Number);
                            continue;
                        }
                        // Identifiers, keywords, types, macros, functions, properties
                        if is_ident_start(bytes[i])
                            || (bytes[i] == b'@' && matches!(lang, LanguageId::Css))
                        {
                            let start = i;
                            i += 1;
                            while i < bytes.len()
                                && (is_ident_continue(bytes[i])
                                    || (bytes[i] == b'-'
                                        && matches!(
                                            lang,
                                            LanguageId::Css | LanguageId::Yaml | LanguageId::Toml
                                        )))
                            {
                                i += 1;
                            }
                            let word = &line[start..i];
                            let kind = if matches!(lang, LanguageId::Rust)
                                && i < bytes.len()
                                && bytes[i] == b'!'
                            {
                                i += 1;
                                TokenKind::Macro
                            } else if spec.keywords.contains(&word) {
                                TokenKind::Keyword
                            } else if spec.constants.contains(&word) {
                                TokenKind::Constant
                            } else if spec.types.contains(&word) {
                                TokenKind::Type
                            } else if matches!(lang, LanguageId::Yaml | LanguageId::Toml)
                                && line[i..].trim_start().starts_with([':', '='])
                            {
                                TokenKind::Property
                            } else if bytes.get(i) == Some(&b'(') {
                                TokenKind::Function
                            } else if word.as_bytes()[0].is_ascii_uppercase()
                                && word.bytes().any(|b| b.is_ascii_lowercase())
                            {
                                TokenKind::Type
                            } else {
                                TokenKind::Plain
                            };
                            push_span(&mut spans, start, i, kind);
                            continue;
                        }
                        // Operators & punctuation
                        let start = i;
                        let b = bytes[i];
                        if b.is_ascii_whitespace() {
                            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                                i += 1;
                            }
                            push_span(&mut spans, start, i, TokenKind::Plain);
                        } else if matches!(
                            b,
                            b'+' | b'-'
                                | b'*'
                                | b'/'
                                | b'%'
                                | b'='
                                | b'!'
                                | b'<'
                                | b'>'
                                | b'&'
                                | b'|'
                                | b'^'
                                | b'~'
                                | b'?'
                        ) {
                            i += 1;
                            push_span(&mut spans, start, i, TokenKind::Operator);
                        } else if matches!(
                            b,
                            b'(' | b')' | b'{' | b'}' | b'[' | b']' | b';' | b',' | b'.' | b':'
                        ) {
                            i += 1;
                            push_span(&mut spans, start, i, TokenKind::Punctuation);
                        } else {
                            i += next_char_len(line, i);
                            push_span(&mut spans, start, i, TokenKind::Plain);
                        }
                    }
                }
            }

            HighlightedLine {
                spans,
                end_state: state,
            }
        }
    }
}

fn lex_diff_line(line: &str) -> HighlightedLine {
    let kind = if line.starts_with("+++") || line.starts_with("---") || line.starts_with("@@") {
        TokenKind::Keyword
    } else if line.starts_with('+') {
        TokenKind::DiffAdded
    } else if line.starts_with('-') {
        TokenKind::DiffRemoved
    } else {
        TokenKind::Plain
    };
    HighlightedLine {
        spans: vec![HighlightSpan {
            bytes: 0..line.len(),
            kind,
        }],
        end_state: LineState::Normal,
    }
}

fn lex_latex_line(line: &str) -> HighlightedLine {
    let bytes = line.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let start = i;
        match bytes[i] {
            b'%' => {
                push_span(&mut spans, i, bytes.len(), TokenKind::Comment);
                break;
            }
            b'\\' => {
                i += 1;
                if i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                    while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                } else if i < bytes.len() {
                    i += next_char_len(line, i);
                }
                push_span(&mut spans, start, i, TokenKind::Macro);
            }
            b'{' | b'}' | b'[' | b']' | b'(' | b')' => {
                i += 1;
                push_span(&mut spans, start, i, TokenKind::Punctuation);
            }
            b'^' | b'_' | b'+' | b'-' | b'=' | b'<' | b'>' | b'&' | b'$' => {
                i += 1;
                push_span(&mut spans, start, i, TokenKind::Operator);
            }
            b if b.is_ascii_digit() => {
                i = scan_number(bytes, i);
                push_span(&mut spans, start, i, TokenKind::Number);
            }
            _ => {
                i += next_char_len(line, i);
                push_span(&mut spans, start, i, TokenKind::Plain);
            }
        }
    }
    HighlightedLine {
        spans,
        end_state: LineState::Normal,
    }
}

fn lex_html_line(line: &str, mut state: LineState) -> HighlightedLine {
    let bytes = line.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if state == LineState::HtmlComment {
            let start = i;
            if let Some(pos) = line[i..].find("-->") {
                i += pos + 3;
                state = LineState::Normal;
            } else {
                i = bytes.len();
            }
            push_span(&mut spans, start, i, TokenKind::Comment);
            continue;
        }
        if line[i..].starts_with("<!--") {
            let start = i;
            i += 4;
            state = LineState::HtmlComment;
            push_span(&mut spans, start, i, TokenKind::Comment);
            continue;
        }
        if bytes[i] == b'<' {
            let start = i;
            i += 1;
            if i < bytes.len() && matches!(bytes[i], b'/' | b'!') {
                i += 1;
            }
            while i < bytes.len() && (is_ident_continue(bytes[i]) || bytes[i] == b'-') {
                i += 1;
            }
            push_span(&mut spans, start, i, TokenKind::Tag);
            while i < bytes.len() && bytes[i] != b'>' {
                let s = i;
                if matches!(bytes[i], b'"' | b'\'') {
                    let q = bytes[i];
                    i += 1;
                    while i < bytes.len() && bytes[i] != q {
                        i += next_char_len(line, i);
                    }
                    if i < bytes.len() {
                        i += 1;
                    }
                    push_span(&mut spans, s, i, TokenKind::String);
                } else if is_ident_start(bytes[i]) {
                    while i < bytes.len() && (is_ident_continue(bytes[i]) || bytes[i] == b'-') {
                        i += 1;
                    }
                    push_span(&mut spans, s, i, TokenKind::Property);
                } else {
                    i += next_char_len(line, i);
                    push_span(&mut spans, s, i, TokenKind::Punctuation);
                }
            }
            if i < bytes.len() && bytes[i] == b'>' {
                push_span(&mut spans, i, i + 1, TokenKind::Tag);
                i += 1;
            }
            continue;
        }
        let start = i;
        while i < bytes.len() && bytes[i] != b'<' {
            i += next_char_len(line, i);
        }
        push_span(&mut spans, start, i, TokenKind::Plain);
    }
    HighlightedLine {
        spans,
        end_state: state,
    }
}

fn lex_markdown_line(line: &str) -> HighlightedLine {
    let trimmed = line.trim_start();
    let kind = if trimmed.starts_with('#') {
        TokenKind::Keyword
    } else if trimmed.starts_with("```") {
        TokenKind::Macro
    } else if trimmed.starts_with('>') {
        TokenKind::Comment
    } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
        TokenKind::Property
    } else {
        TokenKind::Plain
    };
    HighlightedLine {
        spans: vec![HighlightSpan {
            bytes: 0..line.len(),
            kind,
        }],
        end_state: LineState::Normal,
    }
}

fn is_ident_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_'
}

fn is_ident_continue(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn scan_rust_raw_string(bytes: &[u8], i: usize) -> Option<usize> {
    let mut j = i;
    if bytes.get(j) == Some(&b'b') {
        j += 1;
    }
    if bytes.get(j) != Some(&b'r') {
        return None;
    }
    j += 1;
    let mut hashes = 0usize;
    while bytes.get(j) == Some(&b'#') {
        hashes += 1;
        j += 1;
    }
    if bytes.get(j) != Some(&b'"') {
        return None;
    }
    j += 1;
    while j < bytes.len() {
        if bytes[j] == b'"' {
            let mut k = j + 1;
            let mut matched = 0usize;
            while matched < hashes && bytes.get(k) == Some(&b'#') {
                matched += 1;
                k += 1;
            }
            if matched == hashes {
                return Some(k);
            }
        }
        j += 1;
    }
    Some(bytes.len())
}

fn scan_rust_char(line: &str, start: usize) -> Option<usize> {
    let bytes = line.as_bytes();
    let mut i = start + 1;
    if i >= bytes.len() {
        return None;
    }
    if bytes[i] == b'\\' {
        i += 1;
        if i >= bytes.len() {
            return None;
        }
        i += next_char_len(line, i);
    } else {
        i += next_char_len(line, i);
    }
    (bytes.get(i) == Some(&b'\'')).then_some(i + 1)
}

fn scan_number(bytes: &[u8], mut i: usize) -> usize {
    if bytes[i] == b'0'
        && matches!(
            bytes.get(i + 1),
            Some(b'x' | b'X' | b'b' | b'B' | b'o' | b'O')
        )
    {
        i += 2;
        while i < bytes.len() && (bytes[i].is_ascii_hexdigit() || bytes[i] == b'_') {
            i += 1;
        }
        return i;
    }
    while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'_') {
        i += 1;
    }
    if bytes.get(i) == Some(&b'.') && bytes.get(i + 1).is_some_and(u8::is_ascii_digit) {
        i += 1;
        while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'_') {
            i += 1;
        }
    }
    if matches!(bytes.get(i), Some(b'e' | b'E')) {
        i += 1;
        if matches!(bytes.get(i), Some(b'+' | b'-')) {
            i += 1;
        }
        while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'_') {
            i += 1;
        }
    }
    while i < bytes.len() && bytes[i].is_ascii_alphanumeric() {
        i += 1;
    }
    i
}

fn next_char_len(s: &str, byte_idx: usize) -> usize {
    s[byte_idx..].chars().next().map_or(1, char::len_utf8)
}
