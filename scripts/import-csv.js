// Reads a Schwab bank CSV export, cleans and categorizes transactions, deduplicates against
// existing Supabase data, and inserts only the new rows.
//
// Usage: node scripts/import-csv.js <path-to-csv>

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
dotenv.config({ path: path.join(ROOT, '.env.local') })

const TRANSFER_PATTERNS = ['Transfer', 'Zelle Transfer', 'Transfer to Venmo']
const INCOME_PATTERNS = ['Payroll', 'Dividend', 'Schwab', 'Tax Refund']

const NOISE_PATTERNS = [
  /^\d{6,7}\s+/, // leading 6-7 digit reference codes
  /^POS PREAUTH\s+/,
  /^POS PURCHASE\s+/,
  /^TST\*\s*/,
  /^SQ \*/,
  /\s+Dallas TX.*$/i,
]

const CATEGORY_RULES = [
  {
    name: 'Food',
    patterns: [
      'Chick-fil-A', 'Chipotle', 'Starbucks', '7 Brew', 'Taco Bell', 'Panera', "McDonald's",
      'Braums', "Portillo's", 'Van Leeuwen', 'Whataburger', 'In-N-Out', 'Burger', "McAlister's",
      'Crowns Bar', 'Village Bur', 'Violet Crown',
    ],
  },
  { name: 'Groceries', patterns: ["Trader Joe's", 'Walmart Grocery', 'Kroger', 'HEB', 'Aldi', 'Mercado Juarez'] },
  { name: 'Shopping', patterns: ['Amazon', 'Walmart', 'Target'] },
  { name: 'Media', patterns: ['Claude.ai', 'Anthropic', 'Washington Post', 'Audible', 'Spotify', 'Netflix', 'Hulu', 'GoDaddy'] },
  { name: 'Anna misc.', patterns: ['Flower', 'Gift'] },
  { name: 'Rock Climbing', patterns: ['Climbing'] },
  { name: 'Trips/Outings', patterns: ['Hotel', 'Topgolf', 'Prairielakes', 'Golf', 'Amusement'] },
]
const FALLBACK_CATEGORY = 'Miscellaneous'

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

const INCOME_CATEGORY = 'Employment'

function categorize(cleanedDescription, type) {
  // The spec's merchant-pattern table only covers expense categories; income credits
  // (paychecks, etc.) have nowhere else sensible to land.
  if (type === 'income') return { name: INCOME_CATEGORY, flagged: false }

  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => cleanedDescription.toLowerCase().includes(p.toLowerCase()))) {
      return { name: rule.name, flagged: false }
    }
  }
  return { name: FALLBACK_CATEGORY, flagged: true }
}

