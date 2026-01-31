#!/usr/bin/env python3
"""Generate Peptide OS app icon"""

from PIL import Image, ImageDraw

def create_icon(size=1024):
    # Create image with dark slate background
    img = Image.new('RGB', (size, size), '#0f172a')
    draw = ImageDraw.Draw(img)

    # Scale factor
    s = size / 1024

    # Rounded rectangle background (we'll just use the solid color for now)
    # The App Store will apply the rounded corners automatically

    # Gradient colors (we'll use solid teal/emerald)
    accent = '#22d3a8'  # Teal/emerald blend

    # Draw connecting lines (bonds) first so circles go on top
    line_width = int(24 * s)
    bonds = [
        ((380, 360), (450, 340)),
        ((574, 340), (644, 360)),
        ((340, 470), (380, 540)),
        ((684, 470), (644, 540)),
        ((460, 640), (500, 720)),
        ((564, 640), (524, 720)),
        ((470, 580), (554, 580)),
    ]

    for (x1, y1), (x2, y2) in bonds:
        draw.line(
            [(x1 * s, y1 * s), (x2 * s, y2 * s)],
            fill=accent,
            width=line_width
        )

    # Draw outer circles (amino acids)
    circles = [
        (320, 400, 80),
        (512, 320, 80),
        (704, 400, 80),
        (400, 600, 80),
        (624, 600, 80),
        (512, 780, 80),
    ]

    for cx, cy, r in circles:
        x0 = (cx - r) * s
        y0 = (cy - r) * s
        x1 = (cx + r) * s
        y1 = (cy + r) * s
        draw.ellipse([x0, y0, x1, y1], fill=accent)

    # Draw inner circles (nuclei - dark centers)
    inner_r = 32
    for cx, cy, _ in circles:
        x0 = (cx - inner_r) * s
        y0 = (cy - inner_r) * s
        x1 = (cx + inner_r) * s
        y1 = (cy + inner_r) * s
        draw.ellipse([x0, y0, x1, y1], fill='#0f172a')

    return img

if __name__ == '__main__':
    # Generate 1024x1024 icon
    icon = create_icon(1024)
    icon.save('app-store/icon-1024.png', 'PNG')
    print('Created app-store/icon-1024.png')

    # Also generate iOS icon sizes
    ios_sizes = [
        (20, 1), (20, 2), (20, 3),
        (29, 1), (29, 2), (29, 3),
        (40, 1), (40, 2), (40, 3),
        (60, 2), (60, 3),
        (76, 1), (76, 2),
        (83.5, 2),
        (1024, 1),
    ]

    import os
    os.makedirs('app-store/AppIcon.appiconset', exist_ok=True)

    contents = {
        "images": [],
        "info": {"author": "xcode", "version": 1}
    }

    for base_size, scale in ios_sizes:
        size = int(base_size * scale)
        filename = f"icon-{base_size}@{scale}x.png"

        icon_resized = create_icon(1024).resize((size, size), Image.Resampling.LANCZOS)
        icon_resized.save(f'app-store/AppIcon.appiconset/{filename}', 'PNG')

        idiom = "iphone" if base_size in [20, 29, 40, 60] else "ipad" if base_size in [76, 83.5] else "ios-marketing"

        contents["images"].append({
            "filename": filename,
            "idiom": idiom,
            "scale": f"{scale}x",
            "size": f"{base_size}x{base_size}"
        })

    import json
    with open('app-store/AppIcon.appiconset/Contents.json', 'w') as f:
        json.dump(contents, f, indent=2)

    print('Created app-store/AppIcon.appiconset/ with all iOS icon sizes')
