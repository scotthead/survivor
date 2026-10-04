import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { btn, card } from '../components/Layout'

export default function GamePage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const me = session?.user.id
  const qc = useQueryClient()
  const game = useQuery({ queryKey: ['game', id], queryFn: () => api.game(id) })
  const picks = useQuery({ queryKey: ['picks', id], queryFn: () => api.picks(id) })
  const winners = useQuery({ queryKey: ['winners', id], queryFn: () => api.winners(id) })
  const seasonId = game.data?.season_id
  const contestants = useQuery({ queryKey: ['contestants', seasonId], queryFn: () => api.contestants(seasonId!), enabled: !!seasonId })
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => ((await supabase.from('profiles').select('id, display_name')).data ?? []) as { id: string; display_name: string }[],
  })
  const [err, setErr] = useState('')

  useEffect(() => {
    const ch = supabase.channel(`game-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contestants' }, () => {
        qc.invalidateQueries({ queryKey: ['contestants'] }); qc.invalidateQueries({ queryKey: ['winners', id] }); qc.invalidateQueries({ queryKey: ['game', id] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ['game', id] }); qc.invalidateQueries({ queryKey: ['winners', id] })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, qc])

  if (game.isLoading) return <p>Loading…</p>
  if (!game.data) return <p role="alert">Game not found.</p>
  const g = game.data
  const cOf = (cid: number) => contestants.data?.find(c => c.id === cid)
  const nameOf = (uid: string) => profiles.data?.find(p => p.id === uid)?.display_name ?? 'Player'
  const mine = picks.data?.find(p => p.user_id === me)
  const iWon = winners.data?.some(w => w.user_id === me)
  const myCastaway = mine && cOf(mine.contestant_id)
  const active = contestants.data?.filter(c => c.status === 'active') ?? []

  async function eliminate(cid: number) {
    const ep = Number(prompt('Eliminated in which episode?'))
    if (!ep) return
    const jv = g.status !== 'picking' ? prompt('Jury votes received (blank if none)') : null
    try {
      await api.rpc('record_elimination', { cid, ep, jury_votes: jv ? Number(jv) : null })
      qc.invalidateQueries({ queryKey: ['contestants'] })
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Game <span className="text-sm font-normal text-stone-500">({g.status})</span></h1>
      {g.status === 'completed' && winners.data && (
        iWon
          ? <div className="rounded-xl bg-emerald-600 p-4 text-white font-bold">You're the last one standing — you won!</div>
          : <div className="rounded-xl bg-stone-800 p-4 text-white">Game over. Winner: {winners.data.map(w => nameOf(w.user_id)).join(', ')}</div>)}
      {mine && myCastaway?.status === 'eliminated' && g.status !== 'completed' &&
        <div className="rounded-xl bg-red-600 p-4 text-white">Your castaway {myCastaway.name} was eliminated in episode {myCastaway.eliminated_episode}. You're out.</div>}
      {g.status === 'picking' && <Link to={`/games/${id}/pick`} className={btn}>{mine ? 'Change my pick' : 'Make my pick'}</Link>}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Standings</h2>
        {picks.data?.length === 0 && <p className="text-stone-500">No picks yet.</p>}
        {picks.data?.map(p => {
          const c = cOf(p.contestant_id)
          const out = c?.status === 'eliminated'
          return (
            <div key={p.id} className={`${card} flex items-center justify-between`}>
              <div><div className="font-medium">{nameOf(p.user_id)}{p.user_id === me && ' (you)'}</div>
                <div className="text-sm text-stone-500">{c?.name}</div></div>
              <span className={`rounded-full px-2 py-1 text-xs ${out ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {out ? `Out ep ${c?.eliminated_episode}` : 'Alive'}</span>
            </div>
          )
        })}
      </section>
      <details className={card}>
        <summary className="min-h-[44px] cursor-pointer font-semibold">Record an elimination</summary>
        <p className="text-xs text-stone-500">Site admins and group owners only. Affects every game this season.</p>
        {err && <p role="alert" className="text-red-600">{err}</p>}
        <ul>{active.map(c => (
          <li key={c.id} className="flex items-center justify-between py-1">{c.name}
            <button className="min-h-[44px] px-3 text-red-700" onClick={() => eliminate(c.id)}>Eliminate</button></li>))}</ul>
      </details>
    </main>
  )
}
