# Survivor Last Man Standing — Implementation Specification

Source: `requirements.md`. Status: draft for review.

## 1. Summary

A web app where friends form groups, each member picks one Survivor castaway (unique per group) after episode 1, and the last member whose castaway remains in the game wins. Past games and results are viewable.

## 2. Key Decisions

| Area | Decision | Rationale |
|---|---|---|
| Frontend | React + TypeScript, Vite, React Router, TanStack Query, Tailwind | Lightweight, runs locally with `npm run dev` |
| Auth | **Supabase Auth** (email magic link + Google OAuth) | Already using Supabase; zero custom auth code; no passwords to store |
| Database | Supabase Postgres with Row Level Security (RLS) | Frontend talks to Supabase directly for nearly everything |
| Backend | Small **Python FastAPI** service, used only for admin/data-ingestion tasks (contestant import, elimination updates) | Python is "if necessary"; user-facing CRUD doesn't need it. Can be deferred past MVP |
| Business rules | Enforced in Postgres (constraints, RPC functions, triggers) | Uniqueness and winner logic must be tamper-proof regardless of client |
| Local hosting | Vite dev server (5173) + optional `uvicorn` (8000) against the hosted Supabase project | Matches "host locally for now" |

### Hosting (Vercel)
- Deploy the Vite/React app from `web/` to **Vercel** (free Hobby tier, preview deploys per branch). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project's environment variables.
- If the Python admin API is kept, deploy it as a Vercel Python (FastAPI) serverless function under `/api`, with `SUPABASE_SERVICE_ROLE_KEY` set as a server-only environment variable. Function time limits apply, so long scrapes should run as a local one-off script instead.
- After the first deploy, add the Vercel production URL to Supabase Auth → Site URL / redirect URLs (keep `http://localhost:5173` for local development).

### Login setup (minimal config)
- Enable Email (magic link) in Supabase dashboard → Auth → Providers; set Site URL `http://localhost:5173` and add redirect URLs.
- Optional Google OAuth: create an OAuth client, paste client ID/secret into Supabase.
- Frontend uses `@supabase/supabase-js` (`signInWithOtp`, `signInWithOAuth`, `onAuthStateChange`). Only the **publishable (anon) key** goes in frontend env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). The service-role key is only used by the Python service and never committed (`.env` is gitignored).

## 3. Domain Model

- **Season**: a Survivor season; one is "current/active".
- **Contestant** (castaway): belongs to a season; has status and elimination info.
- **Game**: one group's play-through of one season.
- **Group**: persistent set of users; hosts games across seasons.
- **Pick**: a member's chosen contestant in a game.

## 4. Database Schema (Postgres)

```sql
profiles(id uuid pk references auth.users, display_name text not null, avatar_url text, created_at timestamptz)

seasons(id serial pk, number int unique not null, title text, location text,
        start_date date, end_date date,
        status text check (status in ('upcoming','airing','completed')),
        winner_contestant_id int null)

contestants(id serial pk, season_id int references seasons, name text not null,
            photo_url text, age int, occupation text,
            hometown text, current_residence text, bio text, wiki_url text,
            status text check (status in ('active','eliminated','winner')) default 'active',
            eliminated_episode int null, finish_place int null,
            jury_votes_received int null,      -- votes at final tribal council (tie-break)
            photo_source_url text, bio_source_url text, bio_license text,  -- attribution
            unique(season_id, name))

episodes(id serial pk, season_id int references seasons, number int, air_date date,
         unique(season_id, number))      -- optional but useful for "after episode 1" gating

groups(id uuid pk default gen_random_uuid(), name text not null,
       owner_id uuid references profiles, invite_code text unique not null, created_at)

group_members(group_id uuid references groups, user_id uuid references profiles,
              role text check (role in ('owner','member')), joined_at,
              primary key(group_id, user_id))

games(id uuid pk, group_id uuid references groups, season_id int references seasons,
      status text check (status in ('picking','in_progress','completed')) default 'picking',
      picks_open_after_episode int default 1,   -- picks open once this episode has aired
      winner_user_id uuid null, completed_at timestamptz null,
      unique(group_id, season_id))

picks(id uuid pk, game_id uuid references games, user_id uuid references profiles,
      contestant_id int references contestants, picked_at timestamptz,
      unique(game_id, user_id),            -- one pick per player per game
      unique(game_id, contestant_id))      -- same castaway can't be picked twice in a game
```

Derived view `game_standings(game_id, user_id, contestant_id, is_alive, eliminated_episode)` joins picks → contestants.

