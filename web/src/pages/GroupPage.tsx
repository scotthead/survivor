import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { btn, card } from '../components/Layout'
import { useAuth } from '../hooks/useAuth'

export default function GroupPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { session } = useAuth()
  const group = useQuery({ queryKey: ['group', id], queryFn: () => api.group(id) })
  const members = useQuery({ queryKey: ['members', id], queryFn: () => api.members(id) })
  const games = useQuery({ queryKey: ['groupGames', id], queryFn: () => api.gamesForGroup(id) })
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: api.seasons })
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (group.isLoading) return <p>Loading…</p>
  if (!group.data) return <p role="alert" className="text-red-600">Group not found.</p>
  const invite = `${window.location.origin}/groups/join/${group.data.invite_code}`

  async function startGame(sid: number) {
    try {
      await api.rpc('create_game', { gid: id, sid })
      qc.invalidateQueries({ queryKey: ['groupGames', id] }); qc.invalidateQueries({ queryKey: ['games'] })
    } catch (e) { setErr((e as Error).message) }
  }
  async function deleteGroup() {
    setDeleting(true)
    try {
      await api.rpc('delete_group', { gid: id })
      qc.removeQueries({ queryKey: ['group', id] })
      qc.invalidateQueries({ queryKey: ['groups'] }); qc.invalidateQueries({ queryKey: ['games'] })
      navigate('/', { replace: true })
    } catch (e) { setErr((e as Error).message); setDeleting(false); setConfirmDelete(false) }
  }
  const isOwner = group.data.owner_id === session?.user.id
  const unstarted = seasons.data?.filter(s => !games.data?.some(g => g.season_id === s.id)) ?? []

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{group.data.name}</h1>
      <section className={card}>
        <h2 className="font-semibold">Invite link</h2>
        <p className="break-all text-sm text-stone-600">{invite}</p>
        <button className={`${btn} mt-2`} onClick={() => { navigator.clipboard?.writeText(invite); setCopied(true) }}>{copied ? 'Copied!' : 'Copy link'}</button>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Games</h2>
        {games.data?.map(g => (
          <Link key={g.id} to={`/games/${g.id}`} className={`${card} block min-h-[44px]`}>
            Season {seasons.data?.find(s => s.id === g.season_id)?.number} — {g.status}
          </Link>
        ))}
        {unstarted.map(s => (
          <button key={s.id} className={btn} onClick={() => startGame(s.id)}>Start game for Season {s.number}</button>
        ))}
        {seasons.data?.length === 0 && <p className="text-stone-500">No seasons loaded yet.</p>}
        {err && <p role="alert" className="text-red-600">{err}</p>}
      </section>
      <section>
        <h2 className="font-semibold">Members</h2>
        <ul className="list-disc pl-5">{members.data?.map(m => <li key={m.profiles.id}>{m.profiles.display_name}{m.role === 'owner' && ' (owner)'}</li>)}</ul>
      </section>
      {isOwner && (
        <section className={`${card} border-red-300`}>
          <h2 className="font-semibold text-red-700">Delete group</h2>
          {!confirmDelete ? (
            <button className={`${btn} mt-2 !bg-red-600`} onClick={() => setConfirmDelete(true)}>Delete group…</button>
          ) : (
            <div role="alertdialog" aria-labelledby="del-warn" className="mt-2 flex flex-col gap-2">
              <p id="del-warn" className="text-sm text-red-700">
                This permanently deletes “{group.data.name}” for all {members.data?.length ?? ''} members, including its
                games, picks and results{games.data?.length ? ` (${games.data.length} game${games.data.length === 1 ? '' : 's'})` : ''}. This cannot be undone.
              </p>
              <button className={`${btn} !bg-red-600`} disabled={deleting} onClick={deleteGroup}>{deleting ? 'Deleting…' : 'Yes, delete this group'}</button>
              <button className={btn} disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
