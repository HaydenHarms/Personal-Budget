// Compares the last-30-days filtered CSV against what's already in Supabase.
// Read-only: does not insert anything. Prints exact-key matches (safe dupes),
// same-date/same-amount "fuzzy" matches (possible dupes with different wording),
// and rows that look genuinely new.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
dotenv.config({ path: path.join(ROOT, '.env.local') })

const CSV_PATH = process.argv[2]
if (!CSV_PATH) {
  console.error('Usage: node compare-transactions.mjs <path-to-filtered-csv>')
  process.exit(1)
}

const TRANSFER_PATTERNS = ['Transfer', 'Zelle Transfer', 'Transfer to Venmo']
const INCOME_PATTERNS = ['Payroll', 'Dividend', 'Schwab', 'Tax Refund']
const NOISE_PATTERNS = [
  /^\d{6,7}\s+/,
  /^POS PREAUTH\s+/,
  /^POS PURCHASE\s+/,
  /^TST\*\s*/,
  /^SQ \*/,
  /\s+Dallas TX.*$/i,
]

function cleanDescription(raw) {
  let cleaned = raw.trim()
  for (const pattern of NOISE_PATTERNS) cleaned = cleaned.replace(pattern, '')
  cleaned = cleaned.replace(/&amp;/g, '&').trim()
  return cleaned
}
function isTransfer(description) {
  return TRANSFER_PATTERNS.some((p) => description.toLowerCase().includes(p.toLowerCase()))
}
function isIncomeCredit(description, classification) {
  if (classification && classification.toLowerCase().includes('paycheck')) return true
  return INCOME_PATTERNS.some((p) => description.toLowerCase().includes(p.toLowerCase()))
}
function parseUSDate(mdy) {
  const [m, d, y] = mdy.trim().split('/').map(Number)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

async function main() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const connTxt = fs.readFileSync(path.join(ROOT, 'supabase connection.txt'), 'utf8')
  const email = connTxt.match(/email:\s*(.+)/)?.[1]?.trim()
  const password = connTxt.match(/password:\s*(.+)/)?.[1]?.trim()
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error('Sign in failed: ' + signInError.message)
  const userId = signInData.user.id

  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true })

  const candidates = []
  for (const row of records) {
    if (row['Status'] !== 'Posted') continue
    const description = row['Description'] ?? ''
    if (isTransfer(description)) continue
    const debit = parseFloat(row['Debit'])
    const credit = parseFloat(row['Credit'])
    let type, amount
    if (!Number.isNaN(debit)) { type = 'expense'; amount = debit }
    else if (!Number.isNaN(credit)) {
      if (!isIncomeCredit(description, row['Classification'])) continue
      type = 'income'; amount = credit
    } else continue
    const date = parseUSDate(row['Post Date'])
    const details = cleanDescription(description)
    candidates.push({ date, type, amount, details })
  }

  const dates = candidates.map((c) => c.date)
  const minDate = dates.reduce((a, b) => (a < b ? a : b))
  const maxDate = dates.reduce((a, b) => (a > b ? a : b))

  const { data: existing, error: existErr } = await supabase
    .from('transactions')
    .select('date, amount, details, type')
    .eq('user_id', userId)
    .gte('date', minDate)
    .lte('date', maxDate)
  if (existErr) throw new Error(existErr.message)

  const exactKeys = new Set(existing.map((t) => `${t.date}|${Number(t.amount)}|${(t.details ?? '').toLowerCase()}`))
  const fuzzyMap = new Map()
  for (const t of existing) {
    const fk = `${t.date}|${Number(t.amount)}`
    if (!fuzzyMap.has(fk)) fuzzyMap.set(fk, [])
    fuzzyMap.get(fk).push(t.details)
  }

  const exactDup = []
  const fuzzyDup = []
  const genuinelyNew = []

  for (const c of candidates) {
    const exactKey = `${c.date}|${c.amount}|${c.details.toLowerCase()}`
    const fuzzyKey = `${c.date}|${c.amount}`
    if (exactKeys.has(exactKey)) {
      exactDup.push(c)
    } else if (fuzzyMap.has(fuzzyKey)) {
      fuzzyDup.push({ ...c, existingDetails: fuzzyMap.get(fuzzyKey) })
    } else {
      genuinelyNew.push(c)
    }
  }

  console.log(`DB range checked: ${minDate} to ${maxDate}`)
  console.log(`Existing transactions in that range: ${existing.length}`)
  console.log(`CSV candidate rows (posted, non-transfer, income/expense): ${candidates.length}\n`)

  console.log(`=== Exact duplicates (date+amount+details match — safe to skip): ${exactDup.length} ===`)
  for (const d of exactDup) console.log(`  ${d.date}  ${d.amount.toFixed(2).padStart(9)}  ${d.details}`)

  console.log(`\n=== Fuzzy matches (same date+amount, different wording — VERIFY THESE): ${fuzzyDup.length} ===`)
  for (const d of fuzzyDup) {
    console.log(`  ${d.date}  ${d.amount.toFixed(2).padStart(9)}  CSV: "${d.details}"  |  DB has: ${d.existingDetails.map((x) => `"${x}"`).join(', ')}`)
  }

  console.log(`\n=== Genuinely new (no match in DB): ${genuinelyNew.length} ===`)
  for (const d of genuinelyNew) console.log(`  ${d.date}  ${d.type.padEnd(7)}  ${d.amount.toFixed(2).padStart(9)}  ${d.details}`)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
