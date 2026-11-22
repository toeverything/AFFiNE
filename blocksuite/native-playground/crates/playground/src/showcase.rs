use std::sync::Arc;

use blocksuite_playground_doc::{
    DocResult,
    awareness::{AwarenessPayload, RoomAwareness, TextRangePoint, TextSelectionState},
    client_id_from_seed,
    schema::{BlockSpec, ListType, ParagraphType},
    session::PageDocSession,
};
use y_octo::{AHashMap, Any, SessionValue, TextAttributes};

use crate::{
    HOME_PAGE_ID, SHOWCASE_IMAGE_ID, SHOWCASE_PEER_NAME, SHOWCASE_ROOM, room_client::DocState,
};

pub(crate) struct ShowcaseSeed<'a> {
    pub(crate) page: &'a mut PageDocSession,
    pub(crate) now_ms: u64,
}

impl ShowcaseSeed<'_> {
    fn surface_diagram(&mut self) -> DocResult {
        use blocksuite_playground_doc::schema::{
            ConnectorEndpointSpec, SurfaceElementSpec as Element,
        };
        const SURFACE: &str = "showcase-surface";
        let shapes = ["collect", "review"];
        let elements = [
            (
                "workflow",
                Element::Group {
                    seed: 11,
                    title: "Research workflow".into(),
                    children: ["collect", "review", "handoff", "annotation", "highlight"]
                        .map(str::to_owned)
                        .into(),
                },
            ),
            (
                shapes[0],
                Element::Shape {
                    shape_type: "rect".into(),
                    xywh: "[818,522,150,82]".into(),
                    filled: true,
                    seed: 31,
                    text: Some("Collect".into()),
                },
            ),
            (
                shapes[1],
                Element::Shape {
                    shape_type: "rect".into(),
                    xywh: "[988,722,156,74]".into(),
                    filled: true,
                    seed: 37,
                    text: Some("Review".into()),
                },
            ),
            (
                "handoff",
                Element::Connector {
                    mode: 1,
                    seed: 41,
                    source: ConnectorEndpointSpec::element(shapes[0], Some([1., 0.5])),
                    target: ConnectorEndpointSpec::element(shapes[1], Some([0.5, 0.])),
                    text: Some("Synthesize".into()),
                    label_xywh: None,
                },
            ),
            (
                "annotation",
                Element::Brush {
                    seed: 43,
                    xywh: "[832,850,242,48]".into(),
                    points: vec![
                        vec![0., 36., 0.1],
                        vec![30., 31., 0.6],
                        vec![66., 7., 0.9],
                        vec![78., 2., 0.5],
                        vec![70., 32., 0.8],
                        vec![95., 22., 0.6],
                        vec![110., 26., 0.4],
                        vec![140., 14., 0.7],
                        vec![180., 12., 0.4],
                        vec![242., 4., 0.1],
                    ],
                },
            ),
            (
                "highlight",
                Element::Highlighter {
                    seed: 47,
                    xywh: "[842,903,198,16]".into(),
                    points: vec![vec![0., 10.], vec![50., 7.], vec![110., 6.], vec![198., 0.]],
                },
            ),
        ];
        for (i, (id, element)) in elements.into_iter().enumerate() {
            let now = self.tick();
            self.page
                .add_surface_element(SURFACE, id, &format!("a{}", i + 1), element, now)?;
        }
        let color = |light: &str, dark: &str| {
            Any::Object(Box::new(
                [
                    ("light".into(), Any::String(light.into())),
                    ("dark".into(), Any::String(dark.into())),
                ]
                .into_iter()
                .collect(),
            ))
        };
        for (id, key, value) in [
            ("collect", "shapeStyle", Any::String("Scribbled".into())),
            ("collect", "fillColor", color("#8bc9be", "#396c65")),
            ("collect", "strokeColor", color("#28665e", "#95ded0")),
            ("collect", "color", color("#133e38", "#ecfffb")),
            ("review", "rotate", Any::Integer(-14)),
            ("review", "radius", Any::Float64(0.1_f64.into())),
            ("review", "fillColor", color("#e5e9ff", "#383c6c")),
            ("review", "strokeColor", color("#636fa7", "#aab4ff")),
            ("review", "color", color("#303b65", "#f4f4ff")),
            ("annotation", "lineWidth", Any::Integer(9)),
            ("annotation", "color", color("#3e6965", "#8bcfc4")),
            ("highlight", "color", color("#46b9a855", "#83d7bd77")),
        ] {
            let now = self.tick();
            self.page
                .set_surface_element_field(SURFACE, id, key, SessionValue::Any(value), now)?;
        }
        Ok(())
    }

    pub(crate) fn tick(&mut self) -> u64 {
        self.now_ms += 600;
        self.now_ms
    }

    pub(crate) fn add(&mut self, id: &str, spec: BlockSpec, parent: Option<&str>) -> DocResult {
        let now_ms = self.tick();
        self.page.add_block(id, spec, parent, None, now_ms)?;
        Ok(())
    }

    pub(crate) fn paragraph(
        &mut self,
        id: &str,
        kind: ParagraphType,
        text: &str,
        parent: &str,
    ) -> DocResult {
        self.add(
            id,
            BlockSpec::Paragraph {
                paragraph_type: kind,
                text: text.to_string(),
            },
            Some(parent),
        )
    }

    pub(crate) fn list(
        &mut self,
        id: &str,
        kind: ListType,
        text: &str,
        checked: bool,
        parent: &str,
    ) -> DocResult {
        self.add(
            id,
            BlockSpec::List {
                list_type: kind,
                text: text.to_string(),
                checked,
                order: None,
            },
            Some(parent),
        )
    }

    /// A numbered item with its explicit `prop:order`, as the JavaScript editor stores it.
    pub(crate) fn numbered(&mut self, id: &str, text: &str, order: i32, parent: &str) -> DocResult {
        self.add(
            id,
            BlockSpec::List {
                list_type: ListType::Numbered,
                text: text.to_string(),
                checked: false,
                order: Some(order),
            },
            Some(parent),
        )
    }

    /// Apply an inline attribute to the first occurrence of `needle` in the block's text.
    pub(crate) fn mark(
        &mut self,
        id: &str,
        text: &str,
        needle: &str,
        key: &str,
        value: Any,
    ) -> DocResult {
        let Some(start) = text.find(needle) else {
            return Ok(());
        };
        let index = text[..start].encode_utf16().count() as u64;
        let len = needle.encode_utf16().count() as u64;
        let mut attrs = TextAttributes::new();
        attrs.insert(key.to_string(), value);
        let now_ms = self.tick();
        self.page
            .format_text(id, "prop:text", index, len, attrs, now_ms)?;
        Ok(())
    }
}

