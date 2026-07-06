// One-time import: reads Personal_Budget.xlsx and populates categories, budget_amounts,
// transactions, and savings_goals for the authenticated user. Safe to inspect with --dry-run;
// aborts automatically if the account already has categories, to avoid double-importing.
//
// Usage: node scripts/migrate.cjs [--dry-run]

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const XLSX = require('xlsx')

const ROOT = path.join(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')

function parseEnvLocal() {
  const content = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const env = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match) env[match[1]] = match[2].trim()
  }
  return env
}

function parseConnectionTxt() {
  const content = fs.readFileSync(path.join(ROOT, 'supabase connection.txt'), 'utf8')
  const email = content.match(/email:\s*(.+)/)?.[1]?.trim()
  const password = content.match(/password:\s*(.+)/)?.[1]?.trim()
  return { email, password }
}

function excelSerialToISODate(serial) {
  const d = XLSX.SSF.parse_date_code(serial)
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
}

const TYPE_MAP = { Income: 'income', Expenses: 'expense', Savings: 'savings' }

// Transaction rows whose Category text doesn't match a Planning-grid category (found via
// inspection) get renamed/created rather than dropped. See PROGRESS.md for the reasoning.
const CATEGORY_RENAME = { '': 'Uncategorized', Income: 'Employment' }
const NEW_EXPENSE_CATEGORIES = ['Rock Climbing', 'Bachelor Trip', 'Shopping', 'Side Hustle Expenses', 'Uncategorized']

const PLANNING_SECTIONS = [
  { type: 'income', start: 9, end: 18 },
  { type: 'expense', start: 22, end: 31 },
  { type: 'savings', start: 35, end: 44 },
]
const YEAR_COL_OFFSETS = [2, 16, 30, 44, 58, 72]

