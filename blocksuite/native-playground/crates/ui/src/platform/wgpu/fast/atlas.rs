//! Tiles bigger than the atlas can ever hold.
//!
//! Upstream's `WgpuAtlasTextures::allocate` makes a new texture when no existing
//! one has room for a tile, sized to the tile but clamped to the device's
//! `max_texture_dimension_2d`. For a tile wider or taller than that limit the
//! new texture can't hold it either: its allocation fails, the empty texture
//! stays in the atlas, nothing is cached, and the next frame that paints the
//! same image makes another one. An image of 32768 × 16384 thus adds a 16384²
//! RGBA texture (1 GiB) on every frame until the process runs out of memory.
//! `allocate` asks [`fits`] first and fails without making a texture.

use crate::{DevicePixels, Size};

/// Whether a tile of `size` can fit in a texture no bigger than
/// `max_texture_size` on each side.
pub(crate) fn fits(size: Size<DevicePixels>, max_texture_size: u32) -> bool {
    let max = i64::from(max_texture_size);
    i64::from(size.width.0) <= max && i64::from(size.height.0) <= max
}
