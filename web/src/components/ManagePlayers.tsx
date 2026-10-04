import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { btn, card } from './Layout'
import type { Contestant, Game, Pick } from '../types'

// Group-owner tools: add guest players and set anyone's pick, even after the game has locked.
export default function ManagePlayers({ game, contestants, picks }: { game: Game; contestants: Contestant[]; picks: Pick[] }) {
  const { session } = useAuth()
  const qc = useQueryClient()
  const group = useQuery({ queryKey: ['group', game.group_id], queryFn: () => api.group(game.group_id) })
  const members = useQuery({ queryKey: ['members', game.group_id], queryFn: () => api.members(game.group_id) })
  const [guest, setGuest] = useState('')
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (!group.data || group.data.owner_id !== session?.user.id) return null
  const locked = game.status !== 'picking'

  async function run(fn: () => Promise<unknown>) {
    setErr(''); setBusy(true)
    try {
      await fn()
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['picks', game.id] }), qc.invalidateQueries({ queryKey: ['winners', game.id] }),
        qc.invalidateQueries({ queryKey: ['game', game.id] }), qc.invalidateQueries({ queryKey: ['members', game.group_id] }),
        qc.invalidateQueries({ queryKey: ['profiles'] }),
      ])
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const addGuest = () => run(async () => { await api.rpc('add_guest_player', { gid: game.group_id, guest_name: guest }); setGuest('') })
  const setPick = (uid: string) => run(() => api.rpc('leader_set_pick', { gid: game.id, uid, cid: Number(choice[uid]) }))

  return (
    <details className={card}>
      <summary className="min-h-[44px] cursor-pointer font-semibold">Manage players &amp; picks</summary>
      <p className="text-xs text-stone-500">Group owner only. Add people who don't have an account and set anyone's pick.</p>
      {locked && <p role="note" className="mt-1 rounded bg-amber-100 p-2 text-sm text-amber-900">This game is locked. Changes you make here override the lock and are recorded.</p>}
      {err && <p role="alert" className="mt-1 text-red-600">{err}</p>}
      <ul className="mt-2 flex flex-col gap-3">
        {members.data?.map(({ profiles: m }) => {
          const current = picks.find(p => p.user_id === m.id)
          const takenByOthers = new Set(picks.filter(p => p.user_id !== m.id).map(p => p.contestant_id))
          const options = contestants.filter(c => c.status === 'active' && !takenByOthers.has(c.id))
          const currentName = contestants.find(c => c.id === current?.contestant_id)?.name
          return (
            <li key={m.id} className="flex flex-col gap-1 border-t pt-2">
              <div className="font-medium">{m.display_name}{m.is_guest && <span className="ml-1 text-xs text-stone-500">(guest)</span>}</div>
              <div className="text-sm text-stone-500">{currentName ? `Pick: ${currentName}` : 'No pick yet'}</div>
              <div className="flex gap-2">
                <select aria-label={`Castaway for ${m.display_name}`} value={choice[m.id] ?? ''} onChange={e => setChoice({ ...choice, [m.id]: e.target.value })}
                  className="min-h-[44px] min-w-0 flex-1 rounded-lg border bg-white px-2">
                  <option value="">Choose castaway…</option>
                  {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className={btn} disabled={busy || !choice[m.id]} onClick={() => setPick(m.id)}>{current ? 'Change' : 'Set pick'}</button>
              </div>
            </li>
          )
        })}
      </ul>
      <form className="mt-3 flex gap-2 border-t pt-3" onSubmit={e => { e.preventDefault(); if (guest.trim()) addGuest() }}>
        <input value={guest} onChange={e => setGuest(e.target.value)} maxLength={50} placeholder="Add guest player (name)" aria-label="Guest player name"
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border px-3" />
        <button type="submit" className={btn} disabled={busy || !guest.trim()}>Add guest</button>
      </form>
    </details>
  )
}
