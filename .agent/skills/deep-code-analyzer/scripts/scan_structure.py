#!/usr/bin/env python3
"""
Deep Code Analyzer - Structure Scanner

Scans a project directory and collects structural metadata into a JSON file.
This script captures directory layout, file type distribution, package metadata,
and configuration files without reading full file contents.

Usage:
    python3 scan_structure.py <project-root> [--output <output-dir>] [--max-depth <n>] [--include-hidden]
"""

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Directories to always skip
SKIP_DIRS = {
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".yarn",
    "__pycache__",
    ".cache",
    ".turbo",
    "coverage",
    ".nyc_output",
    ".parcel-cache",
    "vendor",
    ".tox",
    ".eggs",
    "egg-info",
    ".venv",
    "venv",
    "env",
}

# Hidden dirs to include even when --include-hidden is not set
HIDDEN_ALLOW_LIST = {".github", ".vscode", ".devcontainer", ".docker", ".agent"}

# Manifest files that indicate a package/module
MANIFEST_FILES = {
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "CMakeLists.txt",
    "Makefile",
}

# Config files worth noting
CONFIG_FILES = {
    "tsconfig.json",
    "tsconfig.*.json",
    "vite.config.*",
    "vitest.config.*",
    "webpack.config.*",
    "jest.config.*",
    "eslint.config.*",
    ".eslintrc.*",
    ".prettierrc",
    ".prettierrc.*",
    "prettier.config.*",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    ".env",
    ".env.*",
    "rust-toolchain.toml",
    "rustfmt.toml",
    "clippy.toml",
}

# Entry point file patterns
ENTRY_POINTS = {
    "index.ts",
    "index.tsx",
    "index.js",
    "index.jsx",
    "main.ts",
    "main.tsx",
    "main.js",
    "main.jsx",
    "app.ts",
    "app.tsx",
    "app.js",
    "app.jsx",
    "lib.rs",
    "main.rs",
    "mod.rs",
    "main.py",
    "app.py",
    "__init__.py",
    "main.go",
    "server.ts",
    "server.js",
}


def should_skip_dir(dirname: str, include_hidden: bool) -> bool:
    """Determine if a directory should be skipped during scanning."""
    if dirname in SKIP_DIRS:
        return True
    if dirname.startswith("."):
        if dirname in HIDDEN_ALLOW_LIST:
            return False
        return not include_hidden
    return False


def get_file_extension(filename: str) -> str:
    """Get normalized file extension."""
    _, ext = os.path.splitext(filename)
    return ext.lower() if ext else "(no extension)"


def read_json_file(filepath: Path) -> dict | None:
    """Safely read and parse a JSON file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError, OSError):
        return None


def read_toml_basic(filepath: Path) -> dict:
    """Basic TOML reading for key fields (name, version, description)."""
    result = {}
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            current_section = ""
            for line in f:
                line = line.strip()
                if line.startswith("["):
                    current_section = line.strip("[]").strip()
                elif "=" in line and current_section in ("", "package", "project"):
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key in ("name", "version", "description"):
                        result[key] = value
    except (UnicodeDecodeError, OSError):
        pass
    return result


def scan_directory(
    root: Path, max_depth: int, include_hidden: bool
) -> dict:
    """Scan the project directory and collect structural metadata."""
    result = {
        "scan_timestamp": datetime.now(timezone.utc).isoformat(),
        "project_root": str(root.resolve()),
        "directory_tree": [],
        "file_type_counts": {},
        "total_files": 0,
        "total_dirs": 0,
        "packages": [],
        "config_files": [],
        "entry_points": [],
        "notable_files": [],
    }

    file_extensions = Counter()
    all_entries = []
    packages = []
    config_files_found = []
    entry_points_found = []

    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        depth = 0 if rel_dir == "." else rel_dir.count(os.sep) + 1

        if depth > max_depth:
            dirnames.clear()
            continue

        # Filter directories
        dirnames[:] = sorted(
            [d for d in dirnames if not should_skip_dir(d, include_hidden)]
        )

        result["total_dirs"] += 1

        dir_entry = {
            "path": rel_dir if rel_dir != "." else ".",
            "depth": depth,
            "subdirs": list(dirnames),
            "file_count": len(filenames),
        }
        all_entries.append(dir_entry)

        for filename in sorted(filenames):
            filepath = Path(dirpath) / filename
            result["total_files"] += 1

            ext = get_file_extension(filename)
            file_extensions[ext] += 1

            # Check for manifest files
            if filename in MANIFEST_FILES:
                pkg_info = {
                    "manifest": filename,
                    "path": rel_dir,
                    "full_path": str(filepath),
                }

                if filename == "package.json":
                    data = read_json_file(filepath)
                    if data:
                        pkg_info["name"] = data.get("name", "")
                        pkg_info["version"] = data.get("version", "")
                        pkg_info["description"] = data.get("description", "")
                        pkg_info["private"] = data.get("private", False)
                        pkg_info["scripts"] = list(
                            data.get("scripts", {}).keys()
                        )
                        pkg_info["dependencies_count"] = len(
                            data.get("dependencies", {})
                        )
                        pkg_info["devDependencies_count"] = len(
                            data.get("devDependencies", {})
                        )
                elif filename in ("Cargo.toml", "pyproject.toml"):
                    data = read_toml_basic(filepath)
                    pkg_info.update(data)

                packages.append(pkg_info)

            # Check for config files
            if filename in CONFIG_FILES or any(
                filename.startswith(cf.split("*")[0])
                for cf in CONFIG_FILES
                if "*" in cf
            ):
                config_files_found.append(
                    {"file": filename, "path": rel_dir}
                )

            # Check for entry points
            if filename in ENTRY_POINTS:
                entry_points_found.append(
                    {"file": filename, "path": rel_dir}
                )

    result["directory_tree"] = all_entries
    result["file_type_counts"] = dict(
        file_extensions.most_common()
    )
    result["packages"] = packages
    result["config_files"] = config_files_found
    result["entry_points"] = entry_points_found

    # Add notable files (README, LICENSE, etc.)
    for notable in [
        "README.md",
        "README",
        "LICENSE",
        "LICENSE.md",
        "CHANGELOG.md",
        "CONTRIBUTING.md",
        "SECURITY.md",
        "CODE_OF_CONDUCT.md",
    ]:
        if (root / notable).exists():
            result["notable_files"].append(notable)

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Scan project structure and collect metadata"
    )
    parser.add_argument(
        "project_root",
        help="Path to the project root directory",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output directory for structure_data.json (default: <project-root>/.agent/docs/)",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=6,
        help="Maximum directory depth to scan (default: 6)",
    )
    parser.add_argument(
        "--include-hidden",
        action="store_true",
        help="Include hidden directories beyond the allow list",
    )

    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    if not project_root.is_dir():
        print(f"Error: {project_root} is not a valid directory", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(args.output) if args.output else project_root / ".agent" / "docs"
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"🔍 Scanning: {project_root}")
    print(f"   Max depth: {args.max_depth}")
    print(f"   Include hidden: {args.include_hidden}")
    print()

    data = scan_directory(project_root, args.max_depth, args.include_hidden)

    output_file = output_dir / "structure_data.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"✅ Scan complete!")
    print(f"   Total files: {data['total_files']}")
    print(f"   Total directories: {data['total_dirs']}")
    print(f"   Packages found: {len(data['packages'])}")
    print(f"   Config files: {len(data['config_files'])}")
    print(f"   Entry points: {len(data['entry_points'])}")
    print(f"   Output: {output_file}")


if __name__ == "__main__":
    main()
