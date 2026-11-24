use std::{
    alloc::{self, handle_alloc_error},
    cell::Cell,
    num::NonZeroUsize,
    ops::{Deref, DerefMut},
    ptr::{self, NonNull},
    rc::Rc,
};

struct ArenaElement {
    value: *mut u8,
    drop: unsafe fn(*mut u8),
}

impl Drop for ArenaElement {
    #[inline(always)]
    fn drop(&mut self) {
        unsafe { (self.drop)(self.value) };
    }
}

struct Chunk {
    start: *mut u8,
    end: *mut u8,
    offset: *mut u8,
}

impl Drop for Chunk {
    fn drop(&mut self) {
        unsafe {
            let chunk_size = self.end.offset_from_unsigned(self.start);
            // SAFETY: This succeeded during allocation.
            let layout = alloc::Layout::from_size_align_unchecked(chunk_size, 1);
            alloc::dealloc(self.start, layout);
        }
    }
}

impl Chunk {
    fn new(chunk_size: NonZeroUsize) -> Self {
        // this only fails if chunk_size is unreasonably huge
        let layout = alloc::Layout::from_size_align(chunk_size.get(), 1).unwrap();
        let start = unsafe { alloc::alloc(layout) };
        if start.is_null() {
            handle_alloc_error(layout);
        }
        let end = unsafe { start.add(chunk_size.get()) };
        Self {
            start,
            end,
            offset: start,
        }
    }

    fn allocate(&mut self, layout: alloc::Layout) -> Option<NonNull<u8>> {
        // Compute the allocation bounds in integer address space so that the
        // bounds check happens before any pointer offsetting. Offsetting a
        // pointer past the end of its allocation is undefined behavior even if
        // the result is never dereferenced (as happens on the chunk-spill
        // path), so `ptr::add` cannot be used until we know the result stays
        // in bounds. `checked_add` also handles the documented case where
        // `align_offset` returns `usize::MAX`.
        let base = self.offset.addr();
        let aligned_addr = base.checked_add(self.offset.align_offset(layout.align()))?;
        let next_addr = aligned_addr.checked_add(layout.size())?;

        if next_addr <= self.end.addr() {
            let aligned = self.offset.with_addr(aligned_addr);
            self.offset = self.offset.with_addr(next_addr);
            NonNull::new(aligned)
        } else {
            None
        }
    }

    fn reset(&mut self) {
        self.offset = self.start;
    }
}

pub struct Arena {
    chunks: Vec<Chunk>,
    elements: Vec<ArenaElement>,
    valid: Rc<Cell<bool>>,
    current_chunk_index: usize,
    chunk_size: NonZeroUsize,
    scope_depth: usize,
}

impl Drop for Arena {
    fn drop(&mut self) {
        self.force_clear();
    }
}

impl Arena {
    pub fn new(chunk_size: usize) -> Self {
        let chunk_size = NonZeroUsize::try_from(chunk_size).unwrap();
        Self {
            chunks: vec![Chunk::new(chunk_size)],
            elements: Vec::new(),
            valid: Rc::new(Cell::new(true)),
            current_chunk_index: 0,
            chunk_size,
            scope_depth: 0,
        }
    }

    pub fn capacity(&self) -> usize {
        self.chunks.len() * self.chunk_size.get()
    }

    /// Marks the start of a scope (e.g. a window draw) whose allocations must stay
    /// live until the scope ends, even if `clear` is called by a nested scope in
    /// the meantime.
    pub fn begin_scope(&mut self) {
        self.scope_depth += 1;
    }

    /// Ends the innermost scope started with `begin_scope`.
    ///
    /// Panics if no scope is active: an unbalanced `end_scope` would let `clear`
    /// run while an enclosing scope still references arena memory, which is
    /// exactly the use-after-free this bookkeeping exists to prevent, so failing
    /// loudly here is preferable.
    pub fn end_scope(&mut self) {
        self.scope_depth = self
            .scope_depth
            .checked_sub(1)
            .expect("Arena::end_scope called without a matching begin_scope");
    }

