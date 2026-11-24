use crate::{
    AtlasBackend, AtlasKey, AtlasState, AtlasTextureId, AtlasTextureKind, AtlasTextureList,
    AtlasTile, Bounds, DevicePixels, PlatformAtlas, Point, Size,
};
use anyhow::{Context as _, Result, ensure};
use etagere::BucketedAtlasAllocator;
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_metal::{
    MTLDevice, MTLOrigin, MTLPixelFormat, MTLRegion, MTLSize, MTLStorageMode, MTLTexture,
    MTLTextureDescriptor, MTLTextureUsage,
};
use parking_lot::Mutex;
use std::{borrow::Cow, ptr::NonNull};

pub struct MetalAtlas(Mutex<AtlasState<MetalAtlasTextures>>);

impl MetalAtlas {
    pub(crate) fn new(
        device: Retained<ProtocolObject<dyn MTLDevice>>,
        supports_shared_storage: bool,
    ) -> Self {
        MetalAtlas(Mutex::new(AtlasState::new(MetalAtlasTextures {
            device,
            supports_shared_storage,
            monochrome_textures: AtlasTextureList::default(),
            polychrome_textures: AtlasTextureList::default(),
        })))
    }

    /// Returns the GPU texture backing `id`, or `None` once every tile in it
    /// has been removed. A scene can still reference such a texture when a
    /// cached view replays a paint from before the image was dropped, so
    /// callers must skip those sprites rather than assume the texture exists.
    pub(crate) fn metal_texture(
        &self,
        id: AtlasTextureId,
    ) -> Option<Retained<ProtocolObject<dyn MTLTexture>>> {
        Some(self.0.lock().backend.texture(id)?.metal_texture.clone())
    }
}

struct MetalAtlasTextures {
    device: Retained<ProtocolObject<dyn MTLDevice>>,
    supports_shared_storage: bool,
    monochrome_textures: AtlasTextureList<MetalAtlasTexture>,
    polychrome_textures: AtlasTextureList<MetalAtlasTexture>,
}

impl PlatformAtlas for MetalAtlas {
    fn get_or_insert_with<'a>(
        &self,
        key: AtlasKey,
        build: &mut dyn FnMut() -> Result<Option<(Size<DevicePixels>, Cow<'a, [u8]>)>>,
    ) -> Result<Option<AtlasTile>> {
        self.0.lock().get_or_insert_with(key, build)
    }

    fn remove(&self, key: &AtlasKey) {
        self.0.lock().remove(key);
    }
}

impl AtlasBackend for MetalAtlasTextures {
    fn insert(
        &mut self,
        kind: AtlasTextureKind,
        size: Size<DevicePixels>,
        bytes: &[u8],
    ) -> Result<AtlasTile> {
        let upload = AtlasUpload::new(kind, size, bytes)?;
        let tile = self.allocate(size, kind)?;
        let texture = self
            .texture(tile.texture_id)
            .context("looking up allocated atlas texture")?;
        texture.upload(tile.bounds.origin, &upload)?;
        Ok(tile)
    }

    fn remove(&mut self, tile: AtlasTile) {
        let id = tile.texture_id;

        let textures = match id.kind {
            AtlasTextureKind::Monochrome => &mut self.monochrome_textures,
            AtlasTextureKind::Polychrome => &mut self.polychrome_textures,
            AtlasTextureKind::Subpixel => unreachable!(),
        };

        let Some(texture_slot) = textures
            .textures
            .iter_mut()
            .find(|texture| texture.as_ref().is_some_and(|v| v.id == id))
        else {
            return;
        };

        if let Some(mut texture) = texture_slot.take() {
            texture.allocator.deallocate(tile.tile_id.into());
            texture.decrement_ref_count();
            if texture.is_unreferenced() {
                textures.free_list.push(id.index as usize);
            } else {
                *texture_slot = Some(texture);
            }
        }
    }
}

impl MetalAtlasTextures {
    fn allocate(
        &mut self,
        size: Size<DevicePixels>,
        texture_kind: AtlasTextureKind,
    ) -> Result<AtlasTile> {
        {
            let textures = match texture_kind {
                AtlasTextureKind::Monochrome => &mut self.monochrome_textures,
                AtlasTextureKind::Polychrome => &mut self.polychrome_textures,
                AtlasTextureKind::Subpixel => unreachable!(),
            };

            if let Some(tile) = textures
                .iter_mut()
                .rev()
                .find_map(|texture| texture.allocate(size))
            {
                return Ok(tile);
            }
        }

        let texture = self.push_texture(size, texture_kind)?;
        texture.allocate(size).context("allocating atlas tile")
    }

