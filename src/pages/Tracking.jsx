import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

const TODAY = () => new Date().toISOString().slice(0, 10)

const EMPTY_FORM = { date: TODAY(), type: 'expense', category_id: '', amount: '', details: '' }

export default function Tracking() {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [{ data: cats, error: catsErr }, { data: txns, error: txnErr }] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: true }),
    ])

    if (catsErr || txnErr) {
      setError(catsErr?.message || txnErr?.message)
      setLoading(false)
      return
    }

    setCategories(cats ?? [])
    setTransactions(txns ?? [])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  const categoriesById = useMemo(() => {
    const map = {}
    for (const c of categories) map[c.id] = c
    return map
  }, [categories])

  const filteredCategoryOptions = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type],
  )

  const rowsWithBalance = useMemo(() => {
    let balance = 0
    return transactions.map((t) => {
      const signed = t.type === 'income' ? Number(t.amount) : -Number(t.amount)
      balance += signed
      return { ...t, runningBalance: balance }
    })
  }, [transactions])

  function startEdit(t) {
    setEditingId(t.id)
    setForm({
      date: t.date,
      type: t.type,
      category_id: t.category_id ?? '',
      amount: String(t.amount),
      details: t.details ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.category_id || !form.amount) return
    setSaving(true)
    setError(null)

    const payload = {
      user_id: user.id,
      date: form.date,
      type: form.type,
      category_id: form.category_id,
      amount: Number(form.amount),
      details: form.details || null,
    }

    const { error } = editingId
      ? await supabase.from('transactions').update(payload).eq('id', editingId)
      : await supabase.from('transactions').insert(payload)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setForm(EMPTY_FORM)
    setEditingId(null)
    setSaving(false)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this transaction?')) return
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  if (loading) {
    return <div className="p-8 text-gray-500 dark:text-gray-400">Loading transactions…</div>
  }

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Tracking</h2>
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-2 mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date</label>
          <input
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value, category_id: '' })}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="savings">Savings</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
          <select
            required
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="" disabled>
              Select…
            </option>
            {filteredCategoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount</label>
          <input
            type="number"
            step="0.01"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Details</label>
          <input
            type="text"
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-indigo-500 disabled:opacity-50"
        >
          {editingId ? 'Save changes' : 'Add transaction'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        )}
      </form>

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Effective</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rowsWithBalance.map((t) => (
              <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800/60">
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{t.date}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{t.effective_date}</td>
                <td className="px-3 py-2 capitalize text-gray-700 dark:text-gray-300">{t.type}</td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                  {categoriesById[t.category_id]?.name ?? '—'}
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{t.details}</td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                  {Number(t.amount).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                  {t.runningBalance.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline mr-3 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="text-red-600 dark:text-red-400 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rowsWithBalance.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400 dark:text-gray-500">
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
