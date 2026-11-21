//! gpui-fast's bounds tree, which `gpui.rs` puts in place of upstream's
//! `bounds_tree.rs`. It hands out the same orderings upstream's does, from a
//! grid of cells rather than a tree, and replays last frame's orderings,
//! which is what drawing a retained view again costs most.

use crate::{Bounds, Half};
use std::{
    fmt::Debug,
    ops::{Add, Sub},
};

/// How many bounds a replay may compare against, counted over every search
/// it makes — for bounds that changed, and for bounds that might meet them —
/// before building the grid costs less than going on without it.
const REPLAY_SEARCH_BUDGET: usize = 1 << 15;

/// The side of a grid cell, in the units of the bounds. A frame's bounds are
/// mostly a few dozen scaled pixels across, so each takes a cell or a few.
const CELL_SIZE: f64 = 64.;

/// The most cells the grid spans along either axis. Bounds reaching past the
/// last cell are kept in it.
const MAX_CELLS_PER_AXIS: usize = 256;

/// No entry: the end of a cell's list.
const NONE: u32 = u32::MAX;

/// Hands out orderings for bounds inserted one after another, each one
/// greater than that of every bounds inserted before it that it intersects,
/// and no greater than it has to be, so that primitives that don't overlap
/// share an ordering and are drawn in one batch.
///
/// The bounds are kept in a uniform grid over the plane. Each cell lists the
/// bounds that reach into it, newest first, except those that cover it
/// whole: every search that reaches into the cell meets those, so the cell
/// keeps only the greatest of their orderings. Upstream kept an R-tree,
/// whose searches and splits cost several times as much for the few
/// thousand bounds of a frame, most of them a cell or a few across.
#[derive(Debug)]
pub(crate) struct BoundsTree<U>
where
    U: Clone + Debug + Default + PartialEq,
{
    grid: Grid<U>,
    /// The bounds with the greatest ordering so far, and that ordering: a
    /// search that meets it has its answer at once.
    max: Option<(Bounds<U>, u32)>,
    /// The bounds inserted since the tree was last cleared, in order, each
    /// with the ordering it was given.
    recorded: Vec<(Bounds<U>, u32)>,
    /// What `recorded` held when the tree was cleared.
    previous: Vec<(Bounds<U>, u32)>,
    /// Whether the tree is still being replayed rather than built: every
    /// ordering since it was cleared has been found without it, and it is
    /// built from `recorded` once that stops paying.
    replaying: bool,
    /// While replaying, every bounds whose entry differs from the one in the
    /// same position in `previous` — in its bounds or in its ordering — in
    /// both its old and its new form. An insert that matches `previous` and
    /// meets none of them has the ordering it had then.
    changed: ChangedBounds<U>,
    /// How many more bounds replaying may compare against, over every search
    /// it makes, before the tree is built instead.
    replay_search_budget: usize,
}

/// The grid a [`BoundsTree`] keeps its bounds in. Cell `(column, row)`
/// spans `column * CELL_SIZE` to `(column + 1) * CELL_SIZE` across, and
/// likewise down, except that the first and last column and row reach on
/// without end, so every point of the plane is in exactly one cell.
#[derive(Debug)]
struct Grid<U>
where
    U: Clone + Debug + Default + PartialEq,
{
    columns: usize,
    rows: usize,
    /// Row by row.
    cells: Vec<Cell>,
    /// Every cell's list, linked through `next`.
    entries: Vec<Entry<U>>,
    /// Bounds without a positive width and height. Such bounds may still
    /// meet others, `intersects` being what it is, but have no cells.
    degenerate: Vec<(Bounds<U>, u32)>,
}

#[derive(Clone, Copy, Debug)]
struct Cell {
    /// The newest entry of the cell's list.
    head: u32,
    /// The greatest ordering among the bounds that cover the cell whole.
    cover: u32,
    /// The greatest ordering among all the cell's bounds, covering or not.
    max: u32,
}

impl Cell {
    const EMPTY: Cell = Cell {
        head: NONE,
        cover: 0,
        max: 0,
    };
}