/// The showcase image: a 64 × 40 diagonal gradient PNG, byte-identical on every target.
pub(crate) fn showcase_gradient_png() -> Vec<u8> {
    const WIDTH: u32 = 64;
    const HEIGHT: u32 = 40;
    const FROM: [u32; 3] = [30, 150, 235];
    const TO: [u32; 3] = [123, 97, 255];
    let span = 2 * (WIDTH - 1) * (HEIGHT - 1);
    let mut rgba = Vec::with_capacity((WIDTH * HEIGHT * 4) as usize);
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            let t = x * (HEIGHT - 1) + y * (WIDTH - 1);
            for channel in 0..3 {
                rgba.push(((FROM[channel] * (span - t) + TO[channel] * t) / span) as u8);
            }
            rgba.push(255);
        }
    }
    encode_png_rgba(WIDTH, HEIGHT, &rgba)
}

/// Encode 8-bit RGBA pixels as a PNG whose image data sits in stored (uncompressed)
/// deflate blocks: small, dependency-free, and the same bytes everywhere.
fn encode_png_rgba(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = u32::MAX;
        for &byte in bytes {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = (crc >> 1) ^ (0xEDB8_8320 & 0_u32.wrapping_sub(crc & 1));
            }
        }
        !crc
    }
    fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        let start = out.len();
        out.extend_from_slice(kind);
        out.extend_from_slice(data);
        let crc = crc32(&out[start..]);
        out.extend_from_slice(&crc.to_be_bytes());
    }

    // Scanlines: a zero filter byte followed by the row's pixels.
    let stride = width as usize * 4;
    let mut raw = Vec::with_capacity((stride + 1) * height as usize);
    for row in rgba.chunks_exact(stride).take(height as usize) {
        raw.push(0);
        raw.extend_from_slice(row);
    }

    let mut zlib = vec![0x78, 0x01];
    let mut blocks = raw.chunks(0xFFFF).peekable();
    while let Some(block) = blocks.next() {
        let len = block.len() as u16;
        zlib.push(u8::from(blocks.peek().is_none()));
        zlib.extend_from_slice(&len.to_le_bytes());
        zlib.extend_from_slice(&(!len).to_le_bytes());
        zlib.extend_from_slice(block);
    }
    let (mut a, mut b) = (1_u32, 0_u32);
    for &byte in &raw {
        a = (a + u32::from(byte)) % 65_521;
        b = (b + a) % 65_521;
    }
    zlib.extend_from_slice(&((b << 16) | a).to_be_bytes());

    let mut png = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'];
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    // 8 bits per channel, RGBA, deflate, adaptive filtering, no interlace.
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    chunk(&mut png, b"IHDR", &header);
    chunk(&mut png, b"IDAT", &zlib);
    chunk(&mut png, b"IEND", &[]);
    png
}

