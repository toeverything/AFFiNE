use std::ffi::CStr;
use std::path::PathBuf;

use objc2::{Message, class, msg_send, rc::Retained};
#[expect(
    deprecated,
    reason = "Preserve the existing file-copy pasteboard format"
)]
use objc2_app_kit::NSFilenamesPboardType;
use objc2_app_kit::{
    NSPasteboard, NSPasteboardNameFind, NSPasteboardTypePNG, NSPasteboardTypeString,
    NSPasteboardTypeTIFF,
};
use objc2_foundation::{NSArray, NSData, NSString};
use smallvec::SmallVec;
use strum::IntoEnumIterator as _;

use crate::{
    ClipboardEntry, ClipboardItem, ClipboardString, ExternalPaths, Image, ImageFormat, hash,
};

pub struct Pasteboard {
    inner: Retained<NSPasteboard>,
    text_hash_type: Retained<NSString>,
    metadata_type: Retained<NSString>,
}

impl Pasteboard {
    pub fn general() -> Option<Self> {
        let pasteboard: Option<Retained<NSPasteboard>> =
            unsafe { msg_send![class!(NSPasteboard), generalPasteboard] };
        pasteboard.map(Self::new)
    }

    pub fn find() -> Option<Self> {
        let pasteboard: Option<Retained<NSPasteboard>> =
            unsafe { msg_send![class!(NSPasteboard), pasteboardWithName: NSPasteboardNameFind] };
        pasteboard.map(Self::new)
    }

    fn new(inner: Retained<NSPasteboard>) -> Self {
        // These constructors return autoreleased objects, but a Pasteboard can
        // outlive the autorelease pool in which it was created.
        Self {
            inner,
            text_hash_type: NSString::from_str("zed-text-hash"),
            metadata_type: NSString::from_str("zed-metadata"),
        }
    }

    pub fn read(&self) -> Option<ClipboardItem> {
        unsafe {
            // Check for file paths first
            #[expect(
                deprecated,
                reason = "Preserve the existing file-copy pasteboard format"
            )]
            let filenames = self.inner.propertyListForType(NSFilenamesPboardType);
            if let Some(filenames) = filenames
                .as_ref()
                .and_then(|filenames| filenames.downcast_ref::<NSArray>())
            {
                let mut paths = SmallVec::new();
                for file in filenames {
                    if let Some(file) = file.downcast_ref::<NSString>() {
                        let path = file.UTF8String();
                        if path.is_null() {
                            continue;
                        }
                        let path = CStr::from_ptr(path).to_string_lossy().into_owned();
                        paths.push(PathBuf::from(path));
                    }
                }
                if !paths.is_empty() {
                    let mut entries = vec![ClipboardEntry::ExternalPaths(ExternalPaths(paths))];

                    // Also include the string representation so text editors can
                    // paste the path as text.
                    if let Some(string_item) = self.read_string_from_pasteboard() {
                        entries.push(string_item);
                    }

                    return Some(ClipboardItem { entries });
                }
            }

            // Next, check for a plain string.
            if let Some(string_entry) = self.read_string_from_pasteboard() {
                return Some(ClipboardItem {
                    entries: vec![string_entry],
                });
            }

