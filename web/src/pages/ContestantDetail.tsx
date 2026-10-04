import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export default function ContestantDetail() {
  const { id } = useParams()
  const { data: c, isLoading } = useQuery({ queryKey: ['contestant', id], queryFn: () => api.contestant(Number(id)) })
  if (isLoading) return <p>Loading…</p>
  if (!c) return <p>Not found.</p>
  return (
    <main className="flex flex-col gap-3">
      {c.photo_url && <img src={c.photo_url} alt={c.name} className="w-full rounded-xl" />}
      <h1 className="text-2xl font-bold">{c.name} {c.status !== 'active' && <span className="text-sm text-red-600">({c.status}{c.eliminated_episode ? `, ep ${c.eliminated_episode}` : ''})</span>}</h1>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
        {c.age && <><dt className="text-stone-500">Age</dt><dd>{c.age}</dd></>}
        {c.occupation && <><dt className="text-stone-500">Job</dt><dd>{c.occupation}</dd></>}
        {c.hometown && <><dt className="text-stone-500">From</dt><dd>{c.hometown}</dd></>}
        {c.current_residence && <><dt className="text-stone-500">Lives in</dt><dd>{c.current_residence}</dd></>}
      </dl>
      {c.bio && <p>{c.bio}</p>}
      <p className="text-xs text-stone-500">
        {c.bio_source_url && <>Bio: <a className="underline" href={c.bio_source_url}>source</a> {c.bio_license && `(${c.bio_license})`} </>}
        {c.photo_source_url && <>Photo: <a className="underline" href={c.photo_source_url}>source</a></>}
      </p>
    </main>
  )
}
