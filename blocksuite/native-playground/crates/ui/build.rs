fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo::rustc-check-cfg=cfg(gles)");
    println!("cargo::rustc-check-cfg=cfg(gpui_leak_detection)");
    println!("cargo::rerun-if-env-changed=GPUI_LEAK_DETECTION");

    let requested_by_environment =
        std::env::var_os("GPUI_LEAK_DETECTION").is_some_and(|value| !value.is_empty());
    if requested_by_environment || std::env::var_os("CARGO_FEATURE_LEAK_DETECTION").is_some() {
        println!("cargo::rustc-cfg=gpui_leak_detection");
    }

    #[cfg(target_os = "macos")]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        apple_build::run();
    }
}

#[cfg(target_os = "macos")]
#[path = "src/platform/apple/fast/rounded_clip_shader.rs"]
mod fast_rounded_clip_shader;

#[cfg(target_os = "macos")]
mod apple_build {
    #[cfg(not(feature = "runtime_shaders"))]
    use std::ffi::OsString;
    use std::{
        env,
        path::{Path, PathBuf},
    };

    use cbindgen::Config;

    use crate::fast_rounded_clip_shader;

    pub fn run() {
        let header_path = generate_shader_bindings();

        #[cfg(feature = "runtime_shaders")]
        emit_stitched_shaders(&header_path);
        #[cfg(not(feature = "runtime_shaders"))]
        compile_metal_shaders(&header_path);
    }

    fn generate_shader_bindings() -> PathBuf {
        let output_path = PathBuf::from(env::var("OUT_DIR").unwrap()).join("scene.h");
        let crate_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());

        let mut config = Config {
            include_guard: Some("SCENE_H".into()),
            language: cbindgen::Language::C,
            no_includes: true,
            ..Default::default()
        };
        config.export.include.extend([
            "Bounds".into(),
            "Corners".into(),
            "Edges".into(),
            "Size".into(),
            "Pixels".into(),
            "PointF".into(),
            "Hsla".into(),
            "ContentMask".into(),
            "Uniforms".into(),
            "AtlasTile".into(),
            "PathRasterizationInputIndex".into(),
            "PathVertex_ScaledPixels".into(),
            "PathRasterizationVertex".into(),
            "ShadowInputIndex".into(),
            "Shadow".into(),
            "QuadInputIndex".into(),
            "Underline".into(),
            "UnderlineInputIndex".into(),
            "Quad".into(),
            "BorderStyle".into(),
            "SpriteInputIndex".into(),
            "MonochromeSprite".into(),
            "PolychromeSprite".into(),
            "PathSprite".into(),
            "SurfaceInputIndex".into(),
            "SurfaceBounds".into(),
            "TransformationMatrix".into(),
        ]);
        config.no_includes = true;
        config.enumeration.prefix_with_name = true;

        let mut builder = cbindgen::Builder::new();
        let src_paths = [
            crate_dir.join("src/scene.rs"),
            crate_dir.join("src/geometry.rs"),
            crate_dir.join("src/color.rs"),
            crate_dir.join("src/window.rs"),
            crate_dir.join("src/platform.rs"),
            crate_dir.join("src/platform/apple/metal_renderer.rs"),
        ];

        for src_path in &src_paths {
            println!("cargo:rerun-if-changed={}", src_path.display());
            builder = builder.with_src(src_path);
        }

        builder
            .with_config(config)
            .generate()
            .expect("Unable to generate Metal shader bindings")
            .write_to_file(&output_path);

        output_path
    }

    #[cfg(feature = "runtime_shaders")]
    fn emit_stitched_shaders(header_path: &Path) {
        let shader_path = Path::new("./src/platform/apple/shaders.metal");
        let header_contents = std::fs::read_to_string(header_path).unwrap();
        let shader_contents =
            fast_rounded_clip_shader::source(&std::fs::read_to_string(shader_path).unwrap());
        let stitched_contents = format!("{header_contents}\n{shader_contents}");
        let out_path = PathBuf::from(env::var("OUT_DIR").unwrap()).join("stitched_shaders.metal");
        std::fs::write(&out_path, stitched_contents).unwrap();
        println!("cargo:rerun-if-changed={}", shader_path.display());
    }

    #[cfg(not(feature = "runtime_shaders"))]
    fn compile_metal_shaders(header_path: &Path) {
        use std::process::{self, Command};

        println!("cargo:rerun-if-env-changed=SDKROOT");
        println!("cargo:rerun-if-env-changed=DEVELOPER_DIR");

        let sdk = env::var_os("SDKROOT").unwrap_or_else(|| OsString::from("macosx"));
        let shader_path = "./src/platform/apple/shaders.metal";
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
        let air_output_path = out_dir.join("shaders.air");
        let metallib_output_path = out_dir.join("shaders.metallib");
        println!("cargo:rerun-if-changed={shader_path}");

        let staged_shader_path = out_dir.join("shaders.metal");
        fast_rounded_clip_shader::stage(shader_path, &staged_shader_path);

        let output = Command::new("xcrun")
            .current_dir(&out_dir)
            .arg("-sdk")
            .arg(&sdk)
            .args([
                "metal",
                "-gline-tables-only",
                "-mmacosx-version-min=12.0",
                "-MO",
                "-c",
            ])
            .arg(&staged_shader_path)
            .args(["-include", header_path.to_str().unwrap(), "-o"])
            .arg(&air_output_path)
            .output()
            .unwrap();

        if !output.status.success() {
            println!(
                "cargo::error=metal shader compilation failed:\n{}",
                String::from_utf8_lossy(&output.stderr)
            );
            process::exit(1);
        }

        let output = Command::new("xcrun")
            .current_dir(&out_dir)
            .arg("-sdk")
            .arg(&sdk)
            .arg("metallib")
            .arg(&air_output_path)
            .arg("-o")
            .arg(metallib_output_path)
            .output()
            .unwrap();

        if !output.status.success() {
            println!(
                "cargo::error=metallib compilation failed:\n{}",
                String::from_utf8_lossy(&output.stderr)
            );
            process::exit(1);
        }

        std::fs::remove_file(&air_output_path).unwrap();
    }
}
