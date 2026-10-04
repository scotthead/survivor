import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { card } from '../components/Layout'

export default function History() {
  const me = useAuth().session?.user.id
  const games = useQuery({ queryKey: ['games'], queryFn: api.allGames })
  const picks = useQuery({ queryKey: ['myPicks'], queryFn: api.myPicks })
  const winners = useQuery({ queryKey: ['allWinners'], queryFn: api.allWinners })
  const done = games.data?.filter(g => g.status === 'completed') ?? []
  const wins = done.filter(g => winners.data?.some(w => w.game_id === g.id && w.user_id === me)).length
  return (
    <main className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">History</h1>
      <p className="text-stone-600">{wins} win{wins === 1 ? '' : 's'} in {done.length} completed game{done.length === 1 ? '' : 's'}</p>
      {done.length === 0 && <p className="text-stone-500">No completed games yet.</p>}
      {done.map(g => {
        const p = picks.data?.find(p => p.game_id === g.id && p.user_id === me)
        const won = winners.data?.some(w => w.game_id === g.id && w.user_id === me)
        return (
          <div key={g.id} className={card}>
            <div className="font-semibold">Season {g.seasons.number} — {g.groups.name}</div>
            <div className="text-sm text-stone-600">
              {p ? `Picked ${p.contestants.name}${p.contestants.eliminated_episode ? `, out ep ${p.contestants.eliminated_episode}` : ''}` : 'No pick'} · {won ? 'Won 🏆' : 'Lost'}
            </div>
          </div>
        )
      })}
    </main>
  )
}
