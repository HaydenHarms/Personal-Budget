// Filters a bank CSV export (Post Date column, M/D/YYYY format) down to a date
// window, writing a new CSV so the original download is never touched or
// archived. Used to scope import-csv.js / compare-transactions.mjs to a
// specific range instead of a full multi-year account history.
//
// Usage:
//   node scripts/filter-csv-by-date.mjs <input.csv> <output.csv> --days=30
//   node scripts/filter-csv-by-date.mjs <input.csv> <output.csv> --start=2026-06-10 --end=2026-06-24

import fs from 'node:fs'
import { parse } from 'csv-parse/sync'

const [, , inputPath, outputPath, ...flags] = process.argv
if (!inputPath || !outputPath) {
  console.error('Usage: node filter-csv-by-date.mjs <input.csv> <output.csv> [--days=30] [--start=YYYY-MM-DD] [--end=YYYY-MM-DD]')
  process.exit(1)
}

const opts = Object.fromEntries(flags.map((f) => f.replace(/^--/, '').split('=')))

function parseUSDate(mdy) {
  const [m, d, y] = mdy.trim().split('/').map(Number)
  return new Date(y, m - 1, d)
}

let start, end
if (opts.days) {
  end = new Date()
  start = new Date()
  start.setDate(start.getDate() - Number(opts.days))
} else {
  start = opts.start ? new Date(opts.start) : new Date(0)
  end = opts.end ? new Date(opts.end) : new Date()
}

function csvField(value) {
  const s = value ?? ''
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const raw = fs.readFileSync(inputPath, 'utf8')
const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true })
const columns = Object.keys(records[0])

const filtered = records.filter((r) => {
  const d = parseUSDate(r['Post Date'])
  return d >= start && d <= end
})

const lines = [columns.map(csvField).join(',')]
for (const r of filtered) lines.push(columns.map((c) => csvField(r[c])).join(','))

fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8')
console.log(`${filtered.length} of ${records.length} rows kept (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)})`)
console.log(`Written to ${outputPath}`)