    fn push_texture(
        &mut self,
        min_size: Size<DevicePixels>,
        kind: AtlasTextureKind,
    ) -> Result<&mut MetalAtlasTexture> {
        const DEFAULT_ATLAS_SIZE: Size<DevicePixels> = Size {
            width: DevicePixels(1024),
            height: DevicePixels(1024),
        };
        // Max texture size on all modern Apple GPUs. Anything bigger than that crashes in validateWithDevice.
        const MAX_ATLAS_SIZE: Size<DevicePixels> = Size {
            width: DevicePixels(16384),
            height: DevicePixels(16384),
        };
        let size = min_size.min(&MAX_ATLAS_SIZE).max(&DEFAULT_ATLAS_SIZE);
        let texture_descriptor = MTLTextureDescriptor::new();
        // SAFETY: Both dimensions are clamped to the existing 1024..=16384 atlas size limits.
        unsafe {
            texture_descriptor.setWidth(size.width.0 as usize);
            texture_descriptor.setHeight(size.height.0 as usize);
        }
        let pixel_format;
        let usage;
        match kind {
            AtlasTextureKind::Monochrome => {
                pixel_format = MTLPixelFormat::A8Unorm;
                usage = MTLTextureUsage::ShaderRead;
            }
            AtlasTextureKind::Polychrome => {
                pixel_format = MTLPixelFormat::BGRA8Unorm;
                usage = MTLTextureUsage::ShaderRead;
            }
            AtlasTextureKind::Subpixel => unreachable!(),
        }
        texture_descriptor.setPixelFormat(pixel_format);
        texture_descriptor.setUsage(usage);
        // Shared memory mode can be used only on Apple GPU families
        // https://developer.apple.com/documentation/metal/mtlresourceoptions/storagemodeshared
        texture_descriptor.setStorageMode(if self.supports_shared_storage {
            MTLStorageMode::Shared
        } else {
            MTLStorageMode::Managed
        });
        let metal_texture = self
            .device
            .newTextureWithDescriptor(&texture_descriptor)
            .context("allocating atlas texture")?;

        // Zero-initialize mip 0 to eliminate uninitialized GPU memory noise on
        // bilinear edge sampling across deterministic headless renders.
        let bytes_per_pixel = match kind {
            AtlasTextureKind::Monochrome => 1usize,
            AtlasTextureKind::Polychrome => 4usize,
            AtlasTextureKind::Subpixel => unreachable!(),
        };
        let width = size.width.0 as usize;
        let height = size.height.0 as usize;
        let bytes_per_row = width * bytes_per_pixel;
        let zero_buf = vec![0u8; bytes_per_row * height];
        let region = MTLRegion {
            origin: MTLOrigin { x: 0, y: 0, z: 0 },
            size: MTLSize {
                width,
                height,
                depth: 1,
            },
        };
        if let Some(ptr) = NonNull::new(zero_buf.as_ptr() as *mut std::ffi::c_void) {
            // SAFETY: `zero_buf` holds `bytes_per_row * height` initialized zero bytes matching `region`.
            unsafe {
                metal_texture.replaceRegion_mipmapLevel_withBytes_bytesPerRow(
                    region,
                    0,
                    ptr,
                    bytes_per_row,
                );
            }
        }

        let texture_list = match kind {
            AtlasTextureKind::Monochrome => &mut self.monochrome_textures,
            AtlasTextureKind::Polychrome => &mut self.polychrome_textures,
            AtlasTextureKind::Subpixel => unreachable!(),
        };

        let index = texture_list.free_list.pop().unwrap_or_else(|| {
            let index = texture_list.textures.len();
            texture_list.textures.push(None);
            index
        });

        let atlas_texture = MetalAtlasTexture {
            id: AtlasTextureId {
                index: index as u32,
                kind,
            },
            allocator: etagere::BucketedAtlasAllocator::new(size_to_etagere(size)),
            metal_texture,
            live_atlas_keys: 0,
        };

        Ok(texture_list.textures[index].insert(atlas_texture))
    }

