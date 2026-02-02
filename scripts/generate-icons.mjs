import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// Read SVG
const svgPath = join(rootDir, 'app-store', 'icon-new.svg')
const svgBuffer = readFileSync(svgPath)

// Generate icons at different sizes
const sizes = [
  { size: 192, output: 'public/icon-192.png' },
  { size: 512, output: 'public/icon-512.png' },
  { size: 180, output: 'public/apple-touch-icon.png' },
  { size: 1024, output: 'app-store/icon-1024-new.png' },
  // iOS app icon sizes
  { size: 20, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-20@1x.png' },
  { size: 40, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-20@2x.png' },
  { size: 60, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-20@3x.png' },
  { size: 29, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-29@1x.png' },
  { size: 58, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-29@2x.png' },
  { size: 87, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-29@3x.png' },
  { size: 40, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-40@1x.png' },
  { size: 80, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-40@2x.png' },
  { size: 120, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-40@3x.png' },
  { size: 120, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-60@2x.png' },
  { size: 180, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-60@3x.png' },
  { size: 76, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-76@1x.png' },
  { size: 152, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-76@2x.png' },
  { size: 167, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-83.5@2x.png' },
  { size: 1024, output: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-1024@1x.png' },
]

async function generateIcons() {
  for (const { size, output } of sizes) {
    const outputPath = join(rootDir, output)

    try {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath)

      console.log(`Generated: ${output} (${size}x${size})`)
    } catch (err) {
      console.error(`Failed to generate ${output}:`, err.message)
    }
  }

  console.log('Done!')
}

generateIcons()
