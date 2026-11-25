use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Arc;

use crate::svg_raster::RgbaImageBuffer;

/// Dual-threshold cache limits for rasterized preview images.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CacheLimits {
    /// Maximum number of unpinned-evictable entries retained in cache.
    pub max_entries: usize,
    /// Maximum total RGBA pixel bytes (`width * height * 4`) retained in cache.
    pub max_bytes: usize,
}

impl CacheLimits {
    /// Default mobile preview cache budget calibrated from 2x Mermaid and formula measurements.
    ///
    /// Allows up to 64 preview tiles or 32 MiB of RGBA8 pixels before evicting
    /// off-screen (`pin_count == 0`) entries.
    pub const MOBILE_DEFAULT: Self = Self {
        max_entries: 64,
        max_bytes: 32 * 1024 * 1024,
    };
}

impl Default for CacheLimits {
    fn default() -> Self {
        Self::MOBILE_DEFAULT
    }
}

/// Summary of entries evicted during a cache insertion or pin release.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct EvictionReport {
    /// Number of entries removed from the cache.
    pub evicted_entries: usize,
    /// Total pixel bytes freed by the eviction pass.
    pub evicted_bytes: usize,
}

struct CacheEntry {
    image: Arc<RgbaImageBuffer>,
    bytes: usize,
    pin_count: usize,
    last_touch: u64,
}

/// Dual-limit (entry count + pixel bytes) LRU cache with on-screen pin protection.
///
/// Entries with `pin_count > 0` are never evicted, preventing visible preview
/// flicker during scrolling when many diagrams share a viewport. When limits
/// are exceeded, the cache evicts the least-recently-used entry with
/// `pin_count == 0`.
pub struct PinnedPixelCache<K> {
    limits: CacheLimits,
    entries: HashMap<K, CacheEntry>,
    total_bytes: usize,
    pinned_entries: usize,
    pinned_bytes: usize,
    clock: u64,
}

impl<K: Eq + Hash + Clone> PinnedPixelCache<K> {
    /// Creates an empty cache with the given entry and byte limits.
    pub fn new(limits: CacheLimits) -> Self {
        Self {
            limits,
            entries: HashMap::new(),
            total_bytes: 0,
            pinned_entries: 0,
            pinned_bytes: 0,
            clock: 0,
        }
    }

    /// Returns the configured cache limits.
    pub fn limits(&self) -> CacheLimits {
        self.limits
    }

    /// Returns the number of cached entries (pinned and unpinned).
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns true when the cache contains no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Returns the total pixel bytes stored across all entries.
    pub fn total_bytes(&self) -> usize {
        self.total_bytes
    }

    /// Returns the number of currently pinned entries.
    pub fn pinned_count(&self) -> usize {
        self.pinned_entries
    }

    /// Returns the total pixel bytes held by currently pinned entries.
    pub fn pinned_bytes(&self) -> usize {
        self.pinned_bytes
    }

    /// Returns the current pin count for `key`.
    pub fn pin_count(&self, key: &K) -> usize {
        self.entries.get(key).map_or(0, |entry| entry.pin_count)
    }

    /// Returns true when `key` exists in cache and has `pin_count > 0`.
    pub fn is_pinned(&self, key: &K) -> bool {
        self.pin_count(key) > 0
    }

    /// Looks up `key` and marks it most-recently-used.
    pub fn get(&mut self, key: &K) -> Option<Arc<RgbaImageBuffer>> {
        let tick = self.next_tick();
        let entry = self.entries.get_mut(key)?;
        entry.last_touch = tick;
        Some(Arc::clone(&entry.image))
    }

    /// Inserts or replaces `key` and evicts unpinned LRU entries if limits are exceeded.
    ///
    /// Replacing an existing entry preserves its existing `pin_count`.
    pub fn insert(&mut self, key: K, image: Arc<RgbaImageBuffer>) -> EvictionReport {
        self.insert_internal(key, image, false)
    }

    /// Inserts or replaces `key` and increments its pin count atomically before eviction.
    pub fn insert_pinned(&mut self, key: K, image: Arc<RgbaImageBuffer>) -> EvictionReport {
        self.insert_internal(key, image, true)
    }

    /// Increments the on-screen pin count for `key` and marks it recently used.
    ///
    /// Returns false if `key` is not in the cache.
    pub fn acquire_pin(&mut self, key: &K) -> bool {
        let tick = self.next_tick();
        let Some(entry) = self.entries.get_mut(key) else {
            return false;
        };
        if entry.pin_count == 0 {
            self.pinned_entries += 1;
            self.pinned_bytes += entry.bytes;
        }
        entry.pin_count += 1;
        entry.last_touch = tick;
        true
    }

