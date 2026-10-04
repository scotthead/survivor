export interface Season { id: number; number: number; title: string | null; location: string | null; status: string }
export interface Contestant {
  id: number; season_id: number; name: string; photo_url: string | null; age: number | null
  occupation: string | null; hometown: string | null; current_residence: string | null; bio: string | null
  status: 'active' | 'eliminated' | 'winner'; eliminated_episode: number | null
  jury_votes_received: number | null; photo_source_url: string | null; bio_source_url: string | null; bio_license: string | null
}
export interface Profile { id: string; display_name: string; avatar_url: string | null; is_admin: boolean }
export interface Group { id: string; name: string; owner_id: string; invite_code: string }
export interface Game { id: string; group_id: string; season_id: number; status: 'picking' | 'in_progress' | 'completed'; completed_at: string | null }
export interface Pick { id: string; game_id: string; user_id: string; contestant_id: number }