#[derive(Clone, Debug)]
struct Entry<U>
where
    U: Clone + Debug + Default + PartialEq,
{
    bounds: Bounds<U>,
    order: u32,
    /// The greatest ordering of this entry and every one after it in its
    /// list, so a search stops as soon as the rest can't raise its result.
    rest_max: u32,
    next: u32,
}

/// A bounds' extent along one axis, as the grid sees it.
#[derive(Clone, Copy)]
struct Span {
    start: f64,
    end: f64,
    first_cell: usize,
    last_cell: usize,
}

impl Span {
    fn new(start: f64, end: f64, cells: usize) -> Self {
        Span {
            start,
            end,
            first_cell: cell_at(start, cells),
            last_cell: cell_at(end, cells),
        }
    }

    /// Whether this span reaches into the interior of `cell`, of `cells`,
    /// rather than stopping at one of its edges.
    fn enters(&self, cell: usize, cells: usize) -> bool {
        self.start < cell_end(cell, cells) && self.end > cell_start(cell)
    }

    /// Whether this span covers all of `cell`, of `cells`.
    fn covers(&self, cell: usize, cells: usize) -> bool {
        self.start <= cell_start(cell) && self.end >= cell_end(cell, cells)
    }
}

fn cell_at(coordinate: f64, cells: usize) -> usize {
    // `as` truncates toward zero, which is flooring for all that isn't
    // clamped to the first cell anyway; it saturates, and turns NaN into 0.
    ((coordinate * (1. / CELL_SIZE)) as isize).clamp(0, cells as isize - 1) as usize
}

fn cell_start(cell: usize) -> f64 {
    if cell == 0 {
        f64::NEG_INFINITY
    } else {
        cell as f64 * CELL_SIZE
    }
}

fn cell_end(cell: usize, cells: usize) -> f64 {
    if cell + 1 == cells {
        f64::INFINITY
    } else {
        (cell + 1) as f64 * CELL_SIZE
    }
}

/// How many columns and rows of cells [`ChangedBounds`] marks, each
/// [`CELL_SIZE`] across; the first and last reach on without end, as the
/// grid's do.
const CHANGED_CELLS: usize = 64;

/// The bounds that changed while a tree is replayed, with the cells of a
/// coarse grid each reaches into marked, so that an insert reaching into no
/// marked cell is known to meet none of them without comparing it with each.
///
/// Two bounds that intersect overlap along each axis, and so do the cells
/// they span, which is what a search checks. Bounds whose far edge is not
/// past their near one, or not a number, span no cells to mark or check;
/// once one has changed, or for such a search, every changed bounds is
/// compared.
#[derive(Debug)]
struct ChangedBounds<U>
where
    U: Clone + Debug + Default + PartialEq,
{
    bounds: Vec<Bounds<U>>,
    /// Row by row, a bit per column.
    rows: [u64; CHANGED_CELLS],
    /// Whether a changed bounds spans no cells, so that none can be ruled
    /// out by them.
    unmarked: bool,
}

impl<U> ChangedBounds<U>
where
    U: Clone
        + Debug
        + PartialEq
        + PartialOrd
        + Add<U, Output = U>
        + Sub<Output = U>
        + Half
        + Default
        + Into<f64>,
{
    fn clear(&mut self) {
        self.bounds.clear();
        self.rows = [0; CHANGED_CELLS];
        self.unmarked = false;
    }

    /// The first and last column, and the first and last row, of the cells
    /// `bounds` spans, if it spans any.
    fn cells(bounds: &Bounds<U>) -> Option<(usize, usize, usize, usize)> {
        let left: f64 = bounds.origin.x.clone().into();
        let top: f64 = bounds.origin.y.clone().into();
        let right: f64 = (bounds.origin.x.clone() + bounds.size.width.clone()).into();
        let bottom: f64 = (bounds.origin.y.clone() + bounds.size.height.clone()).into();
        // False for a NaN at either end.
        (right >= left && bottom >= top).then(|| {
            (
                cell_at(left, CHANGED_CELLS),
                cell_at(right, CHANGED_CELLS),
                cell_at(top, CHANGED_CELLS),
                cell_at(bottom, CHANGED_CELLS),
            )
        })
    }

    /// The bits of the columns `first..=last`.
    fn columns(first: usize, last: usize) -> u64 {
        (u64::MAX >> (CHANGED_CELLS - 1 - last)) & (u64::MAX << first)
    }

    fn push(&mut self, bounds: &Bounds<U>) {
        match Self::cells(bounds) {
            Some((left, right, top, bottom)) => {
                let columns = Self::columns(left, right);
                for row in &mut self.rows[top..=bottom] {
                    *row |= columns;
                }
            }
            None => self.unmarked = true,
        }
        self.bounds.push(bounds.clone());
    }

    /// Whether `bounds` might meet a changed bounds: false only when it
    /// cannot.
    fn might_meet(&self, bounds: &Bounds<U>) -> bool {
        if self.bounds.is_empty() {
            return false;
        }
        if self.unmarked {
            return true;
        }
        match Self::cells(bounds) {
            Some((left, right, top, bottom)) => {
                let columns = Self::columns(left, right);
                self.rows[top..=bottom].iter().any(|row| row & columns != 0)
            }
            None => true,
        }
    }
}

