import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { btn } from '../components/Layout'

export default function NewGroup() {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const nav = useNavigate()
  const qc = useQueryClient()
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const id = await api.rpc('create_group', { group_name: name }) as string
      await qc.invalidateQueries({ queryKey: ['groups'] })
      nav(`/groups/${id}`)
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">New group</h1>
      <input required placeholder="Group name" value={name} onChange={e => setName(e.target.value)} className="min-h-[44px] rounded-lg border px-3" />
      <button className={btn}>Create</button>
      {err && <p role="alert" className="text-red-600">{err}</p>}
    </form>
  )
}
