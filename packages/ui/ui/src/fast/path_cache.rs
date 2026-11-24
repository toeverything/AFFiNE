//! Tessellated paths kept from one build to the next.
//!
//! A path is tessellated into triangles every time it is built, which for a
//! sparkline in every row of a table, a chart's moving averages or a donut is
//! a large part of what painting them costs, though most of them are the same
//! shape as the frame before, or the same shape moved, as a table scrolls.
//!
//! [`build`] tessellates a path relative to its first point and keeps the
//! triangles, keyed by that relative path and by how it is stroked or filled;
//! a path of the same shape built again anywhere reuses them, moved to its
//! first point. Every path is tessellated that way, kept or not, so a path
//! drawn from kept triangles is exactly the path tessellating it again gives.

use std::{cell::RefCell, rc::Rc};

use crate::collections::FxHashMap;
use anyhow::Error;
use lyon::path::PathEvent;

use crate::{Bounds, Path, PathBuilder, PathStyle, PathVertex, Pixels, Point, point, px};

/// How many shapes are kept before the least recently drawn is let go.
const KEPT: usize = 2048;

/// How many bytes of keys and triangles (their weight: the memory they own,
/// not what surrounds them) the kept shapes weigh before the least recently
/// drawn is let go. A window-sized path is hundreds of kilobytes, a sparkline
/// about ten.
const KEPT_BYTES: usize = 16 * 1024 * 1024;

/// A link to no slot.
const NONE: usize = usize::MAX;

thread_local! {
    static KEPT_PATHS: RefCell<KeptPaths> = RefCell::new(KeptPaths::new(KEPT_BYTES, KEPT));
}

/// Tessellated shapes, the least recently drawn let go first once more than
/// `shapes` are kept or they weigh more than `limit`.
///
/// A shape stays kept until `shapes` other shapes, or other shapes weighing
/// `limit` less its own weight, have been drawn since it last was. One
/// exception: a shape heavier than `limit` is kept alone in a slot of its
/// own, outside the rest, until the next such shape takes it. One drawn every
/// frame lets go of none of the rest, but two drawn in turn each take the
/// slot from the other and are tessellated every time. A thread keeps at most
/// `limit` plus the one shape in its slot.
struct KeptPaths {
    /// Slots linked from the newest shape drawn to the oldest.
    slots: Vec<Option<Slot>>,
    /// The slots no shape is in.
    vacant: Vec<usize>,
    index: FxHashMap<Rc<[u32]>, usize>,
    newest: usize,
    oldest: usize,
    /// The weight of the shapes in `slots`.
    bytes: usize,
    heavy: Option<(Rc<[u32]>, Rc<Path<Pixels>>)>,
    limit: usize,
    shapes: usize,
}

struct Slot {
    key: Rc<[u32]>,
    path: Rc<Path<Pixels>>,
    bytes: usize,
    newer: usize,
    older: usize,
}

/// What a thread's kept shapes did since it began, and hold now, for
/// benchmarks and tests. Counts are per thread.

/// What keeping `path` under `key` weighs: the memory its key (exactly its
/// length) and its triangles (their capacity) own, not the memory around them.
fn weight(key: &[u32], path: &Path<Pixels>) -> usize {
    std::mem::size_of_val(key)
        + path.vertices.capacity() * std::mem::size_of::<PathVertex<Pixels>>()
}

impl KeptPaths {
    fn new(limit: usize, shapes: usize) -> Self {
        Self {
            slots: Vec::new(),
            vacant: Vec::new(),
            index: FxHashMap::default(),
            newest: NONE,
            oldest: NONE,
            bytes: 0,
            heavy: None,
            limit,
            shapes,
        }
    }

    fn slot(&self, at: usize) -> &Slot {
        self.slots[at].as_ref().expect("a linked slot is occupied")
    }

    fn slot_mut(&mut self, at: usize) -> &mut Slot {
        self.slots[at].as_mut().expect("a linked slot is occupied")
    }

    fn get(&mut self, key: &[u32]) -> Option<Rc<Path<Pixels>>> {
        let found = match self.index.get(key) {
            Some(&at) => {
                if self.newest != at {
                    self.unlink(at);
                    self.link_newest(at);
                }
                Some(self.slot(at).path.clone())
            }
            None => match &self.heavy {
                Some((heavy, path)) if **heavy == *key => Some(path.clone()),
                _ => None,
            },
        };
        found
    }

    /// Keeps a shape just tessellated, letting go of the least recently drawn
    /// until it fits.
    fn insert(&mut self, key: Vec<u32>, path: Rc<Path<Pixels>>) {
        let key: Rc<[u32]> = key.into();
        let bytes = weight(&key, &path);
        if bytes > self.limit {
            self.heavy = Some((key, path));
            return;
        }
        while self.bytes + bytes > self.limit || self.index.len() >= self.shapes {
            self.let_go_of_oldest();
        }
        let slot = Slot {
            key: key.clone(),
            path,
            bytes,
            newer: NONE,
            older: NONE,
        };
        let at = match self.vacant.pop() {
            Some(at) => {
                self.slots[at] = Some(slot);
                at
            }
            None => {
                self.slots.push(Some(slot));
                self.slots.len() - 1
            }
        };
        self.index.insert(key, at);
        self.link_newest(at);
        self.bytes += bytes;
    }

