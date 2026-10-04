import { supabase } from './supabase'
import type { Contestant, Game, Group, Pick, Profile, Season } from '../types'

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export const api = {
  groups: async () => check(await supabase.from('groups').select('*').order('created_at')) as Group[],
  group: async (id: string) => check(await supabase.from('groups').select('*').eq('id', id).single()) as Group,
  members: async (id: string) =>
    check(await supabase.from('group_members').select('role, profiles(id, display_name)').eq('group_id', id)) as unknown as
      { role: string; profiles: Pick2<Profile, 'id' | 'display_name'> }[],
  gamesForGroup: async (id: string) => check(await supabase.from('games').select('*').eq('group_id', id)) as Game[],
  allGames: async () => check(await supabase.from('games').select('*, groups(name), seasons(number)').order('created_at', { ascending: false })) as unknown as
    (Game & { groups: { name: string }; seasons: { number: number } })[],
  game: async (id: string) => check(await supabase.from('games').select('*').eq('id', id).single()) as Game,
  picks: async (gameId: string) => check(await supabase.from('picks').select('*').eq('game_id', gameId)) as Pick[],
  winners: async (gameId: string) => check(await supabase.from('game_winners').select('user_id').eq('game_id', gameId)) as { user_id: string }[],
  allWinners: async () => check(await supabase.from('game_winners').select('game_id, user_id')) as { game_id: string; user_id: string }[],
  myPicks: async () => check(await supabase.from('picks').select('*, contestants(name, status, eliminated_episode)')) as unknown as
    (Pick & { contestants: { name: string; status: string; eliminated_episode: number | null } })[],
  seasons: async () => check(await supabase.from('seasons').select('*').order('number', { ascending: false })) as Season[],
  contestants: async (seasonId: number) =>
    check(await supabase.from('contestants').select('*').eq('season_id', seasonId).order('name')) as Contestant[],
  contestant: async (id: number) => check(await supabase.from('contestants').select('*').eq('id', id).single()) as Contestant,
  rpc: async (fn: string, args: Record<string, unknown>) => check(await supabase.rpc(fn, args)),
}
type Pick2<T, K extends keyof T> = { [P in K]: T[P] }