    /// Drops all allocations and resets the arena, unless a scope is still active.
    ///
    /// When a draw triggers a nested draw (e.g. re-entrant window procedure
    /// invocations on Windows, or opening a window from within a draw), the nested
    /// draw's clear must not free memory the outer draw still references, so it is
    /// deferred: the outer draw's own clear will drop both draws' allocations.
    pub fn clear(&mut self) {
        if self.scope_depth == 0 {
            self.force_clear();
        } else {
            log::debug!(
                "deferring arena clear; {} enclosing scope(s) still active",
                self.scope_depth
            );
        }
    }

    fn force_clear(&mut self) {
        self.valid.set(false);
        self.valid = Rc::new(Cell::new(true));
        self.elements.clear();
        for chunk_index in 0..=self.current_chunk_index {
            self.chunks[chunk_index].reset();
        }
        self.current_chunk_index = 0;
    }

    #[inline(always)]
    pub fn alloc<T>(&mut self, f: impl FnOnce() -> T) -> ArenaBox<T> {
        #[inline(always)]
        unsafe fn inner_writer<T, F>(ptr: *mut T, f: F)
        where
            F: FnOnce() -> T,
        {
            unsafe { ptr::write(ptr, f()) };
        }

        unsafe fn drop<T>(ptr: *mut u8) {
            unsafe { std::ptr::drop_in_place(ptr.cast::<T>()) };
        }

        let layout = alloc::Layout::new::<T>();
        let current_chunk = &mut self.chunks[self.current_chunk_index];
        let ptr = if let Some(ptr) = current_chunk.allocate(layout) {
            ptr.as_ptr()
        } else {
            self.allocate_next_chunk(layout)
        };

        unsafe { inner_writer(ptr.cast(), f) };
        self.elements.push(ArenaElement {
            value: ptr,
            drop: drop::<T>,
        });

        ArenaBox {
            ptr: ptr.cast(),
            valid: self.valid.clone(),
        }
    }

    #[inline(never)]
    fn allocate_next_chunk(&mut self, layout: alloc::Layout) -> *mut u8 {
        self.current_chunk_index += 1;
        if self.current_chunk_index >= self.chunks.len() {
            self.chunks.push(Chunk::new(self.chunk_size));
            assert_eq!(self.current_chunk_index, self.chunks.len() - 1);
            log::trace!(
                "increased element arena capacity to {}kb",
                self.capacity() / 1024,
            );
        }
        let current_chunk = &mut self.chunks[self.current_chunk_index];
        if let Some(pointer) = current_chunk.allocate(layout) {
            pointer.as_ptr()
        } else {
            panic!(
                "Arena chunk_size of {} is too small to allocate {} bytes",
                self.chunk_size,
                layout.size()
            );
        }
    }
}

pub struct ArenaBox<T: ?Sized> {
    ptr: *mut T,
    valid: Rc<Cell<bool>>,
}

impl<T: ?Sized> ArenaBox<T> {
    #[inline(always)]
    pub fn map<U: ?Sized>(mut self, f: impl FnOnce(&mut T) -> &mut U) -> ArenaBox<U> {
        ArenaBox {
            ptr: f(&mut self),
            valid: self.valid,
        }
    }

    #[track_caller]
    fn validate(&self) {
        assert!(
            self.valid.get(),
            "attempted to dereference an ArenaRef after its Arena was cleared"
        );
    }
}

impl<T: ?Sized> Deref for ArenaBox<T> {
    type Target = T;

    #[inline(always)]
    fn deref(&self) -> &Self::Target {
        self.validate();
        unsafe { &*self.ptr }
    }
}

impl<T: ?Sized> DerefMut for ArenaBox<T> {
    #[inline(always)]
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.validate();
        unsafe { &mut *self.ptr }
    }
}