    fn let_go_of_oldest(&mut self) {
        let at = self.oldest;
        self.unlink(at);
        let slot = self.slots[at].take().expect("a linked slot is occupied");
        self.index.remove(&slot.key);
        self.bytes -= slot.bytes;
        self.vacant.push(at);
    }

    fn unlink(&mut self, at: usize) {
        let Slot { newer, older, .. } = *self.slot(at);
        match newer {
            NONE => self.newest = older,
            newer => self.slot_mut(newer).older = older,
        }
        match older {
            NONE => self.oldest = newer,
            older => self.slot_mut(older).newer = newer,
        }
    }

    fn link_newest(&mut self, at: usize) {
        let before = self.newest;
        let slot = self.slot_mut(at);
        slot.newer = NONE;
        slot.older = before;
        match before {
            NONE => self.oldest = at,
            before => self.slot_mut(before).newer = at,
        }
        self.newest = at;
    }
}

/// What this thread's kept shapes did and hold.

/// Builds `builder` as [`PathBuilder::build`] does, from triangles kept from
/// an earlier path of the same shape where there is one.
#[inline]
pub(crate) fn build(builder: PathBuilder) -> Result<Path<Pixels>, Error> {
    let path = match builder.transform {
        Some(transform) => builder.raw.build().transformed(&transform),
        None => builder.raw.build(),
    };
    let Some(origin) = path.iter().find_map(|event| match event {
        PathEvent::Begin { at } => Some(at),
        _ => None,
    }) else {
        return tessellate(&builder.style, builder.dash_array, &path);
    };
    let relative = path.transformed(&lyon::math::Transform::translation(-origin.x, -origin.y));
    let offset = point(px(origin.x), px(origin.y));

    let key = shape_key(&relative, &builder.style, builder.dash_array.as_deref());
    if let Some(kept) = KEPT_PATHS.with_borrow_mut(|kept| kept.get(&key)) {
        return Ok(moved(&kept, offset));
    }
    let tessellated = tessellate(&builder.style, builder.dash_array, &relative)?;
    let tessellated = Rc::new(tessellated);
    KEPT_PATHS.with_borrow_mut(|kept| kept.insert(key, tessellated.clone()));
    Ok(moved(&tessellated, offset))
}

fn tessellate(
    style: &PathStyle,
    dash_array: Option<Vec<Pixels>>,
    path: &lyon::path::Path,
) -> Result<Path<Pixels>, Error> {
    match style {
        PathStyle::Stroke(options) => PathBuilder::tessellate_stroke(dash_array, path, options),
        PathStyle::Fill(options) => PathBuilder::tessellate_fill(path, options),
    }
}

/// `path`, tessellated at the origin, moved by `offset`, as tessellating it
/// with `build_path` there gives it: starting at its first vertex.
fn moved(path: &Path<Pixels>, offset: Point<Pixels>) -> Path<Pixels> {
    let start = path
        .vertices
        .first()
        .map_or(offset, |vertex| vertex.xy_position + offset);
    let mut moved = Path::new(start);
    moved.vertices = path
        .vertices
        .iter()
        .map(|vertex| {
            let mut vertex = vertex.clone();
            vertex.xy_position = vertex.xy_position + offset;
            vertex
        })
        .collect();
    moved.bounds = Bounds {
        origin: path.bounds.origin + offset,
        size: path.bounds.size,
    };
    moved
}

/// The key a shape is kept by: its events at the origin, and how it is
/// stroked or filled, as bits, so that only the same shape matches.
fn shape_key(
    path: &lyon::path::Path,
    style: &PathStyle,
    dash_array: Option<&[Pixels]>,
) -> Vec<u32> {
    let mut key = Vec::with_capacity(64);
    let point = |key: &mut Vec<u32>, point: lyon::math::Point| {
        key.push(point.x.to_bits());
        key.push(point.y.to_bits());
    };
    for event in path.iter() {
        match event {
            PathEvent::Begin { at } => {
                key.push(0);
                point(&mut key, at);
            }
            PathEvent::Line { to, .. } => {
                key.push(1);
                point(&mut key, to);
            }
            PathEvent::Quadratic { ctrl, to, .. } => {
                key.push(2);
                point(&mut key, ctrl);
                point(&mut key, to);
            }
            PathEvent::Cubic {
                ctrl1, ctrl2, to, ..
            } => {
                key.push(3);
                point(&mut key, ctrl1);
                point(&mut key, ctrl2);
                point(&mut key, to);
            }
            PathEvent::End { close, .. } => key.push(4 + close as u32),
        }
    }
    // The options are small and seldom vary; their debug form covers every
    // field without listing them.
    let options = match style {
        PathStyle::Stroke(options) => format!("s{options:?}"),
        PathStyle::Fill(options) => format!("f{options:?}"),
    };
    key.push(u32::MAX);
    key.extend(options.bytes().map(u32::from));
    if let Some(dash_array) = dash_array {
        key.push(u32::MAX - 1);
        key.extend(dash_array.iter().map(|dash| dash.0.to_bits()));
    }
    key
}