    /// Decrements the on-screen pin count for `key` and evicts excess unpinned entries.
    ///
    /// Returns false if `key` is not in the cache or was not pinned.
    pub fn release_pin(&mut self, key: &K) -> bool {
        let Some(entry) = self.entries.get_mut(key) else {
            return false;
        };
        if entry.pin_count == 0 {
            return false;
        }
        entry.pin_count -= 1;
        if entry.pin_count == 0 {
            self.pinned_entries = self.pinned_entries.saturating_sub(1);
            self.pinned_bytes = self.pinned_bytes.saturating_sub(entry.bytes);
            self.evict_if_needed();
        }
        true
    }

    /// Removes all entries (including pinned entries) and resets byte accounting.
    pub fn clear(&mut self) {
        self.entries.clear();
        self.total_bytes = 0;
        self.pinned_entries = 0;
        self.pinned_bytes = 0;
    }

    /// Removes all unpinned entries while keeping pinned entries intact.
    pub fn clear_unpinned(&mut self) -> EvictionReport {
        let unpinned_keys: Vec<K> = self
            .entries
            .iter()
            .filter(|(_, entry)| entry.pin_count == 0)
            .map(|(key, _)| key.clone())
            .collect();

        let mut report = EvictionReport::default();
        for key in unpinned_keys {
            if let Some(removed) = self.entries.remove(&key) {
                self.total_bytes = self.total_bytes.saturating_sub(removed.bytes);
                report.evicted_entries += 1;
                report.evicted_bytes += removed.bytes;
            }
        }
        report
    }

    fn insert_internal(
        &mut self,
        key: K,
        image: Arc<RgbaImageBuffer>,
        pin: bool,
    ) -> EvictionReport {
        let bytes = image.byte_len();
        let existing_is_pinned = self
            .entries
            .get(&key)
            .is_some_and(|entry| entry.pin_count > 0);
        // Skip unpinned entries that cannot fit in the remaining unpinned budget
        // without evicting live cache items and then immediately evicting themselves.
        if !pin
            && !existing_is_pinned
            && (self.limits.max_entries == 0
                || self.pinned_entries >= self.limits.max_entries
                || self.pinned_bytes.saturating_add(bytes) > self.limits.max_bytes)
        {
            return EvictionReport::default();
        }
        let tick = self.next_tick();

        if let Some(existing) = self.entries.get_mut(&key) {
            self.total_bytes = self.total_bytes.saturating_sub(existing.bytes) + bytes;
            if existing.pin_count > 0 {
                self.pinned_bytes = self.pinned_bytes.saturating_sub(existing.bytes) + bytes;
            } else if pin {
                self.pinned_entries += 1;
                self.pinned_bytes += bytes;
            }
            if pin {
                existing.pin_count += 1;
            }
            existing.image = image;
            existing.bytes = bytes;
            existing.last_touch = tick;
        } else {
            let pin_count = usize::from(pin);
            if pin {
                self.pinned_entries += 1;
                self.pinned_bytes += bytes;
            }
            self.total_bytes += bytes;
            self.entries.insert(
                key,
                CacheEntry {
                    image,
                    bytes,
                    pin_count,
                    last_touch: tick,
                },
            );
        }

        self.evict_if_needed()
    }

    fn evict_if_needed(&mut self) -> EvictionReport {
        let mut report = EvictionReport::default();

        while self.entries.len() > self.limits.max_entries
            || self.total_bytes > self.limits.max_bytes
        {
            let victim = self
                .entries
                .iter()
                .filter(|(_, entry)| entry.pin_count == 0)
                .min_by_key(|(_, entry)| entry.last_touch)
                .map(|(key, _)| key.clone());

            let Some(victim_key) = victim else {
                break;
            };

            if let Some(removed) = self.entries.remove(&victim_key) {
                self.total_bytes = self.total_bytes.saturating_sub(removed.bytes);
                report.evicted_entries += 1;
                report.evicted_bytes += removed.bytes;
            }
        }

        report
    }

