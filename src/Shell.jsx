import { useState } from 'react'
import { useAuth } from './lib/AuthContext'
import Placeholder from './pages/Placeholder'
import SettingsPage from './pages/Settings'
import PlanningPage from './pages/Planning'
import TrackingPage from './pages/Tracking'
import DashboardPage from './pages/Dashboard'

const NAV_ITEMS = ['Planning', 'Tracking', 'Dashboard', 'Savings', 'Asset Allocation', 'Settings']

const PAGES = {
  Settings: SettingsPage,
  Planning: PlanningPage,
  Tracking: TrackingPage,
  Dashboard: DashboardPage,
}

export default function Shell() {
  const { user, signOut } = useAuth()
  const [active, setActive] = useState('Dashboard')
  const ActivePage = PAGES[active]

  return (
    <div className="min-h-svh flex flex-col md:flex-row bg-gray-50 dark:bg-gray-950">
      <nav className="md:w-56 md:min-h-svh border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6">Personal Budget</h1>
        <ul className="flex md:flex-col gap-1 flex-wrap">
          {NAV_ITEMS.map((item) => (
            <li key={item}>
              <button
                type="button"
                onClick={() => setActive(item)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active === item
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-2">{user?.email}</p>
          <button
            type="button"
            onClick={signOut}
            className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
          >
            Log out
          </button>
        </div>
      </nav>

      <main className="flex-1">
        {ActivePage ? <ActivePage /> : <Placeholder title={active} />}
      </main>
    </div>
  )
}