            // Finally, try the various supported image types.
            for format in ImageFormat::iter() {
                if let Some(item) = self.read_image(format) {
                    return Some(item);
                }
            }
        }

        None
    }

    fn read_image(&self, format: ImageFormat) -> Option<ClipboardItem> {
        let ut_type = UTType::from(format);

        let types = self.inner.types()?;
        if types.containsObject(ut_type.inner()) {
            self.data_for_type(ut_type.inner()).map(|bytes| {
                let id = hash(&bytes);

                ClipboardItem {
                    entries: vec![ClipboardEntry::Image(Image { format, bytes, id })],
                }
            })
        } else {
            None
        }
    }

    fn read_string_from_pasteboard(&self) -> Option<ClipboardEntry> {
        let html_type = NSString::from_str("public.html");
        let html = self
            .data_for_type(&html_type)
            .and_then(|v| String::from_utf8(v).ok());
        let bytes = self.data_for_type(&NSString::from_str("public.utf8-plain-text"));
        if bytes.is_none() && html.is_none() {
            return None;
        }
        let text = String::from_utf8_lossy(bytes.as_deref().unwrap_or_default()).into_owned();
        let metadata = self
            .data_for_type(&self.text_hash_type)
            .and_then(|hash_bytes| {
                let hash_bytes = hash_bytes.as_slice().try_into().ok()?;
                let hash = u64::from_be_bytes(hash_bytes);
                let metadata = self.data_for_type(&self.metadata_type)?;

                if hash == ClipboardString::text_hash(&text) {
                    String::from_utf8(metadata).ok()
                } else {
                    None
                }
            })
            .or_else(|| html.map(|html| serde_json::json!({"text/html":html}).to_string()));

        Some(ClipboardEntry::String(ClipboardString { text, metadata }))
    }

    fn data_for_type(&self, kind: &NSString) -> Option<Vec<u8>> {
        self.inner.dataForType(kind).map(|data| data.to_vec())
    }

    pub fn write(&self, item: ClipboardItem) {
        match item.entries.as_slice() {
            [] => {
                // Writing an empty list of entries just clears the clipboard.
                self.inner.clearContents();
            }
            [ClipboardEntry::String(string)] => {
                self.write_plaintext(string);
            }
            [ClipboardEntry::Image(image)] => {
                self.write_image(image);
            }
            [ClipboardEntry::ExternalPaths(_)] => {}
            _ => {
                // Agus NB: We're currently only writing string entries to the clipboard when we have more than one.
                //
                // This was the existing behavior before I refactored the outer clipboard code:
                // https://github.com/zed-industries/zed/blob/65f7412a0265552b06ce122655369d6cc7381dd6/crates/gpui/src/platform/mac/platform.rs#L1060-L1110
                //
                // Note how `any_images` is always `false`. We should fix that, but that's orthogonal to the refactor.

                let mut combined = ClipboardString {
                    text: String::new(),
                    metadata: None,
                };

                for entry in item.entries {
                    match entry {
                        ClipboardEntry::String(text) => {
                            combined.text.push_str(&text.text());
                            if combined.metadata.is_none() {
                                combined.metadata = text.metadata;
                            }
                        }
                        _ => {}
                    }
                }

                self.write_plaintext(&combined);
            }
        }
    }

    fn write_plaintext(&self, string: &ClipboardString) {
        unsafe {
            self.inner.clearContents();

            let text_bytes = NSData::with_bytes(string.text.as_bytes());
            self.inner
                .setData_forType(Some(&text_bytes), NSPasteboardTypeString);

            if let Some(metadata) = string.metadata.as_ref() {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(metadata)
                    && let Some(html) = value["text/html"].as_str()
                {
                    self.inner.setData_forType(
                        Some(&NSData::with_bytes(html.as_bytes())),
                        &NSString::from_str("public.html"),
                    );
                }
                let hash_bytes = ClipboardString::text_hash(&string.text).to_be_bytes();
                let hash_bytes = NSData::with_bytes(&hash_bytes);
                self.inner
                    .setData_forType(Some(&hash_bytes), &self.text_hash_type);

                let metadata_bytes = NSData::with_bytes(metadata.as_bytes());
                self.inner
                    .setData_forType(Some(&metadata_bytes), &self.metadata_type);
            }
        }
    }

    fn write_image(&self, image: &Image) {
        self.inner.clearContents();

        let bytes = NSData::with_bytes(&image.bytes);

        self.inner
            .setData_forType(Some(&bytes), UTType::from(image.format).inner());
    }
}

impl From<ImageFormat> for UTType {
    fn from(value: ImageFormat) -> Self {
        match value {
            ImageFormat::Png => Self::png(),
            ImageFormat::Jpeg => Self::jpeg(),
            ImageFormat::Tiff => Self::tiff(),
            ImageFormat::Webp => Self::webp(),
            ImageFormat::Gif => Self::gif(),
            ImageFormat::Bmp => Self::bmp(),
            ImageFormat::Svg => Self::svg(),
            ImageFormat::Ico => Self::ico(),
            ImageFormat::Pnm => Self::pnm(),
        }
    }
}

// See https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/
pub struct UTType(Retained<NSString>);

impl UTType {
    pub fn png() -> Self {
        // https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/png
        Self(unsafe { NSPasteboardTypePNG }.retain()) // This is a rare case where there's a built-in NSPasteboardType
    }

    pub fn jpeg() -> Self {
        // https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/jpeg
        Self(NSString::from_str("public.jpeg"))
    }

    pub fn gif() -> Self {
        // https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/gif
        Self(NSString::from_str("com.compuserve.gif"))
    }

    pub fn webp() -> Self {
        // https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/webp
        Self(NSString::from_str("org.webmproject.webp"))
    }

    pub fn bmp() -> Self {
        // https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/bmp
        Self(NSString::from_str("com.microsoft.bmp"))
    }

    pub fn svg() -> Self {
        // https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/svg
        Self(NSString::from_str("public.svg-image"))
    }

    pub fn ico() -> Self {
        // https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/ico
        Self(NSString::from_str("com.microsoft.ico"))
    }

    pub fn tiff() -> Self {
        // https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/tiff
        Self(unsafe { NSPasteboardTypeTIFF }.retain()) // This is a rare case where there's a built-in NSPasteboardType
    }

    pub fn pnm() -> Self {
        //https://en.wikipedia.org/w/index.php?title=Netpbm&oldid=1336679433 under Uniform Type Identifier
        Self(NSString::from_str("public.pbm"))
    }

    fn inner(&self) -> &NSString {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn html_on_a_private_pasteboard_survives_plain_text_changes() {
        let board =
            Pasteboard::new(unsafe { msg_send![class!(NSPasteboard), pasteboardWithUniqueName] });
        let html = "<p><a href='https://example.org'>linked page</a></p>";
        board.write(ClipboardItem::new_string_with_json_metadata(
            "linked page".into(),
            serde_json::json!({"text/html":html,"reference":"page-id"}),
        ));
        let ty = NSString::from_str("public.html");
        assert_eq!(board.data_for_type(&ty).as_deref(), Some(html.as_bytes()));
        let read_metadata = || -> serde_json::Value {
            serde_json::from_str(board.read().unwrap().metadata().unwrap()).unwrap()
        };
        assert_eq!(read_metadata()["reference"], "page-id");
        board.inner.clearContents();
        board
            .inner
            .setData_forType(Some(&NSData::with_bytes(html.as_bytes())), &ty);
        assert_eq!(read_metadata()["text/html"], html);
        unsafe {
            let _: () = msg_send![&*board.inner, releaseGlobally];
        }
    }
}
