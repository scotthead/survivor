import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const tabs = [
  { to: '/', label: 'Home', end: true },
  { to: '/contestants', label: 'Castaways' },
  { to: '/history', label: 'History' },
]

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  if (loading) return <p className="p-4">Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  const signOut = () => supabase.auth.signOut()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4">
          <NavLink to="/" className="py-3 font-bold text-teal-700">Survivor LMS</NavLink>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {tabs.map(t => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => `flex min-h-[44px] items-center px-3 text-sm font-medium ${isActive ? 'text-teal-700' : 'text-stone-600'}`}>
                {t.label}
              </NavLink>
            ))}
          </nav>
          <button onClick={signOut} className="min-h-[44px] px-2 text-sm text-stone-600">Sign out</button>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-4 pb-safe md:pb-8">
        <Outlet />
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t bg-white md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="mx-auto flex max-w-3xl">
          {tabs.map(t => (
            <li key={t.to} className="flex-1">
              <NavLink to={t.to} end={t.end}
                className={({ isActive }) => `flex min-h-[44px] items-center justify-center text-sm font-medium ${isActive ? 'text-teal-700' : 'text-stone-500'}`}>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export const btn = 'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-teal-700 px-4 text-white font-medium disabled:opacity-50'
export const card = 'rounded-xl border bg-white p-4 shadow-sm'
