const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Premium app icon - dark background with glowing ring
// Inspired by Oura's clean aesthetic
async function generateIcons() {
  const sizes = [
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ];

  for (const { name, size } of sizes) {
    const padding = Math.round(size * 0.15);
    const ringSize = size - padding * 2;
    const strokeWidth = Math.round(size * 0.08);
    const radius = (ringSize - strokeWidth) / 2;
    const center = size / 2;

    // Calculate arc for ~75% completion look
    const circumference = 2 * Math.PI * radius;
    const arcLength = circumference * 0.75;
    const gapLength = circumference * 0.25;

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Background gradient -->
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1a1a2e"/>
            <stop offset="100%" style="stop-color:#0f0f1a"/>
          </linearGradient>

          <!-- Ring gradient - indigo to purple -->
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#818cf8"/>
            <stop offset="50%" style="stop-color:#6366f1"/>
            <stop offset="100%" style="stop-color:#a78bfa"/>
          </linearGradient>

          <!-- Glow filter -->
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="${size * 0.02}" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Rounded rectangle background -->
        <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bgGrad)"/>

        <!-- Subtle inner shadow -->
        <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="none"
              stroke="rgba(255,255,255,0.05)" stroke-width="1"/>

        <!-- Background ring track -->
        <circle cx="${center}" cy="${center}" r="${radius}"
                fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="${strokeWidth}"/>

        <!-- Main ring arc with glow -->
        <circle cx="${center}" cy="${center}" r="${radius}"
                fill="none"
                stroke="url(#ringGrad)"
                stroke-width="${strokeWidth}"
                stroke-linecap="round"
                stroke-dasharray="${arcLength} ${gapLength}"
                stroke-dashoffset="${circumference * 0.25}"
                filter="url(#glow)"
                transform="rotate(-90 ${center} ${center})"/>

        <!-- Center letter P -->
        <text x="${center}" y="${center + size * 0.08}"
              font-family="system-ui, -apple-system, sans-serif"
              font-size="${size * 0.32}"
              font-weight="700"
              fill="white"
              text-anchor="middle">P</text>
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
