import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TYPE_LABELS = { income: 'Income', expense: 'Expenses', savings: 'Savings' }
const TYPE_ORDER = ['income', 'expense', 'savings']

export default function Planning() {
  const { user } = useAuth()
  const [startingYear, setStartingYear] = useState(null)
  const [categories, setCategories] = useState([])
  const [amounts, setAmounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newCategory, setNewCategory] = useState({ type: 'income', name: '' })
  const [collapsedYears, setCollapsedYears] = useState(new Set())

  const years = useMemo(
    () => (startingYear ? Array.from({ length: 6 }, (_, i) => startingYear + i) : []),
    [startingYear],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [{ data: settings, error: settingsErr }, { data: cats, error: catsErr }] = await Promise.all([
      supabase.from('settings').select('starting_year').eq('user_id', user.id).maybeSingle(),
      supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    ])

    if (settingsErr || catsErr) {
      setError(settingsErr?.message || catsErr?.message)
      setLoading(false)
      return
    }

    const year = settings?.starting_year ?? new Date().getFullYear()
    setStartingYear(year)
    setCategories(cats ?? [])

    const categoryIds = (cats ?? []).map((c) => c.id)
    if (categoryIds.length > 0) {
      const { data: budgetRows, error: budgetErr } = await supabase
        .from('budget_amounts')
        .select('*')
        .in('category_id', categoryIds)
        .gte('year', year)
        .lte('year', year + 5)

      if (budgetErr) {
        setError(budgetErr.message)
        setLoading(false)
        return
      }

      const map = {}
      for (const row of budgetRows) {
        map[`${row.category_id}:${row.year}:${row.month}`] = Number(row.amount)
      }
      setAmounts(map)
    } else {
      setAmounts({})
    }

    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  function getAmount(categoryId, year, month) {
    return amounts[`${categoryId}:${year}:${month}`] ?? 0
  }

  function getCategoryYearTotal(categoryId, year) {
    let total = 0
    for (let month = 1; month <= 12; month++) total += getAmount(categoryId, year, month)
    return total
  }

  function toggleYear(year) {
    setCollapsedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  function setAmountLocal(categoryId, year, month, value) {
    setAmounts((prev) => ({ ...prev, [`${categoryId}:${year}:${month}`]: value }))
  }

  async function saveAmount(categoryId, year, month, value) {
    const { error } = await supabase
      .from('budget_amounts')
      .upsert(
        { category_id: categoryId, user_id: user.id, year, month, amount: value || 0 },
        { onConflict: 'category_id,year,month' },
      )
    if (error) setError(error.message)
  }

  async function addCategory(e) {
    e.preventDefault()
    if (!newCategory.name.trim()) return
    const sortOrder = categories.filter((c) => c.type === newCategory.type).length
    const { error } = await supabase.from('categories').insert({
      user_id: user.id,
      type: newCategory.type,
      name: newCategory.name.trim(),
      sort_order: sortOrder,
    })
    if (error) {
      setError(error.message)
      return
    }
    setNewCategory({ type: newCategory.type, name: '' })
    load()
  }

  async function renameCategory(id, name) {
    if (!name.trim()) return
    const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  async function moveCategory(cat, direction) {
    const siblings = categoriesByType[cat.type]
    const index = siblings.findIndex((c) => c.id === cat.id)
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= siblings.length) return
    const other = siblings[swapIndex]

    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      supabase.from('categories').update({ sort_order: other.sort_order }).eq('id', cat.id),
      supabase.from('categories').update({ sort_order: cat.sort_order }).eq('id', other.id),
    ])
    if (err1 || err2) setError(err1?.message || err2?.message)
    else load()
  }

  async function deleteCategory(id) {
    if (!confirm('Delete this category? This also deletes its budget amounts.')) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  const categoriesByType = useMemo(() => {
    const grouped = { income: [], expense: [], savings: [] }
    for (const cat of categories) grouped[cat.type]?.push(cat)
    for (const type of TYPE_ORDER) grouped[type].sort((a, b) => a.sort_order - b.sort_order)
    return grouped
  }, [categories])

  const monthTotals = useMemo(() => {
    const totals = {}
    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        let income = 0
        let expense = 0
        let savings = 0
        for (const cat of categories) {
          const amt = getAmount(cat.id, year, month)
          if (cat.type === 'income') income += amt
          else if (cat.type === 'expense') expense += amt
          else if (cat.type === 'savings') savings += amt
        }
        const remaining = income - expense - savings
        totals[`${year}:${month}`] = {
          income,
          expense,
          savings,
          remaining,
          balanced: Math.round(remaining * 100) === 0,
        }
      }
    }
    return totals
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, amounts, years])

  const yearTotals = useMemo(() => {
    const totals = {}
    for (const year of years) {
      let income = 0
      let expense = 0
      let savings = 0
      for (let month = 1; month <= 12; month++) {
        const t = monthTotals[`${year}:${month}`]
        income += t.income
        expense += t.expense
        savings += t.savings
      }
      const remaining = income - expense - savings
      totals[year] = { income, expense, savings, remaining, balanced: Math.round(remaining * 100) === 0 }
    }
    return totals
  }, [monthTotals, years])

  if (loading) {
    return <div className="p-8 text-gray-500 dark:text-gray-400">Loading planning grid…</div>
  }

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Planning</h2>
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <form onSubmit={addCategory} className="flex flex-wrap items-end gap-2 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
          <select
            value={newCategory.type}
            onChange={(e) => setNewCategory({ ...newCategory, type: e.target.value })}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="savings">Savings</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Category name
          </label>
          <input
            type="text"
            value={newCategory.name}
            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-indigo-500"
        >
          Add category
        </button>
      </form>

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-100 dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-800 px-3 py-2 text-left min-w-[180px]">
                Category
              </th>
              {years.map((year) => {
                const collapsed = collapsedYears.has(year)
                return (
                  <th
                    key={year}
                    colSpan={collapsed ? 1 : 12}
                    onClick={() => toggleYear(year)}
                    className="bg-gray-100 dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-800 px-2 py-2 text-center font-semibold cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-800"
                    title={collapsed ? 'Expand year' : 'Collapse year'}
                  >
                    {year} {collapsed ? '›' : 'ˇ'}
                  </th>
                )
              })}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-100 dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-800 px-3 py-1" />
              {years.map((year) =>
                collapsedYears.has(year) ? (
                  <th
                    key={`${year}-total`}
                    className="bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-800 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[70px]"
                  >
                    Total
                  </th>
                ) : (
                  MONTHS.map((m) => (
                    <th
                      key={`${year}-${m}`}
                      className="bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-800 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[70px]"
                    >
                      {m}
                    </th>
                  ))
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.map((type) => (
              <Fragment key={type}>
                <tr>
                  <td
                    colSpan={1 + years.reduce((sum, y) => sum + (collapsedYears.has(y) ? 1 : 12), 0)}
                    className="bg-gray-50 dark:bg-gray-900/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800"
                  >
                    {TYPE_LABELS[type]}
                  </td>
                </tr>
                {categoriesByType[type].map((cat) => (
                  <tr key={cat.id} className="border-b border-gray-100 dark:border-gray-800/60">
                    <td className="sticky left-0 z-10 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 px-3 py-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveCategory(cat, -1)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCategory(cat, 1)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                          title="Move down"
                        >
                          ▼
                        </button>
                        <input
                          type="text"
                          defaultValue={cat.name}
                          onBlur={(e) => e.target.value !== cat.name && renameCategory(cat.id, e.target.value)}
                          className="w-24 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1"
                        />
                        <button
                          type="button"
                          onClick={() => deleteCategory(cat.id)}
                          className="text-gray-400 hover:text-red-500 text-xs"
                          title="Delete category"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                    {years.map((year) =>
                      collapsedYears.has(year) ? (
                        <td
                          key={`${cat.id}-${year}-total`}
                          className="border-r border-gray-100 dark:border-gray-800/60 px-1 py-1 text-right text-gray-700 dark:text-gray-300"
                        >
                          {getCategoryYearTotal(cat.id, year).toFixed(0)}
                        </td>
                      ) : (
                        MONTHS.map((_, i) => {
                          const month = i + 1
                          const value = getAmount(cat.id, year, month)
                          return (
                            <td
                              key={`${cat.id}-${year}-${month}`}
                              className="border-r border-gray-100 dark:border-gray-800/60 px-1 py-1"
                            >
                              <input
                                type="number"
                                step="0.01"
                                value={value === 0 ? '' : value}
                                placeholder="0"
                                onChange={(e) => setAmountLocal(cat.id, year, month, Number(e.target.value))}
                                onBlur={(e) => saveAmount(cat.id, year, month, Number(e.target.value) || 0)}
                                className="w-16 bg-transparent text-right text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1"
                              />
                            </td>
                          )
                        })
                      ),
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}

            <tr className="border-t-2 border-gray-300 dark:border-gray-700 font-semibold">
              <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 px-3 py-2">
                To be allocated
              </td>
              {years.map((year) =>
                collapsedYears.has(year) ? (
                  <td key={`total-${year}`} className="px-2 py-2 text-right whitespace-nowrap">
                    <span
                      className={
                        yearTotals[year].balanced
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-gray-700 dark:text-gray-300'
                      }
                    >
                      {yearTotals[year].balanced ? '✓' : yearTotals[year].remaining.toFixed(0)}
                    </span>
                  </td>
                ) : (
                  MONTHS.map((_, i) => {
                    const month = i + 1
                    const t = monthTotals[`${year}:${month}`]
                    return (
                      <td key={`total-${year}-${month}`} className="px-2 py-2 text-right whitespace-nowrap">
                        <span
                          className={
                            t.balanced
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-gray-700 dark:text-gray-300'
                          }
                        >
                          {t.balanced ? '✓' : t.remaining.toFixed(0)}
                        </span>
                      </td>
                    )
                  })
                ),
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
