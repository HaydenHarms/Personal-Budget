import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

const EMPTY_FORM = { name: '', goal_amount: '', current_amount: '' }

export default function Savings() {
  const { user } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')

    if (error) setError(error.message)
    else setGoals(data ?? [])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    const totalSaved = goals.reduce((sum, g) => sum + Number(g.current_amount), 0)
    const totalGoal = goals.reduce((sum, g) => sum + Number(g.goal_amount), 0)
    return { totalSaved, totalGoal, leftToAllocate: Math.max(totalGoal - totalSaved, 0) }
  }, [goals])

  function startEdit(g) {
    setEditingId(g.id)
    setForm({ name: g.name, goal_amount: String(g.goal_amount), current_amount: String(g.current_amount) })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return

    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      goal_amount: Number(form.goal_amount) || 0,
      current_amount: Number(form.current_amount) || 0,
    }

    const { error } = editingId
      ? await supabase.from('savings_goals').update(payload).eq('id', editingId)
      : await supabase.from('savings_goals').insert({ ...payload, sort_order: goals.length })

    if (error) {
      setError(error.message)
      return
    }
    setForm(EMPTY_FORM)
    setEditingId(null)
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this savings goal?')) return
    const { error } = await supabase.from('savings_goals').delete().eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  if (loading) {
    return <div className="p-8 text-gray-500 dark:text-gray-400">Loading savings goals…</div>
  }

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Savings</h2>
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryTile label="Total saved" value={totals.totalSaved.toFixed(2)} />
        <SummaryTile label="Total goal" value={totals.totalGoal.toFixed(2)} />
        <SummaryTile label="Left to allocate" value={totals.leftToAllocate.toFixed(2)} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-2 mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Goal amount</label>
          <input
            type="number"
            step="0.01"
            value={form.goal_amount}
            onChange={(e) => setForm({ ...form, goal_amount: e.target.value })}
            className="w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Current amount
          </label>
          <input
            type="number"
            step="0.01"
            value={form.current_amount}
            onChange={(e) => setForm({ ...form, current_amount: e.target.value })}
            className="w-28 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-indigo-500"
        >
          {editingId ? 'Save changes' : 'Add goal'}
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

      <div className="space-y-3">
        {goals.map((g) => {
          const pct = Number(g.goal_amount) > 0 ? Math.min((Number(g.current_amount) / Number(g.goal_amount)) * 100, 100) : 0
          return (
            <div
              key={g.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">{g.name}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {Number(g.current_amount).toFixed(2)} / {Number(g.goal_amount).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(g)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id)}
                    className="text-red-600 dark:text-red-400 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="w-full h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-600"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
        {goals.length === 0 && (
          <p className="text-center text-gray-400 dark:text-gray-500 py-6">No savings goals yet.</p>
        )}
      </div>
    </div>
  )
}

function SummaryTile({ label, value }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}
