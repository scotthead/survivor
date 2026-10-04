import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export default function JoinGroup() {
  const { code } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  useEffect(() => {
    api.rpc('join_group', { code }).then(async id => {
      await qc.invalidateQueries({ queryKey: ['groups'] })
      nav(`/groups/${id}`, { replace: true })
    }).catch(e => setErr((e as Error).message))
  }, [code, nav, qc])
  return err ? <p role="alert" className="text-red-600">{err}</p> : <p>Joining group…</p>
}