impl<U> Grid<U>
where
    U: Clone
        + Debug
        + PartialEq
        + PartialOrd
        + Add<U, Output = U>
        + Sub<Output = U>
        + Half
        + Default
        + Into<f64>,
{
    fn clear(&mut self) {
        self.cells.fill(Cell::EMPTY);
        self.entries.clear();
        self.degenerate.clear();
    }

    /// Whether `bounds` has a positive width and height, and an origin that
    /// is a number, which is what it takes to be kept in cells or searched
    /// for through them.
    #[allow(clippy::eq_op)]
    fn has_area(bounds: &Bounds<U>) -> bool {
        bounds.size.width > U::default()
            && bounds.size.height > U::default()
            && bounds.origin.x == bounds.origin.x
            && bounds.origin.y == bounds.origin.y
    }

    /// Where `bounds` lies along each axis.
    fn spans(&self, bounds: &Bounds<U>) -> (Span, Span) {
        let right = bounds.origin.x.clone() + bounds.size.width.clone();
        let bottom = bounds.origin.y.clone() + bounds.size.height.clone();
        (
            Span::new(bounds.origin.x.clone().into(), right.into(), self.columns),
            Span::new(bounds.origin.y.clone().into(), bottom.into(), self.rows),
        )
    }

    /// How many columns and rows a grid needs to hold `bounds` without
    /// keeping it in its last column or row, if more than it has.
    fn needs(&self, bounds: &Bounds<U>) -> Option<(usize, usize)> {
        let right: f64 = (bounds.origin.x.clone() + bounds.size.width.clone()).into();
        let bottom: f64 = (bounds.origin.y.clone() + bounds.size.height.clone()).into();
        if right <= self.columns as f64 * CELL_SIZE && bottom <= self.rows as f64 * CELL_SIZE {
            return None;
        }
        let needed = |end: f64| {
            ((end / CELL_SIZE).ceil() as isize).clamp(1, MAX_CELLS_PER_AXIS as isize) as usize
        };
        let (columns, rows) = (
            needed(right).max(self.columns),
            needed(bottom).max(self.rows),
        );
        (columns > self.columns || rows > self.rows).then_some((columns, rows))
    }

    /// Makes the grid `columns` by `rows` and empties it.
    fn resize(&mut self, columns: usize, rows: usize) {
        self.columns = columns;
        self.rows = rows;
        self.cells.clear();
        self.cells.resize(columns * rows, Cell::EMPTY);
        self.entries.clear();
        self.degenerate.clear();
    }

    fn add(&mut self, bounds: &Bounds<U>, order: u32) {
        if !Self::has_area(bounds) {
            self.degenerate.push((bounds.clone(), order));
            return;
        }
        let (x, y) = self.spans(bounds);
        for row in y.first_cell..=y.last_cell {
            let covers_row = y.covers(row, self.rows);
            for column in x.first_cell..=x.last_cell {
                let cell = &mut self.cells[row * self.columns + column];
                cell.max = cell.max.max(order);
                if covers_row && x.covers(column, self.columns) {
                    cell.cover = cell.cover.max(order);
                } else {
                    let rest_max = match self.entries.get(cell.head as usize) {
                        Some(next) => next.rest_max.max(order),
                        None => order,
                    };
                    let entry = self.entries.len() as u32;
                    self.entries.push(Entry {
                        bounds: bounds.clone(),
                        order,
                        rest_max,
                        next: cell.head,
                    });
                    cell.head = entry;
                }
            }
        }
    }

    /// The greatest ordering among the bounds that intersect `query`, which
    /// has a positive width and height, or 0.
    ///
    /// Two such bounds that intersect share a point inside both, and the
    /// cell holding that point lists one of them if it doesn't cover it, and
    /// the query reaches into its interior. A bounds that covers a cell whole
    /// meets every query that reaches into its interior, so the cell's cover
    /// counts there without looking at the bounds.
    fn max_intersecting(&self, query: &Bounds<U>) -> u32 {
        let mut max = self
            .degenerate
            .iter()
            .filter(|(bounds, _)| bounds.intersects(query))
            .map(|(_, order)| *order)
            .max()
            .unwrap_or(0);
        let (x, y) = self.spans(query);
        for row in y.first_cell..=y.last_cell {
            let enters_row = y.enters(row, self.rows);
            for column in x.first_cell..=x.last_cell {
                let cell = &self.cells[row * self.columns + column];
                if cell.max <= max {
                    continue;
                }
                if cell.cover > max && enters_row && x.enters(column, self.columns) {
                    max = cell.cover;
                }
                let mut entry_ix = cell.head;
                while let Some(entry) = self.entries.get(entry_ix as usize) {
                    if entry.rest_max <= max {
                        break;
                    }
                    if entry.order > max && entry.bounds.intersects(query) {
                        max = entry.order;
                    }
                    entry_ix = entry.next;
                }
            }
        }
        max
    }
}

