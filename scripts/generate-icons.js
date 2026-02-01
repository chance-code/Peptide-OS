const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Premium app icon - clean, minimal design
// Inspired by modern health apps like Oura, Eight Sleep
async function generateIcons() {
  const sizes = [
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ];

  for (const { name, size } of sizes) {
    const center = size / 2;

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Background gradient - deep navy to dark -->
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1e1b4b"/>
            <stop offset="100%" style="stop-color:#0f0a1e"/>
          </linearGradient>

          <!-- Letter gradient - indigo/violet -->
          <linearGradient id="letterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#a78bfa"/>
            <stop offset="50%" style="stop-color:#818cf8"/>
            <stop offset="100%" style="stop-color:#6366f1"/>
          </linearGradient>

          <!-- Subtle glow -->
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="${size * 0.015}" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Rounded rectangle background -->
        <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bgGrad)"/>

        <!-- Subtle top highlight -->
        <rect x="${size * 0.1}" y="${size * 0.05}" width="${size * 0.8}" height="${size * 0.3}"
              rx="${size * 0.15}" fill="rgba(255,255,255,0.03)"/>

        <!-- Large stylized P with gradient -->
        <text x="${center}" y="${center + size * 0.15}"
              font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
              font-size="${size * 0.6}"
              font-weight="800"
              fill="url(#letterGrad)"
              text-anchor="middle"
              filter="url(#glow)">P</text>

        <!-- Small accent dot (like a molecule/peptide hint) -->
        <circle cx="${center + size * 0.18}" cy="${center - size * 0.15}"
                r="${size * 0.04}"
                fill="#22c55e"
                filter="url(#glow)"/>
      </svg>
    `;

    const outputPath = path.join(__dirname, '..', 'public', name);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`Generated ${name} (${size}x${size})`);
  }

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
