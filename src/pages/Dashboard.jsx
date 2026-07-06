import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TYPE_LABELS = { income: 'Income', expense: 'Expenses', savings: 'Savings' }
const SLICE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4']
const OTHER_COLOR = '#94a3b8'
const SERIES_COLORS = { income: '#22c55e', expense: '#ef4444', savings: '#3b82f6' }

function monthOf(dateStr) {
  return Number(dateStr.slice(5, 7))
}

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

export default function Dashboard() {
  const { user } = useAuth()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [categories, setCategories] = useState([])
  const [savingsMethod, setSavingsMethod] = useState('active')
  const [availableYears, setAvailableYears] = useState([currentYear])
  const [lastTxnDate, setLastTxnDate] = useState(null)
  const [budgetRows, setBudgetRows] = useState([])
  const [txns, setTxns] = useState([])

  const [yearMode, setYearMode] = useState('current')
  const [periodMode, setPeriodMode] = useState('total')

  const resolvedYear = yearMode === 'current' ? currentYear : yearMode
  const resolvedMonth = periodMode === 'total' ? null : periodMode === 'current-month' ? currentMonth : periodMode

  // One-time data: categories, settings, last transaction date
  useEffect(() => {
    let cancelled = false

    async function loadOnce() {
      const [{ data: cats, error: catsErr }, { data: settings }, { data: lastTxn }] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('settings').select('starting_year, savings_rate_method').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('transactions')
          .select('date')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(1),
      ])

      if (cancelled) return

      if (catsErr) {
        setError(catsErr.message)
        return
      }

      setCategories(cats ?? [])
      setSavingsMethod(settings?.savings_rate_method ?? 'active')
      setLastTxnDate(lastTxn?.[0]?.date ?? null)
      const startYear = settings?.starting_year ?? currentYear
      setAvailableYears(Array.from({ length: 6 }, (_, i) => startYear + i))
    }

    loadOnce()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  // Year-scoped data: budget amounts + transactions (by effective_date)
  const loadYear = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [{ data: budget, error: budgetErr }, { data: transactions, error: txnErr }] = await Promise.all([
      supabase.from('budget_amounts').select('*').eq('user_id', user.id).eq('year', resolvedYear),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('effective_date', `${resolvedYear}-01-01`)
        .lte('effective_date', `${resolvedYear}-12-31`),
    ])

    if (budgetErr || txnErr) {
      setError(budgetErr?.message || txnErr?.message)
      setLoading(false)
      return
    }

    setBudgetRows(budget ?? [])
    setTxns(transactions ?? [])
    setLoading(false)
  }, [user.id, resolvedYear])

  useEffect(() => {
    loadYear()
  }, [loadYear])

  const categoriesById = useMemo(() => {
    const map = {}
    for (const c of categories) map[c.id] = c
    return map
  }, [categories])

  const periodTxns = useMemo(
    () => (resolvedMonth ? txns.filter((t) => monthOf(t.effective_date) === resolvedMonth) : txns),
    [txns, resolvedMonth],
  )

  const periodBudgetRows = useMemo(
    () => (resolvedMonth ? budgetRows.filter((r) => r.month === resolvedMonth) : budgetRows),
    [budgetRows, resolvedMonth],
  )

  const breakdown = useMemo(() => {
    const tracked = {}
    for (const t of periodTxns) {
      tracked[t.category_id] = (tracked[t.category_id] ?? 0) + Number(t.amount)
    }
    const budget = {}
    for (const r of periodBudgetRows) {
      budget[r.category_id] = (budget[r.category_id] ?? 0) + Number(r.amount)
    }

    return categories
      .map((cat) => {
        const trackedAmt = tracked[cat.id] ?? 0
        const budgetAmt = budget[cat.id] ?? 0
        return {
          id: cat.id,
          name: cat.name,
          type: cat.type,
          tracked: trackedAmt,
          budget: budgetAmt,
          percentComplete: budgetAmt > 0 ? (trackedAmt / budgetAmt) * 100 : null,
          remaining: Math.max(budgetAmt - trackedAmt, 0),
          excess: Math.max(trackedAmt - budgetAmt, 0),
        }
      })
      .sort((a, b) => b.tracked - a.tracked)
  }, [categories, periodTxns, periodBudgetRows])

  const doughnuts = useMemo(() => {
    const result = {}
    for (const type of ['income', 'expense', 'savings']) {
      const rows = breakdown.filter((r) => r.type === type && r.tracked > 0)
      const top5 = rows.slice(0, 5)
      const rest = rows.slice(5)
      const otherTotal = rest.reduce((sum, r) => sum + r.tracked, 0)
      const data = top5.map((r) => ({ name: r.name, value: r.tracked }))
      if (otherTotal > 0) data.push({ name: 'Other', value: otherTotal })
      result[type] = data
    }
    return result
  }, [breakdown])

  const monthlyChart = useMemo(() => {
    const tracked = { income: Array(12).fill(0), expense: Array(12).fill(0), savings: Array(12).fill(0) }
    const budget = { income: Array(12).fill(0), expense: Array(12).fill(0), savings: Array(12).fill(0) }

    for (const t of txns) {
      tracked[t.type][monthOf(t.effective_date) - 1] += Number(t.amount)
    }
    for (const r of budgetRows) {
      const cat = categoriesById[r.category_id]
      if (!cat) continue
      budget[cat.type][r.month - 1] += Number(r.amount)
    }

    return MONTHS.map((m, i) => ({
      month: m,
      income: tracked.income[i],
      budget_income: budget.income[i],
      expense: tracked.expense[i],
      budget_expense: budget.expense[i],
      savings: tracked.savings[i],
      budget_savings: budget.savings[i],
      isSelected: resolvedMonth === i + 1,
    }))
  }, [txns, budgetRows, categoriesById, resolvedMonth])

  const kpis = useMemo(() => {
    let income = 0
    let expense = 0
    let savings = 0
    for (const t of periodTxns) {
      if (t.type === 'income') income += Number(t.amount)
      else if (t.type === 'expense') expense += Number(t.amount)
      else if (t.type === 'savings') savings += Number(t.amount)
    }
    const periodBalance = income - expense - savings
    const savingsRate =
      savingsMethod === 'passive'
        ? income > 0
          ? ((income - expense) / income) * 100
          : null
        : income > 0
          ? (savings / income) * 100
          : null

    const now = new Date()
    let periodStart
    let periodEnd
    if (resolvedMonth) {
      periodStart = new Date(resolvedYear, resolvedMonth - 1, 1)
      periodEnd = new Date(resolvedYear, resolvedMonth, 0)
    } else {
      periodStart = new Date(resolvedYear, 0, 1)
      periodEnd = new Date(resolvedYear, 11, 31)
    }
    const totalDays = daysBetween(periodEnd, periodStart) + 1
    const elapsedDays = Math.min(Math.max(daysBetween(now, periodStart) + 1, 0), totalDays)
    const percentElapsed = (elapsedDays / totalDays) * 100

    const daysSinceLastTxn = lastTxnDate
      ? daysBetween(now, new Date(lastTxnDate + 'T00:00:00'))
      : null

    return { periodBalance, savingsRate, percentElapsed, daysSinceLastTxn }
  }, [periodTxns, savingsMethod, resolvedYear, resolvedMonth, lastTxnDate])

  if (loading && categories.length === 0) {
    return <div className="p-8 text-gray-500 dark:text-gray-400">Loading dashboard…</div>
  }

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Dashboard</h2>
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Year</label>
          <select
            value={yearMode}
            onChange={(e) => setYearMode(e.target.value === 'current' ? 'current' : Number(e.target.value))}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="current">Current Year ({currentYear})</option>
            {availableYears
              .filter((y) => y !== currentYear)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Period</label>
          <select
            value={periodMode === 'total' || periodMode === 'current-month' ? periodMode : String(periodMode)}
            onChange={(e) => {
              const v = e.target.value
              setPeriodMode(v === 'total' || v === 'current-month' ? v : Number(v))
            }}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="total">Total Year</option>
            <option value="current-month">Current Month ({MONTHS[currentMonth - 1]})</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiTile label="Period balance" value={kpis.periodBalance.toFixed(2)} />
        <KpiTile
          label={`Savings rate (${savingsMethod})`}
          value={kpis.savingsRate === null ? '—' : `${kpis.savingsRate.toFixed(1)}%`}
        />
        <KpiTile label="% of period elapsed" value={`${kpis.percentElapsed.toFixed(0)}%`} />
        <KpiTile
          label="Days since last transaction"
          value={kpis.daysSinceLastTxn === null ? '—' : kpis.daysSinceLastTxn}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {['income', 'expense', 'savings'].map((type) => (
          <div
            key={type}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
          >
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {TYPE_LABELS[type]}
            </h3>
            {doughnuts[type].length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-8 text-center">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={doughnuts[type]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {doughnuts[type].map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={entry.name === 'Other' ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => Number(v).toFixed(2)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-8">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Tracked vs. budget by month
          </h3>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14">
                <rect x="1" y="1" width="12" height="12" fill="none" stroke="#94a3b8" strokeWidth="2" />
              </svg>
              Budget
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14">
                <rect x="1" y="1" width="12" height="12" fill="#94a3b8" />
              </svg>
              Tracked
            </span>
            {['income', 'expense', 'savings'].map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <svg width="14" height="14">
                  <rect x="1" y="1" width="12" height="12" fill={SERIES_COLORS[type]} />
                </svg>
                {TYPE_LABELS[type]}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyChart} barGap={-14}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-800" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => Number(v).toFixed(2)} />
            {['income', 'expense', 'savings'].map((type) => (
              <Bar key={`budget_${type}`} dataKey={`budget_${type}`} name={`${TYPE_LABELS[type]} budget`} legendType="none" fill="transparent" stroke={SERIES_COLORS[type]} strokeWidth={2} barSize={18}>
                {monthlyChart.map((entry) => (
                  <Cell key={entry.month} strokeOpacity={!resolvedMonth || entry.isSelected ? 1 : 0.3} />
                ))}
              </Bar>
            ))}
            {['income', 'expense', 'savings'].map((type) => (
              <Bar key={type} dataKey={type} name={`${TYPE_LABELS[type]} tracked`} legendType="none" fill={SERIES_COLORS[type]} fillOpacity={0.85} barSize={12}>
                {monthlyChart.map((entry) => (
                  <Cell key={entry.month} fillOpacity={!resolvedMonth || entry.isSelected ? 0.85 : 0.25} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Tracked</th>
              <th className="px-3 py-2 text-right">Budget</th>
              <th className="px-3 py-2 text-right">% Complete</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2 text-right">Excess</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800/60">
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.name}</td>
                <td className="px-3 py-2 capitalize text-gray-500 dark:text-gray-400">{row.type}</td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                  {row.tracked.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                  {row.budget.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                  {row.percentComplete === null ? '—' : `${row.percentComplete.toFixed(0)}%`}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                  {row.remaining.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">
                  {row.excess > 0 ? row.excess.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
            {breakdown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400 dark:text-gray-500">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KpiTile({ label, value }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}
