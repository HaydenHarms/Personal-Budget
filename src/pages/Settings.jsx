import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

const DEFAULTS = {
  starting_year: new Date().getFullYear(),
  shift_late_income_active: true,
  shift_late_income_day: 25,
  savings_rate_method: 'active',
}

export default function Settings() {
  const { user } = useAuth()
  const [form, setForm] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setError(error.message)
      } else if (data) {
        setForm(data)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user.id])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSavedAt(null)

    const { error } = await supabase
      .from('settings')
      .upsert({ ...form, user_id: user.id }, { onConflict: 'user_id' })

    if (error) {
      setError(error.message)
    } else {
      setSavedAt(new Date())
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="p-8 text-gray-500 dark:text-gray-400">Loading settings…</div>
  }

  return (
    <div className="p-8 max-w-lg">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Settings</h2>

      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Starting year
          </label>
          <input
            type="number"
            value={form.starting_year}
            onChange={(e) => setForm({ ...form, starting_year: Number(e.target.value) })}
            className="w-32 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            The 6-year Planning grid runs from this year through {form.starting_year + 5}.
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.shift_late_income_active}
              onChange={(e) => setForm({ ...form, shift_late_income_active: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
            />
            Shift late income to next month
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Income dated on or after the day below counts toward next month's totals.
          </p>
          {form.shift_late_income_active && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Shift on/after day of month
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={form.shift_late_income_day}
                onChange={(e) =>
                  setForm({ ...form, shift_late_income_day: Number(e.target.value) })
                }
                className="w-24 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Savings rate method
          </span>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="savings_rate_method"
                checked={form.savings_rate_method === 'active'}
                onChange={() => setForm({ ...form, savings_rate_method: 'active' })}
                className="border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
              />
              Active — Savings ÷ Income
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="savings_rate_method"
                checked={form.savings_rate_method === 'passive'}
                onChange={() => setForm({ ...form, savings_rate_method: 'passive' })}
                className="border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
              />
              Passive — (Income − Expenses) ÷ Income
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {savedAt && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 text-white font-medium px-4 py-2 hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </div>
  )
}
