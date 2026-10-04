import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { btn, card } from '../components/Layout'

export default function Dashboard() {
  const groups = useQuery({ queryKey: ['groups'], queryFn: api.groups })
  const games = useQuery({ queryKey: ['games'], queryFn: api.allGames })
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
    </main>
  )
}
