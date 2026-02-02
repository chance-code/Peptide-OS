import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const concepts = ['concept-1', 'concept-2', 'concept-3', 'concept-4']

async function generatePreviews() {
  for (const concept of concepts) {
    const svgPath = join(rootDir, 'app-store', `icon-${concept}.svg`)
    const outputPath = join(rootDir, 'app-store', `icon-${concept}.png`)

    const svgBuffer = readFileSync(svgPath)

    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile(outputPath)

    console.log(`Generated: ${concept}`)
  }
  console.log('Done!')
}

generatePreviews()
