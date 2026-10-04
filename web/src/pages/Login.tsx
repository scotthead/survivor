import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { btn } from '../components/Layout'

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  if (session) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    setMsg(error ? error.message : 'Check your email for a sign-in link.')
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">Survivor: Last Man Standing</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input type="email" inputMode="email" autoComplete="email" required placeholder="you@example.com"
          value={email} onChange={e => setEmail(e.target.value)} className="min-h-[44px] rounded-lg border px-3" />
        <button className={btn}>Email me a magic link</button>
      </form>
      <button className="min-h-[44px] rounded-lg border bg-white font-medium"
        onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}>
        Continue with Google
      </button>
      {msg && <p role="status" className="text-sm text-stone-600">{msg}</p>}
    </main>
  )
}
