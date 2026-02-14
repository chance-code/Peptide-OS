#!/usr/bin/env npx tsx
// Debug script: Extract text from a PDF and run through the parser pipeline.
// Usage: npx tsx scripts/debug-pdf-parse.ts <path-to-pdf>

import { readFileSync } from 'fs'
import { resolve } from 'path'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: npx tsx scripts/debug-pdf-parse.ts <path-to-pdf>')
  process.exit(1)
}

async function main() {
  const absPath = resolve(filePath)
  console.log(`\n=== Reading PDF: ${absPath} ===\n`)

  const buffer = readFileSync(absPath)
  const data = new Uint8Array(buffer)

  // Extract text using unpdf (same as production)
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(data)
  const { text } = await extractText(pdf, { mergePages: false })
  const rawText = (text as string[]).join('\n')

  console.log('=== RAW EXTRACTED TEXT (with line numbers) ===\n')
  const lines = rawText.split('\n')
  lines.forEach((line, i) => {
    // Show whitespace characters visually
    const visible = line
      .replace(/\t/g, '→')
      .replace(/ {2,}/g, (m) => `·${m.length}·`)
    console.log(`${String(i + 1).padStart(4)}: ${visible}`)
  })

  console.log(`\n=== TOTAL LINES: ${lines.length} ===\n`)

  // Run source detection
  const { detectLabSource } = await import('../src/lib/labs/lab-parser-router')
  const detection = detectLabSource(rawText)
  console.log(`=== SOURCE DETECTION ===`)
  console.log(`  Source: ${detection.source}`)
  console.log(`  Confidence: ${detection.confidence}\n`)

  // Run the appropriate parser
  const { routeLabPDF } = await import('../src/lib/labs/lab-parser-router')
  const result = routeLabPDF(rawText)

  console.log(`=== PARSE RESULT ===`)
  console.log(`  Test Date: ${result.testDate}`)
  console.log(`  Lab Name: ${result.labName}`)
  console.log(`  Markers: ${result.markers.length}`)
  console.log(`  Overall Confidence: ${result.overallConfidence}`)
  console.log(`  Warnings: ${result.parseWarnings.length}`)

  if (result.markers.length > 0) {
    console.log('\n  Markers:')
    for (const m of result.markers) {
      console.log(`    - ${m.displayName}: ${m.value} ${m.unit} [${m.flag}] (key: ${m.normalizedKey}, conf: ${m.confidence})`)
    }
  }

  if (result.parseWarnings.length > 0) {
    console.log('\n  Warnings:')
    for (const w of result.parseWarnings) {
      console.log(`    ⚠ ${w}`)
    }
  }

  // Also run H&H parser directly for debugging
  const { parseHHLabsDocument } = await import('../src/lib/labs/hh-labs-parser')
  const doc = parseHHLabsDocument(rawText)

  console.log(`\n=== H&H PARSER DEBUG ===`)
  console.log(`  Patient: ${JSON.stringify(doc.patient)}`)
  console.log(`  Collected: ${doc.collectedAt}`)
  console.log(`  Panels: ${doc.panels.length}`)
  for (const panel of doc.panels) {
    console.log(`\n  Panel: ${panel.name}`)
    console.log(`    Specimen ID: ${panel.specimenId}`)
    console.log(`    Specimen Type: ${panel.specimenType}`)
    console.log(`    Tests: ${panel.tests.length}`)
    for (const t of panel.tests) {
      console.log(`      - ${t.name}: ${t.resultRaw} ${t.unit} (ref: ${t.referenceLow}-${t.referenceHigh})`)
    }
  }
}

main().catch(console.error)
