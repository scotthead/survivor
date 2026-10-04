import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { btn } from '../components/Layout'

// Used for both /contestants (browse) and /games/:id/pick (pick mode).
export default function Contestants() {
  const { id: gameId } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const game = useQuery({ queryKey: ['game', gameId], queryFn: () => api.game(gameId!), enabled: !!gameId })
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: api.seasons })
  const [params, setParams] = useSearchParams()
  const defaultSeason = seasons.data?.find(s => s.status === 'airing') ?? seasons.data?.[0]
  const chosen = seasons.data?.find(s => String(s.number) === params.get('season'))
  const seasonId = game.data?.season_id ?? (chosen ?? defaultSeason)?.id
  const list = useQuery({ queryKey: ['contestants', seasonId], queryFn: () => api.contestants(seasonId!), enabled: !!seasonId })
  const picks = useQuery({ queryKey: ['picks', gameId], queryFn: () => api.picks(gameId!), enabled: !!gameId })
  const names = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => ((await supabase.from('profiles').select('id, display_name')).data ?? []) as { id: string; display_name: string }[],
  })
  const [q, setQ] = useState('')
  const [availOnly, setAvailOnly] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [err, setErr] = useState('')

  const takenBy = (cid: number) => {
    const p = picks.data?.find(p => p.contestant_id === cid)
    return p ? names.data?.find(n => n.id === p.user_id)?.display_name ?? 'someone' : null
  }

  async function pick(cid: number) {
    try {
      await api.rpc('make_pick', { gid: gameId, cid })
      await qc.invalidateQueries({ queryKey: ['picks', gameId] })
      nav(`/games/${gameId}`)
    } catch (e) { setErr((e as Error).message); setConfirm(null) }
  }

  const shown = list.data?.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) && (!availOnly || (c.status === 'active' && !takenBy(c.id)))) ?? []
  const confirming = list.data?.find(c => c.id === confirm)

  return (
    <main className="flex flex-col gap-3">
      <div className="sticky top-[53px] z-10 -mx-4 flex flex-col gap-2 bg-stone-50 px-4 py-2">
        <h1 className="text-2xl font-bold">{gameId ? 'Pick your castaway' : 'Castaways'}</h1>
        {!gameId && seasons.data && seasons.data.length > 0 && (
          <select aria-label="Season" value={seasonId ?? ''} onChange={e => setParams({ season: String(seasons.data!.find(s => s.id === Number(e.target.value))!.number) }, { replace: true })}
            className="min-h-[44px] rounded-lg border bg-white px-3">
            {seasons.data.map(s => <option key={s.id} value={s.id}>Season {s.number}{s.title && s.title !== `Survivor ${s.number}` ? `: ${s.title}` : ''}</option>)}
          </select>
        )}
        <input type="search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} className="min-h-[44px] rounded-lg border px-3" />
        {gameId && <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={availOnly} onChange={e => setAvailOnly(e.target.checked)} />Available only</label>}
      </div>
      {err && <p role="alert" className="text-red-600">{err}</p>}
      {list.isLoading && <p>Loading…</p>}
      {list.data?.length === 0 && <p className="text-stone-600">No castaways loaded for this season yet.</p>}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {shown.map(c => {
          const owner = takenBy(c.id)
          const disabled = c.status !== 'active' || !!owner
          return (
            <li key={c.id} className={`overflow-hidden rounded-xl border bg-white ${disabled ? 'opacity-60' : ''}`}>
              <Link to={`/contestants/${c.id}`}>
                {c.photo_url ? <img src={c.photo_url} alt={c.name} loading="lazy" referrerPolicy="no-referrer" className="aspect-[2/3] w-full object-cover object-top" />
                  : <div className="aspect-[2/3] w-full bg-stone-200" />}
                <div className="p-2"><div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-stone-500">{c.occupation}</div></div>
              </Link>
              {gameId && (
                <div className="p-2 pt-0">
                  {owner ? <span className="text-xs">Picked by {owner}</span>
                    : c.status !== 'active' ? <span className="text-xs">Eliminated</span>
                    : <button className={`${btn} w-full`} onClick={() => setConfirm(c.id)}>Pick</button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {confirming && (
        <div className="fixed inset-x-0 bottom-0 z-20 rounded-t-2xl border-t bg-white p-4 shadow-lg" role="dialog" aria-label="Confirm pick">
          <p className="mb-3 font-medium">Pick {confirming.name}?</p>
          <div className="flex gap-2">
            <button className="min-h-[44px] flex-1 rounded-lg border" onClick={() => setConfirm(null)}>Cancel</button>
            <button className={`${btn} flex-1`} onClick={() => pick(confirming.id)}>Confirm</button>
          </div>
        </div>
      )}
    </main>
  )
}
