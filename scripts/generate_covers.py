"""
Generate static cover thumbnails from PDF files.

Scans data/book and data/paper directories, extracts the first page
of each PDF, and saves it as a WebP image in mylibpro/public/covers/.

Usage:
    pip install pymupdf   (if not installed)
    python scripts/generate_covers.py

The generated images are used as static assets by the frontend,
avoiding the need to load and render full PDFs in the browser.
"""

import os
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    print("❌ PyMuPDF not installed. Run: pip install pymupdf")
    sys.exit(1)

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)  # mylibpro

# Load .env.local
env_path = os.path.join(PROJECT_ROOT, ".env.local")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                parts = line.split("=", 1)
                if len(parts) == 2:
                    os.environ[parts[0].strip()] = parts[1].strip()

DATA_ROOT = os.environ.get("DATA_ROOT", os.path.join(os.path.dirname(PROJECT_ROOT), "data"))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "covers")

# Source directories
SOURCE_DIRS = [
    os.path.join(DATA_ROOT, "book"),
    os.path.join(DATA_ROOT, "paper"),
]

# Thumbnail settings
THUMB_WIDTH = 600  # pixels wide (height auto-calculated from aspect ratio)


def generate_cover(pdf_path: str, output_path: str) -> bool:
    """Extract first page of PDF and save as WebP thumbnail."""
    try:
        doc = fitz.open(pdf_path)
        if doc.page_count == 0:
            return False

        page = doc[0]

        # Calculate scale to achieve target width
        page_rect = page.rect
        scale = THUMB_WIDTH / page_rect.width
        matrix = fitz.Matrix(scale, scale)

        # Render page to pixmap
        pix = page.get_pixmap(matrix=matrix, alpha=False)

        # Save as WebP
        pix.save(output_path)

        doc.close()
        return True
    except Exception as e:
        print(f"   ✗ Error: {e}")
        return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    total_generated = 0
    total_skipped = 0
    total_errors = 0

    for source_dir in SOURCE_DIRS:
        if not os.path.isdir(source_dir):
            print(f"⚠ Directory not found: {source_dir}, skipping.")
            continue

        dir_name = os.path.basename(source_dir)
        folders = sorted([
            f for f in os.listdir(source_dir)
            if os.path.isdir(os.path.join(source_dir, f))
        ])

        print(f"\n📚 Scanning {dir_name}: {len(folders)} folders")

        for folder in folders:
            pdf_path = os.path.join(source_dir, folder, "original.pdf")
            output_path = os.path.join(OUTPUT_DIR, f"{folder}.png")

            # Skip if cover already exists and is newer than PDF
            if os.path.exists(output_path):
                pdf_mtime = os.path.getmtime(pdf_path) if os.path.exists(pdf_path) else 0
                cover_mtime = os.path.getmtime(output_path)
                if cover_mtime >= pdf_mtime:
                    total_skipped += 1
                    continue

            if not os.path.exists(pdf_path):
                print(f"   ⚠ No PDF: {folder}")
                total_errors += 1
                continue

            if generate_cover(pdf_path, output_path):
                total_generated += 1
                if total_generated % 10 == 0:
                    print(f"   ✓ Generated {total_generated} covers...")
            else:
                total_errors += 1
                print(f"   ✗ Failed: {folder}")

    print(f"\n✅ Done!")
    print(f"   Generated: {total_generated}")
    print(f"   Skipped (up-to-date): {total_skipped}")
    print(f"   Errors: {total_errors}")
    print(f"   Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