    fn next_tick(&mut self) -> u64 {
        self.clock = self.clock.wrapping_add(1);
        self.clock
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_buffer(width: u32, height: u32) -> Arc<RgbaImageBuffer> {
        Arc::new(RgbaImageBuffer {
            width_px: width,
            height_px: height,
            logical_width: width as f32,
            logical_height: height as f32,
            pixels: vec![0u8; (width * height * 4) as usize],
        })
    }

    #[test]
    fn enforces_entry_and_byte_limits_with_lru_order() {
        let mut cache = PinnedPixelCache::new(CacheLimits {
            max_entries: 2,
            max_bytes: 1024,
        });
        cache.insert("a", dummy_buffer(4, 4)); // 64 bytes
        cache.insert("b", dummy_buffer(4, 4)); // 64 bytes
        // Touch "a" so "b" becomes least recently used.
        assert!(cache.get(&"a").is_some());
        let report = cache.insert("c", dummy_buffer(4, 4));
        assert_eq!(report.evicted_entries, 1);
        assert_eq!(report.evicted_bytes, 64);
        assert!(cache.get(&"b").is_none());
        assert!(cache.get(&"a").is_some());
        assert!(cache.get(&"c").is_some());

        // Now trigger byte limit eviction (max_bytes = 128).
        let mut byte_cache = PinnedPixelCache::new(CacheLimits {
            max_entries: 10,
            max_bytes: 128,
        });
        byte_cache.insert("x", dummy_buffer(4, 4)); // 64
        byte_cache.insert("y", dummy_buffer(4, 4)); // 64 -> total 128
        let report = byte_cache.insert("z", dummy_buffer(4, 8)); // 128 -> evicts x and y
        assert_eq!(report.evicted_entries, 2);
        assert_eq!(byte_cache.len(), 1);
        assert_eq!(byte_cache.total_bytes(), 128);
        assert!(byte_cache.get(&"z").is_some());
    }

    #[test]
    fn pinned_entries_are_never_evicted_until_released() {
        let mut cache = PinnedPixelCache::new(CacheLimits {
            max_entries: 2,
            max_bytes: 128,
        });
        cache.insert_pinned("pinned-1", dummy_buffer(4, 4)); // 64
        assert!(cache.acquire_pin(&"pinned-1")); // pin_count = 2
        cache.insert_pinned("pinned-2", dummy_buffer(4, 4)); // 64
        cache.insert("unpinned", dummy_buffer(4, 4)); // exceeds both limits

        // Unpinned entry is evicted immediately, both pinned entries stay.
        assert_eq!(cache.len(), 2);
        assert_eq!(cache.pinned_count(), 2);
        assert!(cache.is_pinned(&"pinned-1"));
        assert!(cache.is_pinned(&"pinned-2"));

        // Inserting a third pinned entry exceeds limits without evicting any pinned item.
        cache.insert_pinned("pinned-3", dummy_buffer(4, 4));
        assert_eq!(cache.len(), 3);
        assert_eq!(cache.total_bytes(), 192);

        // First release on pinned-1 keeps it pinned (refcount 2 -> 1).
        assert!(cache.release_pin(&"pinned-1"));
        assert_eq!(cache.pin_count(&"pinned-1"), 1);
        assert_eq!(cache.len(), 3);

        // Second release drops refcount to 0 and triggers immediate eviction.
        assert!(cache.release_pin(&"pinned-1"));
        assert_eq!(cache.len(), 2);
        assert_eq!(cache.total_bytes(), 128);
        assert!(cache.get(&"pinned-1").is_none());
    }

    #[test]
    fn oversized_unpinned_entry_does_not_wipe_existing_cache() {
        let mut cache = PinnedPixelCache::new(CacheLimits {
            max_entries: 4,
            max_bytes: 128,
        });
        cache.insert("keep-1", dummy_buffer(4, 4)); // 64 bytes
        cache.insert("keep-2", dummy_buffer(4, 4)); // 64 bytes

        // Unpinned 256-byte image exceeds max_bytes (128); must skip without evicting live entries.
        let report = cache.insert("too-big", dummy_buffer(8, 8));
        assert_eq!(report, EvictionReport::default());
        assert_eq!(cache.len(), 2);
        assert_eq!(cache.total_bytes(), 128);
        assert!(cache.get(&"keep-1").is_some());
        assert!(cache.get(&"keep-2").is_some());
        assert!(cache.get(&"too-big").is_none());
    }

    #[test]
    fn remaining_budget_after_pinned_entries_protects_live_unpinned_entries() {
        let mut cache = PinnedPixelCache::new(CacheLimits {
            max_entries: 4,
            max_bytes: 1000,
        });
        cache.insert_pinned("pinned", dummy_buffer(20, 10)); // 800 bytes pinned
        cache.insert("A", dummy_buffer(10, 5)); // 200 bytes unpinned -> total 1000 bytes

        // Remaining unpinned budget is 200 B; inserting a 300 B unpinned entry must skip
        // rather than evicting live entry A and then immediately evicting itself.
        let report = cache.insert("new", dummy_buffer(15, 5)); // 300 bytes
        assert_eq!(report, EvictionReport::default());
        assert!(cache.get(&"new").is_none());
        assert!(cache.get(&"A").is_some());
        assert!(cache.is_pinned(&"pinned"));
        assert_eq!(cache.len(), 2);
        assert_eq!(cache.total_bytes(), 1000);

        // Updating an already-pinned key via `insert` must still update its buffer.
        let updated_pinned = dummy_buffer(20, 10);
        let _ = cache.insert("pinned", Arc::clone(&updated_pinned));
        assert!(Arc::ptr_eq(&cache.get(&"pinned").unwrap(), &updated_pinned));
        assert!(cache.is_pinned(&"pinned"));
    }
}