/// Build the deterministic showcase workspace: one page exercising every Page-mode block,
/// its image blob, and one remote collaborator with a text selection.
pub fn seed_showcase_doc() -> DocResult<DocState> {
    const CREATED: i64 = 1_700_000_000_000;
    const REFERENCED_PAGE: &str = "doc:edgeless-notes";
    const INTRO: &str = "This page is a y-octo document laid out by the native BlockFlow \
        renderer. Inline marks keep their styles: bold, italic, inline code, links, and page \
        references such as .";
    const INTRO_TAIL: &str =
        " Remote carets and selections are drawn in each collaborator's color.";

    let mut state = DocState::new(SHOWCASE_ROOM, client_id_from_seed(0x4d32))?;
    state.workspace.initialize_meta()?;
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Native BlockSuite Playground", CREATED)?;
    state
        .workspace
        .create_page(REFERENCED_PAGE, "Edgeless notes", CREATED + 1)?;

    let page = state.workspace.ensure_page(HOME_PAGE_ID)?;
    let mut seed = ShowcaseSeed {
        page,
        now_ms: 1_000,
    };
    seed.add(
        "showcase-page",
        BlockSpec::Page {
            title: "Native BlockSuite Playground".to_string(),
        },
        None,
    )?;
    seed.add(
        "showcase-surface",
        BlockSpec::Surface,
        Some("showcase-page"),
    )?;
    seed.add(
        "showcase-frame",
        BlockSpec::Frame {
            title: "Workspace Overview".to_string(),
            xywh: Some("[-40,-60,1240,1320]".to_string()),
            presentation_index: Some("a0".to_string()),
        },
        Some("showcase-surface"),
    )?;
    seed.add(
        "showcase-note",
        BlockSpec::Note {
            xywh: Some("[0,0,760,1180]".to_string()),
        },
        Some("showcase-page"),
    )?;
    let note = "showcase-note";

    seed.paragraph("showcase-h1", ParagraphType::H1, "Page mode", note)?;
    seed.paragraph("showcase-intro", ParagraphType::Text, INTRO, note)?;
    seed.mark("showcase-intro", INTRO, "bold", "bold", Any::True)?;
    seed.mark("showcase-intro", INTRO, "italic", "italic", Any::True)?;
    seed.mark("showcase-intro", INTRO, "inline code", "code", Any::True)?;
    seed.mark(
        "showcase-intro",
        INTRO,
        "links",
        "link",
        Any::String("https://affine.pro".to_string()),
    )?;
    // A linked-page reference is a single placeholder character carrying the page id.
    let reference_index = INTRO.encode_utf16().count() as u64 - 1;
    let now_ms = seed.tick();
    seed.page
        .insert_text("showcase-intro", "prop:text", reference_index, " ", now_ms)?;
    let mut reference = AHashMap::default();
    reference.insert("type".to_string(), Any::String("LinkedPage".to_string()));
    reference.insert(
        "pageId".to_string(),
        Any::String(REFERENCED_PAGE.to_string()),
    );
    let mut attrs = TextAttributes::new();
    attrs.insert("reference".to_string(), Any::Object(Box::new(reference)));
    let now_ms = seed.tick();
    seed.page.format_text(
        "showcase-intro",
        "prop:text",
        reference_index,
        1,
        attrs,
        now_ms,
    )?;
    let now_ms = seed.tick();
    seed.page.insert_text(
        "showcase-intro",
        "prop:text",
        reference_index + 2,
        INTRO_TAIL,
        now_ms,
    )?;

    seed.paragraph("showcase-h2", ParagraphType::H2, "Blocks", note)?;
    seed.paragraph(
        "showcase-quote",
        ParagraphType::Quote,
        "Every block below comes from the same document the JavaScript editor edits.",
        note,
    )?;

    seed.list(
        "showcase-bullet",
        ListType::Bulleted,
        "Bulleted list item",
        false,
        note,
    )?;
    seed.list(
        "showcase-bullet-nested",
        ListType::Bulleted,
        "Nested item",
        false,
        "showcase-bullet",
    )?;
    seed.list(
        "showcase-bullet-deep",
        ListType::Bulleted,
        "Third level",
        false,
        "showcase-bullet-nested",
    )?;
    seed.numbered("showcase-numbered-1", "First step", 1, note)?;
    seed.numbered("showcase-numbered-2", "Second step", 2, note)?;
    seed.numbered(
        "showcase-numbered-nested",
        "Sub-step",
        1,
        "showcase-numbered-2",
    )?;
    seed.list(
        "showcase-todo-open",
        ListType::Todo,
        "Render remote selections",
        false,
        note,
    )?;
    seed.list(
        "showcase-todo-done",
        ListType::Todo,
        "Read the block tree",
        true,
        note,
    )?;
    seed.list(
        "showcase-toggle-open",
        ListType::Toggle,
        "Toggle with details",
        false,
        note,
    )?;
    seed.paragraph(
        "showcase-toggle-open-child",
        ParagraphType::Text,
        "Children stay visible while the toggle is open.",
        "showcase-toggle-open",
    )?;
    seed.list(
        "showcase-toggle-closed",
        ListType::Toggle,
        "Collapsed toggle",
        false,
        note,
    )?;
    seed.paragraph(
        "showcase-toggle-closed-child",
        ParagraphType::Text,
        "Hidden until expanded.",
        "showcase-toggle-closed",
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-toggle-closed",
        "prop:collapsed",
        SessionValue::Any(Any::True),
        now_ms,
    )?;

    seed.add("showcase-divider", BlockSpec::Divider, Some(note))?;
    seed.add(
        "showcase-code",
        BlockSpec::Code {
            text: "fn main() {\n    println!(\"hello, blocks\");\n}".to_string(),
            language: Some("rust".to_string()),
            caption: String::new(),
        },
        Some(note),
    )?;
    // Wrapped, so narrow windows show every character instead of clipping the long line.
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-code",
        "prop:wrap",
        SessionValue::Any(Any::True),
        now_ms,
    )?;
    seed.add(
        "showcase-bookmark",
        BlockSpec::Bookmark {
            url: "https://affine.pro/".to_string(),
            title: Some("AFFiNE".to_string()),
            description: Some(
                "Open-source workspace for docs, whiteboards and databases.".to_string(),
            ),
        },
        Some(note),
    )?;
    seed.add(
        "showcase-image",
        BlockSpec::Image {
            source_id: SHOWCASE_IMAGE_ID.to_string(),
            caption: "A 64 \u{00d7} 40 gradient decoded from the blob store".to_string(),
            width: 320.0,
            height: 200.0,
            xywh: None,
        },
        Some(note),
    )?;
    let now_ms = seed.tick();
    seed.page.add_raw_block(
        "showcase-database",
        "affine:database",
        3,
        vec![
            (
                "prop:title".to_string(),
                SessionValue::Text(vec![y_octo::TextDeltaOp::Insert {
                    insert: y_octo::TextInsert::Text("Tasks".to_string()),
                    format: None,
                }]),
            ),
            ("prop:views".to_string(), SessionValue::Array(Vec::new())),
            ("prop:columns".to_string(), SessionValue::Array(Vec::new())),
            ("prop:cells".to_string(), SessionValue::Map(Vec::new())),
        ],
        Some(note),
        None,
        now_ms,
    )?;

    // Edgeless-only spatial blocks (excluded from Page mode by `is_edgeless_only`).
    seed.add(
        "showcase-edgeless-note",
        BlockSpec::Note {
            xywh: Some("[820,40,340,260]".to_string()),
        },
        Some("showcase-page"),
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-edgeless-note",
        "prop:displayMode",
        SessionValue::Any(Any::String("edgeless".to_string())),
        now_ms,
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-edgeless-note",
        "prop:background",
        SessionValue::Any(Any::String(
            "var(--affine-background-primary-color)".to_string(),
        )),
        now_ms,
    )?;
    seed.paragraph(
        "showcase-edgeless-note-h",
        ParagraphType::H3,
        "Spatial Notes",
        "showcase-edgeless-note",
    )?;
    seed.list(
        "showcase-edgeless-note-b1",
        ListType::Bulleted,
        "GPU world-space transforms & crisp dot-grid",
        false,
        "showcase-edgeless-note",
    )?;
    seed.list(
        "showcase-edgeless-note-b2",
        ListType::Bulleted,
        "Zero BlockFlow relayout during pan & zoom",
        false,
        "showcase-edgeless-note",
    )?;

    seed.add(
        "showcase-edgeless-text",
        BlockSpec::EdgelessText {
            xywh: Some("[820,360,320,84]".to_string()),
        },
        Some("showcase-surface"),
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-edgeless-text",
        "prop:rotate",
        SessionValue::Any(Any::Float64((-4.0_f64).into())),
        now_ms,
    )?;
    let now_ms = seed.tick();
    seed.page.set_block_prop(
        "showcase-edgeless-text",
        "prop:scale",
        SessionValue::Any(Any::Float64((1.0_f64).into())),
        now_ms,
    )?;
    seed.paragraph(
        "showcase-edgeless-text-p",
        ParagraphType::H4,
        "Rotated EdgelessText on GPU",
        "showcase-edgeless-text",
    )?;

    for (id, index) in [
        ("showcase-frame", "a0"),
        ("showcase-note", "a7"),
        ("showcase-edgeless-note", "a8"),
        ("showcase-edgeless-text", "a9"),
    ] {
        let now = seed.tick();
        seed.page.set_block_prop(
            id,
            "prop:index",
            SessionValue::Any(Any::String(index.into())),
            now,
        )?;
    }
    seed.surface_diagram()?;

    let image = showcase_gradient_png();
    if !image.is_empty() {
        state
            .blobs
            .insert(SHOWCASE_IMAGE_ID.to_string(), Arc::new(image));
    }

    let page = state.workspace.ensure_page(HOME_PAGE_ID)?;
    let history = page.undo_stack_id();
    page.inner_mut().clear_stack_history(history, true, true)?;

    // One remote collaborator selecting the first words of the intro paragraph, which
    // stay on its first line at every viewport width.
    let mut peer = RoomAwareness::new(client_id_from_seed(0x0ada))?;
    let mut payload =
        AwarenessPayload::new(SHOWCASE_PEER_NAME, "var(--affine-multi-players-purple)");
    let selected = "y-octo document";
    let index = INTRO
        .find(selected)
        .map_or(0, |start| INTRO[..start].encode_utf16().count());
    payload.set_text_selection(
        HOME_PAGE_ID,
        TextSelectionState::range(
            TextRangePoint {
                block_id: "showcase-intro".to_string(),
                index: index as u64,
                length: selected.encode_utf16().count() as u64,
            },
            None,
            false,
        ),
    )?;
    let update = peer.set_local_payload(&payload, 0)?;
    state.awareness.apply_update(&update, 0)?;

    Ok(state)
}