impl<U> BoundsTree<U>
where
    U: Clone
        + Debug
        + PartialEq
        + PartialOrd
        + Add<U, Output = U>
        + Sub<Output = U>
        + Half
        + Default
        + Into<f64>,
{
    /// Clears all bounds from the tree.
    ///
    /// What was inserted since the last clear is kept aside: a frame usually
    /// inserts the same bounds in the same order as the one before it, and an
    /// ordering depends on nothing but the bounds inserted before it, so as
    /// long as that holds the orderings can be handed out again as they were.
    pub fn clear(&mut self) {
        self.grid.clear();
        self.max = None;
        std::mem::swap(&mut self.previous, &mut self.recorded);
        self.recorded.clear();
        self.replaying = true;
        self.changed.clear();
        self.replay_search_budget = REPLAY_SEARCH_BUDGET;
    }

    /// Clears the tree and forgets what was inserted before, so the next fill
    /// is ordered from scratch rather than replayed.

    /// Inserts bounds into the tree and returns its assigned ordering.
    ///
    /// The ordering is one greater than the maximum ordering of any
    /// existing bounds that intersect with the new bounds.
    pub fn insert(&mut self, new_bounds: Bounds<U>) -> u32 {
        if self.replaying {
            if let Some(ordering) = self.replay(&new_bounds) {
                self.recorded.push((new_bounds, ordering));
                return ordering;
            }
            self.replaying = false;
            self.build_from_recorded();
        }

        let ordering = self.find_max_ordering(&new_bounds) + 1;
        self.add(&new_bounds, ordering);
        self.recorded.push((new_bounds, ordering));
        ordering
    }

    /// The ordering `bounds` is given while the tree is being replayed, or
    /// `None` once finding it without the tree would cost more than building
    /// the tree.
    ///
    /// An ordering is one more than the greatest among the bounds inserted
    /// before it that it meets. If `bounds` is what was inserted at this
    /// position last time, and meets nothing that was, or is now, different
    /// from last time before it, then everything it meets and every ordering
    /// among them is as it was, and so is its own. Otherwise its ordering is
    /// worked out from what has been inserted so far, and if that differs
    /// from last time, the bounds join the ones that changed.
    fn replay(&mut self, bounds: &Bounds<U>) -> Option<u32> {
        let previous = self.previous.get(self.recorded.len());
        if let Some((previous_bounds, ordering)) = previous
            && previous_bounds == bounds
        {
            let meets_changed = self.changed.might_meet(bounds) && {
                self.replay_search_budget = self
                    .replay_search_budget
                    .checked_sub(self.changed.bounds.len())?;
                self.changed
                    .bounds
                    .iter()
                    .any(|changed| changed.intersects(bounds))
            };
            if !meets_changed {
                return Some(*ordering);
            }
        }

        self.replay_search_budget = self.replay_search_budget.checked_sub(self.recorded.len())?;
        let ordering = self
            .recorded
            .iter()
            .filter(|(other, _)| other.intersects(bounds))
            .map(|(_, ordering)| *ordering)
            .max()
            .unwrap_or(0)
            + 1;
        match previous {
            Some((previous_bounds, previous_ordering)) => {
                if previous_bounds != bounds {
                    self.changed.push(previous_bounds);
                    self.changed.push(bounds);
                } else if *previous_ordering != ordering {
                    self.changed.push(bounds);
                }
            }
            None => self.changed.push(bounds),
        }
        Some(ordering)
    }

    /// Adds `bounds` with `ordering` to the grid, growing it first if the
    /// bounds reach past it.
    fn add(&mut self, bounds: &Bounds<U>, ordering: u32) {
        if Grid::has_area(bounds)
            && let Some((columns, rows)) = self.grid.needs(bounds)
        {
            self.grid.resize(columns, rows);
            for (recorded, recorded_ordering) in &self.recorded {
                self.grid.add(recorded, *recorded_ordering);
            }
        }
        self.grid.add(bounds, ordering);
        if self.max.as_ref().is_none_or(|(_, max)| *max < ordering) {
            self.max = Some((bounds.clone(), ordering));
        }
    }

    /// Builds the grid from what has been inserted since it was cleared,
    /// whose orderings were handed out without it. Their orderings are
    /// known, so there is nothing to search for, only bounds to place.
    fn build_from_recorded(&mut self) {
        let mut size = (self.grid.columns, self.grid.rows);
        for (bounds, _) in &self.recorded {
            if Grid::has_area(bounds)
                && let Some((columns, rows)) = self.grid.needs(bounds)
            {
                size = (size.0.max(columns), size.1.max(rows));
            }
        }
        if size != (self.grid.columns, self.grid.rows) {
            self.grid.resize(size.0, size.1);
        }
        for (bounds, ordering) in &self.recorded {
            self.grid.add(bounds, *ordering);
            if self.max.as_ref().is_none_or(|(_, max)| max < ordering) {
                self.max = Some((bounds.clone(), *ordering));
            }
        }
    }

    /// Finds the maximum ordering among all bounds that intersect with the query.
    fn find_max_ordering(&self, query: &Bounds<U>) -> u32 {
        if let Some((max_bounds, max)) = &self.max
            && query.intersects(max_bounds)
        {
            return *max;
        }
        if Grid::has_area(query) {
            self.grid.max_intersecting(query)
        } else {
            // Without an area of its own the query may miss the interior of
            // every cell it touches, so the covers can't answer for it.
            self.recorded
                .iter()
                .filter(|(bounds, _)| bounds.intersects(query))
                .map(|(_, ordering)| *ordering)
                .max()
                .unwrap_or(0)
        }
    }
}

impl<U> Default for BoundsTree<U>
where
    U: Clone + Debug + Default + PartialEq,
{
    fn default() -> Self {
        BoundsTree {
            grid: Grid {
                columns: 1,
                rows: 1,
                cells: vec![Cell::EMPTY],
                entries: Vec::new(),
                degenerate: Vec::new(),
            },
            max: None,
            recorded: Vec::new(),
            previous: Vec::new(),
            replaying: false,
            changed: ChangedBounds {
                bounds: Vec::new(),
                rows: [0; CHANGED_CELLS],
                unmarked: false,
            },
            replay_search_budget: REPLAY_SEARCH_BUDGET,
        }
    }
}