function parseUSDate(mdy) {
  const [m, d, y] = mdy.trim().split('/').map(Number)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function nextArchiveName(csvPath) {
  const dir = path.dirname(csvPath)
  const ext = path.extname(csvPath)
  const base = path.basename(csvPath, ext).replace(/\(\d+\)$/, '')
  let n = 1
  while (fs.existsSync(path.join(dir, `${base}(${n})${ext}`))) n++
  return path.join(dir, `${base}(${n})${ext}`)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const csvPath = args.find((a) => !a.startsWith('--'))
  if (!csvPath) {
    console.error('Usage: node scripts/import-csv.js <path-to-csv> [--dry-run]')
    process.exit(1)
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

  const connTxt = fs.readFileSync(path.join(ROOT, 'supabase connection.txt'), 'utf8')
  const email = connTxt.match(/email:\s*(.+)/)?.[1]?.trim()
  const password = connTxt.match(/password:\s*(.+)/)?.[1]?.trim()
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error('Sign in failed: ' + signInError.message)
  const userId = signInData.user.id

  const { data: categories, error: catErr } = await supabase.from('categories').select('id, name, type').eq('user_id', userId)
  if (catErr) throw new Error(catErr.message)
  const categoryByName = new Map(categories.map((c) => [c.name, c]))

  const raw = fs.readFileSync(csvPath, 'utf8')
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true })

  let dates = records.map((r) => parseUSDate(r['Post Date']))
  const minDate = dates.reduce((a, b) => (a < b ? a : b))
  const maxDate = dates.reduce((a, b) => (a > b ? a : b))

  const { data: existingTxns, error: existingErr } = await supabase
    .from('transactions')
    .select('date, amount, details')
    .eq('user_id', userId)
    .gte('date', minDate)
    .lte('date', maxDate)
  if (existingErr) throw new Error(existingErr.message)

  const existingKeys = new Set(
    existingTxns.map((t) => `${t.date}|${Number(t.amount)}|${(t.details ?? '').toLowerCase()}`),
  )

  const counts = { imported: 0, duplicate: 0, pending: 0, transfer: 0, refundCredit: 0 }
  const flagged = []
  const toInsert = []

  for (const row of records) {
    if (row['Status'] !== 'Posted') {
      counts.pending++
      continue
    }

    const description = row['Description'] ?? ''
    if (isTransfer(description)) {
      counts.transfer++
      continue
    }

    const debit = parseFloat(row['Debit'])
    const credit = parseFloat(row['Credit'])
    const isDebit = !Number.isNaN(debit)
    const isCredit = !Number.isNaN(credit)

    let type
    let amount
    if (isDebit) {
      type = 'expense'
      amount = debit
    } else if (isCredit) {
      if (!isIncomeCredit(description, row['Classification'])) {
        counts.refundCredit++
        continue
      }
      type = 'income'
      amount = credit
    } else {
      continue
    }

    const date = parseUSDate(row['Post Date'])
    const details = cleanDescription(description)
    const key = `${date}|${amount}|${details.toLowerCase()}`
    if (existingKeys.has(key)) {
      counts.duplicate++
      continue
    }

    const { name: categoryName, flagged: needsReview } = categorize(details, type)
    const category = categoryByName.get(categoryName)
    if (!category) {
      console.warn(`  WARNING: category "${categoryName}" not found in Supabase - skipping "${details}"`)
      continue
    }
    if (needsReview) {
      flagged.push({ details, amount, category: categoryName })
    }

    toInsert.push({
      user_id: userId,
      date,
      type,
      category_id: category.id,
      categoryName,
      amount,
      details,
    })
    existingKeys.add(key)
  }

  if (toInsert.length > 0 && !dryRun) {
    const payload = toInsert.map(({ categoryName, ...row }) => row)
    const { error: insertErr } = await supabase.from('transactions').insert(payload)
    if (insertErr) throw new Error('Insert failed: ' + insertErr.message)
  }
  counts.imported = toInsert.length

  if (dryRun) {
    console.log('\n[DRY RUN - nothing written]\n\nWould import:')
    for (const row of toInsert) {
      console.log(`  ${row.date}  ${row.type.padEnd(7)}  ${row.amount.toFixed(2).padStart(9)}  ${row.categoryName.padEnd(14)}  ${row.details}`)
    }
  }
  console.log(`\n✓ Imported: ${counts.imported} transactions`)
  console.log(`⊘ Skipped (duplicate): ${counts.duplicate}`)
  console.log(`⊘ Skipped (pending): ${counts.pending}`)
  console.log(`⊘ Skipped (transfer): ${counts.transfer}`)
  console.log(`⊘ Skipped (refund/credit): ${counts.refundCredit}`)

  if (flagged.length > 0) {
    console.log('\n⚠ Flagged for review:')
    for (const f of flagged) {
      console.log(`  - ${f.details} ($${f.amount.toFixed(2)}) → categorized as ${f.category}, unknown merchant`)
    }
  }

  if (!dryRun) {
    const archivePath = nextArchiveName(csvPath)
    fs.renameSync(csvPath, archivePath)
    console.log(`\nArchived source file to ${archivePath}`)
  }
}

main().catch((err) => {
  console.error('\nIMPORT FAILED:', err.message)
  process.exit(1)
})
