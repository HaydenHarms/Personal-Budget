import { useCallback, useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

const BUCKET_OPTIONS = ['US', 'World', 'Cash', 'Crypto']
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899']

const EMPTY_FORM = { bucket: 'US', target_pct: '', current_value: '' }

export default function AssetAllocation() {
  const { user } = useAuth()
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.from('asset_holdings').select('*').eq('user_id', user.id)

    if (error) setError(error.message)
    else setHoldings(data ?? [])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  const totalValue = useMemo(
    () => holdings.reduce((sum, h) => sum + Number(h.current_value), 0),
    [holdings],
  )

  const rows = useMemo(
    () =>
      holdings.map((h) => {
        const currentPct = totalValue > 0 ? (Number(h.current_value) / totalValue) * 100 : 0
        return { ...h, currentPct, diff: currentPct - Number(h.target_pct) }
      }),
    [holdings, totalValue],
  )

  const chartData = useMemo(
    () => holdings.filter((h) => Number(h.current_value) > 0).map((h) => ({ name: h.bucket, value: Number(h.current_value) })),
    [holdings],
  )

  function startEdit(h) {
    setEditingId(h.id)
    setForm({ bucket: h.bucket, target_pct: String(h.target_pct), current_value: String(h.current_value) })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const payload = {
      user_id: user.id,
      bucket: form.bucket,
      target_pct: Number(form.target_pct) || 0,
      current_value: Number(form.current_value) || 0,
    }

    const { error } = editingId
      ? await supabase.from('asset_holdings').update(payload).eq('id', editingId)
      : await supabase.from('asset_holdings').insert(payload)

    if (error) {
      setError(error.message)
      return
    }
    setForm(EMPTY_FORM)
    setEditingId(null)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this holding?')) return
    const { error } = await supabase.from('asset_holdings').delete().eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  if (loading) {
    return <div className="p-8 text-gray-500 dark:text-gray-400">Loading asset allocation…</div>
  }

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Asset Allocation</h2>
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-2 mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bucket</label>
          <select
            value={form.bucket}
            onChange={(e) => setForm({ ...form, bucket: e.target.value })}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          >
            {BUCKET_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target %</label>
          <input
            type="number"
            step="0.01"
            value={form.target_pct}
            onChange={(e) => setForm({ ...form, target_pct: e.target.value })}
            className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Current value
          </label>
          <input
            type="number"
            step="0.01"
            value={form.current_value}
            onChange={(e) => setForm({ ...form, current_value: e.target.value })}
            className="w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-indigo-500"
        >
          {editingId ? 'Save changes' : 'Add holding'}
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

      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-6 max-w-md">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                {chartData.map((entry, i) => (
                  <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => Number(v).toFixed(2)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
              <th className="px-3 py-2">Bucket</th>
              <th className="px-3 py-2 text-right">Current Value</th>
              <th className="px-3 py-2 text-right">Current %</th>
              <th className="px-3 py-2 text-right">Target %</th>
              <th className="px-3 py-2 text-right">Diff</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className="border-t border-gray-100 dark:border-gray-800/60">
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{h.bucket}</td>
                <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                  {Number(h.current_value).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                  {h.currentPct.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                  {Number(h.target_pct).toFixed(1)}%
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    Math.abs(h.diff) < 0.05
                      ? 'text-gray-700 dark:text-gray-300'
                      : h.diff > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {h.diff > 0 ? '+' : ''}
                  {h.diff.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => startEdit(h)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline mr-3 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(h.id)}
                    className="text-red-600 dark:text-red-400 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400 dark:text-gray-500">
                  No holdings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
