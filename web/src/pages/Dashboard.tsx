import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { btn, card } from '../components/Layout'
import type { Contestant } from '../types'

export default function Dashboard() {
  const groups = useQuery({ queryKey: ['groups'], queryFn: api.groups })
  const games = useQuery({ queryKey: ['games'], queryFn: api.allGames })
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: api.seasons })
  const [params, setParams] = useSearchParams()
  const season = seasons.data?.find(s => String(s.number) === params.get('season'))
    ?? seasons.data?.find(s => s.status === 'airing') ?? seasons.data?.[0]
  const contestants = useQuery({
    queryKey: ['contestants', season?.id],
    queryFn: () => api.contestants(season!.id),
    enabled: !!season,
  })
  const badge = (c: Contestant) =>
    c.status === 'winner' ? 'Winner'
    : c.status === 'eliminated' ? `Out${c.eliminated_episode ? ` (ep. ${c.eliminated_episode})` : ''}`
    : 'Active'
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">My groups</h1>
      {groups.isLoading && <p>Loading…</p>}
      {groups.error && <p role="alert" className="text-red-600">{(groups.error as Error).message} <button onClick={() => groups.refetch()} className="underline">Retry</button></p>}
      {groups.data?.length === 0 && <p className="text-stone-600">You're not in any group yet.</p>}
      {groups.data?.map(g => (
        <Link key={g.id} to={`/groups/${g.id}`} className={`${card} block min-h-[44px]`}>
          <div className="font-semibold">{g.name}</div>
          <div className="text-sm text-stone-500">
            {games.data?.filter(x => x.group_id === g.id).map(x => `Season ${x.seasons.number}: ${x.status}`).join(' · ') || 'No game yet'}
          </div>
        </Link>
      ))}
      <Link to="/groups/new" className={btn}>Create a group</Link>
      <p className="text-sm text-stone-500">Got an invite link? Open it to join a group.</p>
      {season && (
        <section aria-labelledby="season-heading" className={card}>
          <h2 id="season-heading" className="text-2xl font-bold">
            Season {season.number}{season.title && season.title !== `Survivor ${season.number}` ? `: ${season.title}` : ''}
          </h2>
          {seasons.data && seasons.data.length > 1 && (
            <select aria-label="Season" value={season.number} onChange={e => setParams({ season: e.target.value }, { replace: true })}
              className="mt-2 min-h-[44px] w-full rounded-lg border bg-white px-3">
              {seasons.data.map(s => <option key={s.id} value={s.number}>Season {s.number}{s.title && s.title !== `Survivor ${s.number}` ? `: ${s.title}` : ''}</option>)}
            </select>
          )}
          {contestants.isLoading && <p>Loading…</p>}
          {contestants.error && <p role="alert" className="text-red-600">{(contestants.error as Error).message} <button onClick={() => contestants.refetch()} className="underline">Retry</button></p>}
          <ul className="mt-2 divide-y divide-stone-200">
            {contestants.data?.map(c => (
              <li key={c.id}>
                <Link to={`/contestants/${c.id}`} className="flex min-h-[44px] items-center justify-between gap-2">
                  <span className={`underline ${c.status === 'eliminated' ? 'text-stone-500 line-through' : ''}`}>{c.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-sm ${c.status === 'eliminated' ? 'bg-stone-200 text-stone-700' : 'bg-green-100 text-green-800'}`}>{badge(c)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
