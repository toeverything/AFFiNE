use std::{cmp::Ordering, collections::BTreeMap};

use blocksuite_playground_doc::read::{BlockContent, BlockNode, SurfaceElementKind};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum PaintItem {
    Frame(usize),
    Note(usize),
    Text(usize),
    Surface(usize, usize),
}

#[derive(Default)]
pub(super) struct Layers<'a> {
    indices: BTreeMap<&'a str, &'a str>,
    parents: BTreeMap<&'a str, &'a str>,
}

impl<'a> Layers<'a> {
    pub(super) fn from_root(root: &'a BlockNode) -> Self {
        let mut layers = Self::default();
        for node in root.walk() {
            let index = node
                .props
                .get("prop:index")
                .and_then(|v| v.as_str())
                .unwrap_or("a0");
            layers.indices.insert(&node.id, index);
            match &node.content {
                BlockContent::Frame { .. } => {
                    if let Some(children) = node
                        .props
                        .get("prop:childElementIds")
                        .and_then(|v| v.as_object())
                    {
                        for (child, present) in children {
                            if present.as_bool() == Some(true) {
                                layers.set_parent(child, &node.id);
                            }
                        }
                    }
                }
                BlockContent::Surface { elements, .. } => {
                    for e in elements {
                        layers.indices.insert(&e.id, &e.index);
                        if let SurfaceElementKind::Group { children, .. } = &e.kind {
                            for child in children {
                                layers.set_parent(child, &e.id);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        layers
    }

    fn set_parent(&mut self, id: &'a str, parent: &'a str) {
        let mut ancestor = parent;
        loop {
            if ancestor == id {
                return;
            }
            match self.parents.get(ancestor) {
                Some(next) => ancestor = next,
                None => break,
            }
        }
        self.parents.entry(id).or_insert(parent);
    }

    pub(super) fn merge<'b>(
        &self,
        items: impl IntoIterator<Item = (&'b str, PaintItem)>,
    ) -> Vec<PaintItem> {
        struct Entry<'a> {
            id: &'a str,
            item: PaintItem,
            path: Vec<&'a str>,
        }
        let (mut canvas, mut blocks): (Vec<_>, Vec<_>) = items
            .into_iter()
            .map(|(id, item)| {
                let mut path = vec![id];
                let mut node = id;
                while let Some(parent) = self.parents.get(node) {
                    path.push(*parent);
                    node = parent;
                }
                path.reverse();
                Entry { id, item, path }
            })
            .partition(|e| matches!(e.item, PaintItem::Surface(..)));
        let compare = |a: &Entry<'_>, b: &Entry<'_>| {
            for (&left, &right) in a.path.iter().zip(&b.path) {
                if left != right {
                    return self
                        .indices
                        .get(left)
                        .copied()
                        .unwrap_or("a0")
                        .cmp(self.indices.get(right).copied().unwrap_or("a0"));
                }
            }
            a.path.len().cmp(&b.path.len())
        };
        for stream in [&mut canvas, &mut blocks] {
            stream.sort_by(|a, b| compare(a, b).then_with(|| a.id.cmp(b.id)));
        }
        let mut output = Vec::with_capacity(canvas.len() + blocks.len());
        let (mut blocks, mut canvas) =
            (blocks.into_iter().peekable(), canvas.into_iter().peekable());
        let mut canvas_active = false;
        while let (Some(b), Some(c)) = (blocks.peek(), canvas.peek()) {
            canvas_active = match compare(b, c) {
                Ordering::Less => false,
                Ordering::Greater => true,
                Ordering::Equal => canvas_active,
            };
            let next = if canvas_active {
                canvas.next()
            } else {
                blocks.next()
            };
            output.push(next.unwrap().item);
        }
        output.extend(blocks.chain(canvas).map(|e| e.item));
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::{schema::BlockSpec, session::PageDocSession};
    use y_octo::{Any, SessionValue};
    #[test]
    fn frame_members_follow_the_frame_and_ties_continue_the_active_stream() {
        let mut page = PageDocSession::new("order", 71).unwrap();
        page.add_block("page", BlockSpec::Page { title: "".into() }, None, None, 1)
            .unwrap();
        page.add_block(
            "frame",
            BlockSpec::Frame {
                title: "".into(),
                xywh: Some("[0,0,10,10]".into()),
                presentation_index: None,
            },
            Some("page"),
            None,
            2,
        )
        .unwrap();
        for (key, value) in [
            ("prop:index", SessionValue::Any(Any::String("a5".into()))),
            (
                "prop:childElementIds",
                SessionValue::Map(vec![
                    ("member".into(), SessionValue::Any(Any::True)),
                    ("unrelated".into(), SessionValue::Any(Any::False)),
                ]),
            ),
        ] {
            page.set_block_prop("frame", key, value, 3).unwrap();
        }
        let snapshot = page.read_page_snapshot().unwrap();
        let mut layers = Layers::from_root(snapshot.root.as_ref().unwrap());
        layers
            .indices
            .extend([("member", "a0"), ("earlier", "a1"), ("unrelated", "a5")]);
        let (frame, member, earlier, unrelated) = (
            PaintItem::Frame(0),
            PaintItem::Surface(0, 0),
            PaintItem::Surface(0, 1),
            PaintItem::Surface(0, 2),
        );
        let order = layers.merge([("earlier", earlier), ("frame", frame), ("member", member)]);
        assert_eq!(order, [earlier, frame, member]);
        let order = layers.merge([
            ("earlier", earlier),
            ("frame", frame),
            ("unrelated", unrelated),
        ]);
        assert_eq!(order, [earlier, unrelated, frame]);
    }
}