### Business rules enforced in DB
- **Unique picks**: the two `unique` constraints above (race-safe).
- **Pick window** (resolved): RPC `make_pick(game_id, contestant_id)` verifies caller is a group member, the game is `picking`, the contestant belongs to the game's season and is still `active`, and picks are open (episode 1 has aired). Calling it again **replaces** the caller's existing pick (upsert on `(game_id, user_id)`) while the game is `picking`. Picks are written only via this RPC (no direct INSERT/UPDATE policy).
- **Winner determination** (resolved): trigger on `contestants` update recomputes each `in_progress` game of that season:
  1. Exactly one pick alive → that user wins.
  2. Last alive picks are eliminated in the same episode (simultaneous) → all those users are **co-winners**.
  3. Final episode, every remaining pick's castaway loses the final vote → rank those picks by `jury_votes_received`; highest wins; equal votes → **co-winners**.
  4. Co-winners stored in `game_winners(game_id, user_id)`; `games.winner_user_id` is replaced by this table. A user who picked the actual season winner while others are still alive is simply alive, not an automatic winner.
- **Lock rule** (resolved): the game moves `picking → in_progress` automatically when the **second contestant of the season is eliminated** (trigger on `contestants`, counting eliminated rows for the season). Until then everything stays open; after it, no new members can join the game, and no picks can be added or changed. No manual lock or deadline. A user who has not picked by lock time is not in the game.

### Elimination permissions
Contestants are shared across all groups, so an elimination recorded by one group owner affects every game of that season. Controls: `record_elimination(contestant_id, episode, jury_votes)` RPC allowed only for `is_admin` or users who own at least one group; every call is written to `elimination_events(id, contestant_id, episode, recorded_by, recorded_at, previous_status)`; the admin can revert an event. Add `is_admin boolean default false` to `profiles`.

### RLS policies
- `profiles`: read own + profiles of users sharing a group; update own.
- `seasons`, `contestants`, `episodes`: public read; writes only service role.
- `groups`/`group_members`/`games`/`picks`: readable only by members of the group. Joining a group occurs via RPC `join_group(invite_code)`, which always works for the group itself; participation in a game is a separate step: `join_game(game_id)` is rejected once the game is `in_progress` (late joiners only before the second elimination). Creating a group uses RPC `create_group(name)` (inserts owner membership atomically).
- Picks are visible to all group members immediately (resolved).

## 5. Frontend

### Routes
| Route | Purpose |
|---|---|
| `/login` | Magic link / Google sign-in |
| `/` | Dashboard: my groups, active games, quick status |
| `/groups/new`, `/groups/join/:code` | Create group; join via invite link/code |
| `/groups/:id` | Group page: members, games list, invite link, start a game for a season |
| `/games/:id` | Game page: standings, my pick, who is alive/out, win banner |
| `/games/:id/pick` | Contestant browser with "Pick" action |
| `/seasons/:n/contestants` and `/contestants/:id` | Browse and view profiles (name, photo, job, hometown, current residence, bio) |
| `/history` | Past games: season, group, my pick, finish, won/lost |

### Components
`ContestantCard`, `ContestantProfile`, `PickConfirmDialog`, `StandingsTable` (alive/eliminated with episode), `WinnerBanner` ("You're the last one standing — you won!"), `EliminatedBanner`, `InviteLink`, `ProtectedRoute`.

### Mobile-first design (primary interface)
Most players will use the site on a phone, so design and test for mobile first, then scale up to tablet/desktop.
- **Layout:** mobile-first Tailwind (base styles are the phone layout; `md:`/`lg:` add wider layouts). Single-column content, 16px side padding, no horizontal scrolling at 320px width and up. Use `<meta name="viewport" content="width=device-width, initial-scale=1">` and `100dvh` (not `100vh`) so mobile browser toolbars don't break layouts; respect safe-area insets (`env(safe-area-inset-*)`) on notched phones.
- **Navigation:** fixed bottom tab bar (Home, Contestants, My Game, History) within thumb reach, instead of a top menu. Group/game switcher as a bottom sheet.
- **Touch targets:** at least 44x44px for buttons and tappable cards; adequate spacing between adjacent actions; primary actions (Pick, Join) sit at the bottom of the screen or in a sticky footer.
- **Contestant browser:** two-column photo-card grid on phones (one column below ~360px), with search and an "available only" filter in a sticky header. Tapping opens a full-screen profile with a sticky "Pick this player" button; confirmation in a bottom-sheet dialog.
- **Standings:** card list rather than wide tables (avatar, player, castaway, alive/out badge); no table that requires horizontal scroll.
- **Forms/login:** correct input types (`type="email"`, `inputmode`, `autocomplete`) and 16px+ font size so iOS doesn't zoom on focus. Magic-link login is phone-friendly (no password typing).
- **Performance:** target Lighthouse mobile score of 90+; responsive photos (`srcset`, `loading="lazy"`, resized/WebP variants generated at import into Supabase Storage), route-level code splitting, and TanStack Query caching so repeat visits feel instant on cellular connections. Skeleton loaders for lists.
- **Resilience:** clear offline/slow-network error states with retry; Realtime reconnects when the app returns to the foreground.
- **Installable (optional PWA):** web app manifest and icons so players can "Add to Home Screen"; service worker for caching static assets only (no offline picks).
- **Accessibility:** WCAG AA contrast, visible focus states, labels on icon buttons, support for dynamic text size and `prefers-color-scheme`/`prefers-reduced-motion`.

