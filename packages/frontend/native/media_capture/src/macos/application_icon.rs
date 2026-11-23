use napi::bindgen_prelude::{Buffer, Result};
use objc2::{
  Encode, Encoding, msg_send,
  rc::{Retained, autoreleasepool},
  runtime::{AnyClass, AnyObject},
};
use objc2_foundation::NSString;

#[repr(C)]
struct CGSize {
  width: f64,
  height: f64,
}

#[repr(C)]
struct CGPoint {
  x: f64,
  y: f64,
}

#[repr(C)]
struct CGRect {
  origin: CGPoint,
  size: CGSize,
}

unsafe impl Encode for CGSize {
  const ENCODING: Encoding = Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
}

unsafe impl Encode for CGPoint {
  const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
}

unsafe impl Encode for CGRect {
  const ENCODING: Encoding = Encoding::Struct("CGRect", &[<CGPoint>::ENCODING, <CGSize>::ENCODING]);
}

pub(super) fn application_icon(process_id: i32) -> Result<Buffer> {
  autoreleasepool(|_| {
    let running_app_class = match AnyClass::get(c"NSRunningApplication") {
      Some(class) => class,
      None => {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }
    };

    let running_app: *mut AnyObject = unsafe {
      msg_send![
        running_app_class,
        runningApplicationWithProcessIdentifier: process_id
      ]
    };
    if running_app.is_null() {
      return Ok(Buffer::from(Vec::<u8>::new()));
    }

    unsafe {
      let icon: *mut AnyObject = msg_send![running_app, icon];
      if icon.is_null() {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }

      let nsimage_class = match AnyClass::get(c"NSImage") {
        Some(class) => class,
        None => return Ok(Buffer::from(Vec::<u8>::new())),
      };

      let resized_image: *mut AnyObject = msg_send![nsimage_class, alloc];
      if resized_image.is_null() {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }

      let resized_image: *mut AnyObject = msg_send![resized_image, initWithSize: CGSize { width: 64.0, height: 64.0 }];
      let Some(resized_image) = Retained::from_raw(resized_image) else {
        return Ok(Buffer::from(Vec::<u8>::new()));
      };
      let _: () = msg_send![&*resized_image, lockFocus];

      let draw_rect = CGRect {
        origin: CGPoint { x: 0.0, y: 0.0 },
        size: CGSize {
          width: 64.0,
          height: 64.0,
        },
      };

      let from_rect = CGRect {
        origin: CGPoint { x: 0.0, y: 0.0 },
        size: CGSize {
          width: 0.0,
          height: 0.0,
        },
      };

      let _: () = msg_send![icon, drawInRect: draw_rect, fromRect: from_rect, operation: 2u64, fraction: 1.0];
      let _: () = msg_send![&*resized_image, unlockFocus];

      let tiff_data: *mut AnyObject = msg_send![&*resized_image, TIFFRepresentation];
      if tiff_data.is_null() {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }

      let bitmap_class = match AnyClass::get(c"NSBitmapImageRep") {
        Some(class) => class,
        None => return Ok(Buffer::from(Vec::<u8>::new())),
      };

      let bitmap: *mut AnyObject = msg_send![bitmap_class, imageRepWithData: tiff_data];
      if bitmap.is_null() {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }

      let dict_class = match AnyClass::get(c"NSMutableDictionary") {
        Some(class) => class,
        None => return Ok(Buffer::from(Vec::<u8>::new())),
      };

      let properties: *mut AnyObject = msg_send![dict_class, dictionary];
      if properties.is_null() {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }

      let compression_key = NSString::from_str("NSImageCompressionFactor");
      let number_class = match AnyClass::get(c"NSNumber") {
        Some(class) => class,
        None => return Ok(Buffer::from(Vec::<u8>::new())),
      };

      let compression_value: *mut AnyObject = msg_send![number_class, numberWithDouble: 0.8];
      if compression_value.is_null() {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }

      let _: () = msg_send![properties, setObject: compression_value, forKey: &*compression_key];

      let png_data: *mut AnyObject = msg_send![bitmap, representationUsingType: 4u64, properties: properties]; // 4 = PNG

      if png_data.is_null() {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }

      let bytes: *const libc::c_void = msg_send![png_data, bytes];
      let length: usize = msg_send![png_data, length];

      if bytes.is_null() {
        return Ok(Buffer::from(Vec::<u8>::new()));
      }

      let data = std::slice::from_raw_parts(bytes as *const u8, length).to_vec();
      Ok(Buffer::from(data))
    }
  })
}