    fn texture(&self, id: AtlasTextureId) -> Option<&MetalAtlasTexture> {
        let textures = match id.kind {
            AtlasTextureKind::Monochrome => &self.monochrome_textures,
            AtlasTextureKind::Polychrome => &self.polychrome_textures,
            AtlasTextureKind::Subpixel => unreachable!(),
        };
        textures.textures.get(id.index as usize)?.as_ref()
    }
}

struct MetalAtlasTexture {
    id: AtlasTextureId,
    allocator: BucketedAtlasAllocator,
    metal_texture: Retained<ProtocolObject<dyn MTLTexture>>,
    live_atlas_keys: u32,
}

impl MetalAtlasTexture {
    fn allocate(&mut self, size: Size<DevicePixels>) -> Option<AtlasTile> {
        let allocation = self.allocator.allocate(size_to_etagere(size))?;
        let tile = AtlasTile {
            texture_id: self.id,
            tile_id: allocation.id.into(),
            bounds: Bounds {
                origin: point_from_etagere(allocation.rectangle.min),
                size,
            },
            padding: 0,
        };
        self.live_atlas_keys += 1;
        Some(tile)
    }

    fn upload(&self, origin: Point<DevicePixels>, upload: &AtlasUpload<'_>) -> Result<()> {
        ensure!(
            self.id.kind == upload.kind,
            "atlas upload kind does not match texture"
        );
        ensure!(
            origin.x.0 >= 0
                && origin.y.0 >= 0
                && (origin.x.0 as usize)
                    .checked_add(upload.size.width.0 as usize)
                    .is_some_and(|end| end <= self.metal_texture.width())
                && (origin.y.0 as usize)
                    .checked_add(upload.size.height.0 as usize)
                    .is_some_and(|end| end <= self.metal_texture.height()),
            "atlas upload is outside texture bounds"
        );
        let region = MTLRegion {
            origin: MTLOrigin {
                x: origin.x.0 as usize,
                y: origin.y.0 as usize,
                z: 0,
            },
            size: MTLSize {
                width: upload.size.width.0 as usize,
                height: upload.size.height.0 as usize,
                depth: 1,
            },
        };
        // SAFETY: Validated bytes cover every row of the checked region in this CPU-accessible texture.
        // The borrowed bytes remain live for the copy; GPU ordering is a separate caller requirement.
        unsafe {
            self.metal_texture
                .replaceRegion_mipmapLevel_withBytes_bytesPerRow(
                    region,
                    0,
                    NonNull::from(upload.bytes).cast(),
                    upload.bytes_per_row,
                );
        }
        Ok(())
    }

    fn decrement_ref_count(&mut self) {
        self.live_atlas_keys -= 1;
    }

    fn is_unreferenced(&mut self) -> bool {
        self.live_atlas_keys == 0
    }
}

struct AtlasUpload<'a> {
    kind: AtlasTextureKind,
    size: Size<DevicePixels>,
    bytes: &'a [u8],
    bytes_per_row: usize,
}

impl<'a> AtlasUpload<'a> {
    fn new(kind: AtlasTextureKind, size: Size<DevicePixels>, bytes: &'a [u8]) -> Result<Self> {
        ensure!(
            size.width.0 > 0 && size.height.0 > 0,
            "atlas dimensions must be positive"
        );
        let bytes_per_pixel = match kind {
            AtlasTextureKind::Monochrome => 1,
            AtlasTextureKind::Polychrome => 4,
            AtlasTextureKind::Subpixel => unreachable!(),
        };
        let bytes_per_row = (size.width.0 as usize)
            .checked_mul(bytes_per_pixel)
            .context("calculating atlas row byte count")?;
        let byte_count = bytes_per_row
            .checked_mul(size.height.0 as usize)
            .context("calculating atlas byte count")?;
        ensure!(
            bytes.len() >= byte_count,
            "atlas upload byte length is {}, expected at least {byte_count}",
            bytes.len()
        );
        Ok(Self {
            kind,
            size,
            bytes,
            bytes_per_row,
        })
    }
}

fn size_to_etagere(size: Size<DevicePixels>) -> etagere::Size {
    etagere::Size::new(size.width.into(), size.height.into())
}

fn point_from_etagere(value: etagere::Point) -> Point<DevicePixels> {
    Point {
        x: DevicePixels::from(value.x),
        y: DevicePixels::from(value.y),
    }
}