### Behavior
- Contestant profile pages show a source/license attribution line (e.g. "Bio from Survivor Wiki, CC BY-SA" with links) and photo credit.
- Contestant browser shows picks already taken by others in the game as disabled with the owner's name; eliminated contestants are not pickable.
- Live updates: subscribe to Supabase Realtime on `contestants` and `games` so standings update when an elimination is recorded.
- Winner/eliminated state is derived from `game_standings` and `games.winner_user_id`.
- History page aggregates `games` + `picks` for the user: result (winner / eliminated in episode N / season placement) and win count.

## 6. Python Backend (FastAPI, optional for MVP)

Uses the service-role key; endpoints protected by an admin API key or by verifying a Supabase JWT with an `is_admin` claim.

- `POST /admin/seasons/{n}/import` — scrape and save contestants (name, photo, age, job, hometown, residence, bio) from the sources in `requirements.md` (People cast list, Survivor Fandom wiki, Wikipedia for history). Idempotent upsert on `(season_id, name)`. Download photos into Supabase Storage (public bucket) and record source URLs. Store `bio_source_url` and `bio_license` (Fandom text is CC BY-SA, so show attribution and a link to the source page and license; keep derived text under the same license). Respect robots.txt, rate-limit requests, and cache results so scraping runs once per contestant.
- `POST /admin/contestants/{id}/eliminate` `{episode, jury_votes?}` — sets status/episode (and final-vote counts); DB trigger resolves games. Caller must be a site admin or a group owner (see §4 permissions).
- `POST /admin/seasons/{n}/winner` — marks sole winner and completes season.
- `POST /admin/history/import` — one-time backfill of past seasons for the history feature.
- Simplest alternative: elimination updates done through a protected admin page in the React app, available to the site admin and group owners; import run as a one-off Python script. **Recommended for MVP.**

## 7. Project Layout

```
survivor/
  web/            # Vite + React + TS
    src/{pages,components,lib/supabase.ts,hooks,types}
  api/            # FastAPI (optional) — app/, scripts/import_season.py, requirements.txt
  supabase/migrations/   # SQL migrations (schema, RLS, functions, triggers)
  .env.example    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```
Types generated via Supabase `generate_typescript_types` into `web/src/types/database.ts`.

## 8. Implementation Phases

1. **Foundation**: scaffold `web/`, Supabase client, auth (magic link), protected routes, profile auto-create trigger.
2. **Schema**: migrations for all tables, constraints, RLS, RPCs (`create_group`, `join_group`, `join_game`, `make_pick`), winner trigger. Run Supabase security advisor afterward.
3. **Contestants**: Python import script for the current season; contestant browse + profile pages.
4. **Groups & games**: create/join group, create game, pick flow with uniqueness handling and clear error messages.
5. **Tracking**: standings page, realtime updates, elimination/win banners, admin page for recording eliminations.
6. **History**: backfill past seasons; history page with results and stats.
7. **Polish & hosting**: mobile QA on real iOS Safari and Android Chrome devices, performance pass, empty/error states, deploy to Vercel (frontend, plus the Python function if the API is kept).

## 9. Testing

- SQL tests (pgTAP or scripted) for: duplicate pick rejected, pick by non-member rejected, pick of eliminated contestant rejected, winner trigger (one survivor, simultaneous elimination, all eliminated).
- Mobile: Playwright runs the smoke test with iPhone and Pixel device emulation (and a 320px viewport); manual check on real devices; Lighthouse mobile run in CI.
- Frontend: Vitest + React Testing Library for pick flow and standings states; Playwright smoke test for login → join group → pick.
- RLS tests: user A cannot read group B's data.

## 10. Open Questions

- **O1 Season** (resolved): Season 51 is the current season as of October 2026. Load it first; the schema still supports multiple seasons for history.
- **O2 Pick visibility** (resolved): picks are visible immediately.
- **O3 Tie rule** (resolved): simultaneous elimination → co-winners; final-episode loss of all remaining picks → most jury votes wins; equal votes → co-winners.
- **O4 Content/imagery** (resolved): scrape and save, with attribution (see §6 import and UI footer on contestant pages).
- **O5 Late joiners / changing picks** (resolved): joining and pick changes are allowed until the second elimination of the season, then locked (see lock rule).
- **O6 Admin** (resolved): the site admin (`profiles.is_admin`) or any group owner can record eliminations.
- **O7 Notifications** (resolved): none. Players log in to check status; the app has no email/push alerts.