async function main() {
  const env = parseEnvLocal()
  const { email, password } = parseConnectionTxt()
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error('Sign in failed: ' + signInError.message)
  const userId = signInData.user.id
  console.log('Signed in as', signInData.user.email)

  const { data: existingCats, error: existingErr } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
  if (existingErr) throw new Error(existingErr.message)
  if (existingCats.length > 0) {
    throw new Error(
      `Account already has ${existingCats.length} categories - aborting to avoid double-import. ` +
        'Delete existing data first if you really want to re-run this.',
    )
  }

  const wb = XLSX.readFile(path.join(ROOT, 'Personal_Budget.xlsx'))

  // ---------- 1. Settings ----------
  const settingsSheet = XLSX.utils.sheet_to_json(wb.Sheets['Settings'], { header: 1, raw: true, defval: '' })
  const startingYear = Number(settingsSheet[7][2])
  const shiftActive = String(settingsSheet[15][2]).trim().toLowerCase() === 'active'
  const shiftDay = Number(settingsSheet[17][2])
  const savingsMethodText = String(settingsSheet[21][2])
  const savingsMethod = savingsMethodText.includes('allocated to Savings') ? 'active' : 'passive'

  console.log('\nSettings:', { startingYear, shiftActive, shiftDay, savingsMethod })

  if (!DRY_RUN) {
    const { error } = await supabase.from('settings').upsert(
      {
        user_id: userId,
        starting_year: startingYear,
        shift_late_income_active: shiftActive,
        shift_late_income_day: shiftDay,
        savings_rate_method: savingsMethod,
      },
      { onConflict: 'user_id' },
    )
    if (error) throw new Error('Settings upsert failed: ' + error.message)
  }

  // ---------- 2. Categories ----------
  const bp = XLSX.utils.sheet_to_json(wb.Sheets['Budget Planning'], { header: 1, raw: true, defval: '' })

  const planningCategories = []
  for (const section of PLANNING_SECTIONS) {
    for (let r = section.start; r <= section.end; r++) {
      const name = String(bp[r][0]).trim()
      if (!name || name.startsWith('Enter ')) continue
      planningCategories.push({ type: section.type, name, rowIndex: r })
    }
  }

  const byType = { income: [], expense: [], savings: [] }
  for (const c of planningCategories) byType[c.type].push(c.name)
  for (const name of NEW_EXPENSE_CATEGORIES) byType.expense.push(name)

  const categoryRows = []
  for (const type of ['income', 'expense', 'savings']) {
    byType[type].forEach((name, i) => {
      categoryRows.push({ user_id: userId, type, name, sort_order: i })
    })
  }

  console.log(
    `\nCategories: ${categoryRows.length} total (${byType.income.length} income, ${byType.expense.length} expense, ${byType.savings.length} savings)`,
  )

  const categoryIdByKey = new Map()
  if (!DRY_RUN) {
    const { data: inserted, error } = await supabase.from('categories').insert(categoryRows).select('id, type, name')
    if (error) throw new Error('Category insert failed: ' + error.message)
    for (const row of inserted) categoryIdByKey.set(`${row.type}|${row.name}`, row.id)
  } else {
    for (const row of categoryRows) categoryIdByKey.set(`${row.type}|${row.name}`, `dry-run-${row.name}`)
  }

  // ---------- 3. Budget amounts ----------
  const budgetRows = []
  for (const cat of planningCategories) {
    for (let yearIdx = 0; yearIdx < 6; yearIdx++) {
      const year = startingYear + yearIdx
      const colBase = YEAR_COL_OFFSETS[yearIdx]
      for (let month = 1; month <= 12; month++) {
        const raw = bp[cat.rowIndex][colBase + (month - 1)]
        const amount = Number(raw) || 0
        if (amount === 0) continue
        budgetRows.push({
          category_id: categoryIdByKey.get(`${cat.type}|${cat.name}`),
          user_id: userId,
          year,
          month,
          amount,
        })
      }
    }
  }
  console.log(`\nBudget amounts: ${budgetRows.length} non-zero cells across 6 years`)

  if (!DRY_RUN) {
    for (let i = 0; i < budgetRows.length; i += 200) {
      const chunk = budgetRows.slice(i, i + 200)
      const { error } = await supabase.from('budget_amounts').insert(chunk)
      if (error) throw new Error('Budget amount insert failed: ' + error.message)
    }
  }

  // ---------- 4. Transactions ----------
  const bt = XLSX.utils.sheet_to_json(wb.Sheets['Budget Tracking'], { header: 1, raw: true, defval: '' })
  const transactionRows = []
  let skipped = 0
  for (let i = 11; i < bt.length; i++) {
    const rawType = bt[i][2]
    if (!rawType) continue
    const type = TYPE_MAP[rawType]
    if (!type) {
      skipped++
      continue
    }
    let categoryName = String(bt[i][3]).trim()
    categoryName = CATEGORY_RENAME[categoryName] ?? categoryName
    const categoryId = categoryIdByKey.get(`${type}|${categoryName}`)
    if (!categoryId) {
      console.warn(`  WARNING row ${i}: no category match for type=${type} name="${categoryName}" - skipping`)
      skipped++
      continue
    }

    transactionRows.push({
      user_id: userId,
      date: excelSerialToISODate(bt[i][1]),
      type,
      category_id: categoryId,
      amount: Number(bt[i][4]) || 0,
      details: bt[i][5] ? String(bt[i][5]).trim() : null,
    })
  }
  console.log(`\nTransactions: ${transactionRows.length} to import, ${skipped} skipped`)

  if (!DRY_RUN) {
    for (let i = 0; i < transactionRows.length; i += 200) {
      const chunk = transactionRows.slice(i, i + 200)
      const { error } = await supabase.from('transactions').insert(chunk)
      if (error) throw new Error('Transaction insert failed: ' + error.message)
    }
  }

  // ---------- 5. Savings goals ----------
  const sa = XLSX.utils.sheet_to_json(wb.Sheets['Savings Accounts'], { header: 1, raw: true, defval: '' })
  const goalSlots = [
    { nameCol: 0, amountCol: 1, goalCol: 1 },
    { nameCol: 4, amountCol: 5, goalCol: 5 },
    { nameCol: 8, amountCol: 9, goalCol: 9 },
  ]
  const savingsGoals = []
  goalSlots.forEach((slot, i) => {
    const name = String(sa[2][slot.nameCol]).trim()
    if (!name) return
    const current = Number(sa[3][slot.amountCol]) || 0
    const goal = Number(sa[4][slot.goalCol]) || 0
    savingsGoals.push({ user_id: userId, name, current_amount: current, goal_amount: goal, sort_order: i })
  })
  console.log(`\nSavings goals: ${JSON.stringify(savingsGoals.map((g) => g.name))}`)

  if (!DRY_RUN) {
    const { error } = await supabase.from('savings_goals').insert(savingsGoals)
    if (error) throw new Error('Savings goals insert failed: ' + error.message)
  }

  console.log(DRY_RUN ? '\nDRY RUN complete - nothing written.' : '\nMigration complete.')
}

main().catch((err) => {
  console.error('\nMIGRATION FAILED:', err.message)
  process.exit(1)
})
