// Inserts a hand-reviewed JSON array of transactions (produced after dedup review
// and category correction) into Supabase. Strips the categoryName helper field
// before inserting since only category_id is a real column.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
dotenv.config({ path: path.join(ROOT, '.env.local') })

const JSON_PATH = process.argv[2]
if (!JSON_PATH) {
  console.error('Usage: node insert-reviewed-transactions.mjs <path-to-json>')
  process.exit(1)
}

async function main() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const connTxt = fs.readFileSync(path.join(ROOT, 'supabase connection.txt'), 'utf8')
  const email = connTxt.match(/email:\s*(.+)/)?.[1]?.trim()
  const password = connTxt.match(/password:\s*(.+)/)?.[1]?.trim()
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error('Sign in failed: ' + signInError.message)
  const userId = signInData.user.id

  const rows = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
  const payload = rows.map(({ categoryName, ...row }) => ({ ...row, user_id: userId }))

  const { data, error } = await supabase.from('transactions').insert(payload).select('id, date, amount, details')
  if (error) throw new Error('Insert failed: ' + error.message)

  console.log(`Inserted ${data.length} transactions:`)
  for (const t of data) console.log(`  ${t.id}  ${t.date}  ${Number(t.amount).toFixed(2).padStart(9)}  ${t.details}`)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
