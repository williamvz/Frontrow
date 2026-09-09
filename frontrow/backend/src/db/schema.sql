-- ---------------------------------------------------------------------------
-- Frontrow schema.
--
-- Two families of tables live here:
--   * the football model (competitions … match_events) — a canonical view that
--     every provider is normalised into, never provider-shaped;
--   * the app model (profiles … push_subscriptions) — who follows what, and
--     how they want to be told about it.
--
-- Everything a provider tells us is written here; the API serves only from
-- these tables, so the app keeps working when a provider is down and the
-- history keeps growing every season.
-- ---------------------------------------------------------------------------

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------- competitions
CREATE TABLE IF NOT EXISTS competitions (
  id            TEXT PRIMARY KEY,          -- 'eredivisie'
  name_nl       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  short_name    TEXT NOT NULL,             -- 'Eredivisie'
  abbr          TEXT NOT NULL,             -- 'ERE'  (used in dense UI)
  country       TEXT NOT NULL DEFAULT 'NL',
  kind          TEXT NOT NULL,             -- league | cup | supercup | international
  tier          INTEGER,                   -- 1, 2 … for leagues; NULL for cups
  has_table     INTEGER NOT NULL DEFAULT 1,
  accent        TEXT,                      -- competition accent colour (hex)
  espn_slug     TEXT,                      -- 'ned.1'
  sportsdb_id   TEXT,                      -- '4337'
  sort_order    INTEGER NOT NULL DEFAULT 100,
  enabled       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS seasons (
  id             TEXT PRIMARY KEY,         -- 'eredivisie:2026-2027'
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,            -- '2026/27'
  start_year     INTEGER NOT NULL,
  end_year       INTEGER NOT NULL,
  is_current     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_seasons_comp ON seasons(competition_id, is_current);

-- --------------------------------------------------------------------- teams
CREATE TABLE IF NOT EXISTS teams (
  id              TEXT PRIMARY KEY,        -- 'ajax'
  name            TEXT NOT NULL,           -- display name, 'Ajax'
  full_name       TEXT,                    -- 'AFC Ajax'
  short_name      TEXT NOT NULL,           -- fits a narrow column, 'Ajax'
  code            TEXT,                    -- 'AJA'
  city            TEXT,
  stadium         TEXT,
  founded         INTEGER,
  country         TEXT NOT NULL DEFAULT 'NL',
  crest           TEXT,                    -- local crest asset id, e.g. 'ajax'
  crest_url       TEXT,                    -- remote fallback
  primary_color   TEXT,                    -- '#D2122E'
  secondary_color TEXT,
  is_national     INTEGER NOT NULL DEFAULT 0,
  aliases         TEXT NOT NULL DEFAULT '[]'  -- JSON array of normalised names
);
CREATE INDEX IF NOT EXISTS idx_teams_country ON teams(country);

-- Provider ids are *learned*: the first time a provider's team is matched by
-- name, its id is remembered so later syncs skip fuzzy matching entirely.
CREATE TABLE IF NOT EXISTS team_providers (
  team_id          TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,          -- 'espn' | 'sportsdb' | 'replay'
  provider_team_id TEXT NOT NULL,
  PRIMARY KEY (team_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_team_providers_lookup ON team_providers(provider, provider_team_id);

-- Which teams take part in which season — drives the table and the team pages.
CREATE TABLE IF NOT EXISTS season_teams (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (season_id, team_id)
);

-- ------------------------------------------------------------------- matches
CREATE TABLE IF NOT EXISTS matches (
  id                TEXT PRIMARY KEY,      -- stable, provider-independent id
  competition_id    TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  season_id         TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  stage             TEXT NOT NULL DEFAULT 'league',
                                           -- league | group | r64 … | final
  round_label       TEXT,                  -- 'Speelronde 4', 'Achtste finale'
  matchday          INTEGER,
  home_team_id      TEXT REFERENCES teams(id),
  away_team_id      TEXT REFERENCES teams(id),
  kickoff_utc       TEXT NOT NULL,         -- ISO 8601, always UTC
  status            TEXT NOT NULL,         -- scheduled|live|halftime|finished|
                                           -- postponed|cancelled|abandoned
  status_detail     TEXT,                  -- 'FT' | 'AET' | 'PEN' | 'Uitgesteld'
  minute            INTEGER,               -- 67
  minute_display    TEXT,                  -- "45+2'"
  home_score        INTEGER,
  away_score        INTEGER,
  home_score_ht     INTEGER,
  away_score_ht     INTEGER,
  home_pens         INTEGER,
  away_pens         INTEGER,
  winner_team_id    TEXT REFERENCES teams(id),
  venue             TEXT,
  attendance        INTEGER,
  referee           TEXT,
  broadcaster       TEXT,                  -- 'ESPN 1', 'Ziggo Sport'
  provider          TEXT,                  -- provider that last wrote the score
  provider_match_id TEXT,
  has_lineups       INTEGER NOT NULL DEFAULT 0,
  has_stats         INTEGER NOT NULL DEFAULT 0,
  started_at        TEXT,
  finished_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff  ON matches(kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_matches_status   ON matches(status, kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_matches_season   ON matches(season_id, kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_matches_home     ON matches(home_team_id, kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_matches_away     ON matches(away_team_id, kickoff_utc);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_provider
  ON matches(provider, provider_match_id) WHERE provider_match_id IS NOT NULL;

-- Every goal, card and substitution as an immutable row. The live feed, the
-- match timeline, the top-scorer list and the goal notifications all read from
-- here, so a goal is recorded exactly once and never double-counted.
CREATE TABLE IF NOT EXISTS match_events (
  id           TEXT PRIMARY KEY,           -- deterministic hash of the event
  match_id     TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id      TEXT REFERENCES teams(id),
  type         TEXT NOT NULL,              -- goal|own_goal|penalty|penalty_missed
                                           -- yellow|second_yellow|red|substitution
                                           -- var|period_start|period_end
  minute       INTEGER,
  minute_extra INTEGER,                    -- the '+2' of 45+2
  minute_display TEXT,
  player_name  TEXT,
  player_id    TEXT,
  assist_name  TEXT,
  related_name TEXT,                       -- player coming off, for a sub
  home_score   INTEGER,                    -- score *after* this event
  away_score   INTEGER,
  detail       TEXT,
  sort_key     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id, sort_key);
CREATE INDEX IF NOT EXISTS idx_events_scorer ON match_events(type, player_name);

-- Team statistics for a finished/live match (possession, shots, …), stored
-- long so a provider adding a new metric needs no migration.
CREATE TABLE IF NOT EXISTS match_stats (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id  TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  metric   TEXT NOT NULL,                  -- possession|shots|shots_on_target|…
  value    REAL NOT NULL,
  PRIMARY KEY (match_id, team_id, metric)
);

CREATE TABLE IF NOT EXISTS lineups (
  match_id    TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_id   TEXT,
  shirt       INTEGER,
  position    TEXT,                        -- GK|DF|MF|FW
  formation_x REAL,                        -- 0..1 across the pitch
  formation_y REAL,                        -- 0..1 from own goal
  is_starter  INTEGER NOT NULL DEFAULT 1,
  is_captain  INTEGER NOT NULL DEFAULT 0,
  rating      REAL,
  PRIMARY KEY (match_id, team_id, player_name)
);

CREATE TABLE IF NOT EXISTS formations (
  match_id  TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  formation TEXT,                          -- '4-3-3'
  coach     TEXT,
  PRIMARY KEY (match_id, team_id)
);

-- ----------------------------------------------------------------- standings
-- Recomputed from finished matches for leagues; taken from the provider when
-- the competition has rules we do not model. `source` records which.
CREATE TABLE IF NOT EXISTS standings (
  season_id      TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  group_key      TEXT NOT NULL DEFAULT '',  -- '' for a straight league table
  team_id        TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  played         INTEGER NOT NULL DEFAULT 0,
  won            INTEGER NOT NULL DEFAULT 0,
  drawn          INTEGER NOT NULL DEFAULT 0,
  lost           INTEGER NOT NULL DEFAULT 0,
  goals_for      INTEGER NOT NULL DEFAULT 0,
  goals_against  INTEGER NOT NULL DEFAULT 0,
  goal_diff      INTEGER NOT NULL DEFAULT 0,
  points         INTEGER NOT NULL DEFAULT 0,
  form           TEXT NOT NULL DEFAULT '',  -- 'WWDLW', most recent last
  prev_position  INTEGER,
  zone           TEXT,                      -- champion|ucl|uel|uecl|playoff|relegation
  source         TEXT NOT NULL DEFAULT 'computed',
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (season_id, group_key, team_id)
);

-- A snapshot per matchday so the app can draw "position over time" ribbons.
CREATE TABLE IF NOT EXISTS standings_history (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  matchday  INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  points    INTEGER NOT NULL,
  PRIMARY KEY (season_id, team_id, matchday)
);

-- ---------------------------------------------------------------- app tables
-- No passwords, no accounts. On a home network a profile is just "who is
-- holding the phone": it decides the accent colour, the follows and the alerts.
CREATE TABLE IF NOT EXISTS profiles (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  emoji             TEXT NOT NULL DEFAULT '⚽',
  favourite_team_id TEXT REFERENCES teams(id),
  locale            TEXT NOT NULL DEFAULT 'nl',
  theme             TEXT NOT NULL DEFAULT 'club',  -- club | midnight | pitch
  reduce_motion     INTEGER NOT NULL DEFAULT 0,
  spoiler_free      INTEGER NOT NULL DEFAULT 0,
  is_default        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,               -- team | competition
  target_id   TEXT NOT NULL,
  rank        INTEGER NOT NULL DEFAULT 0,  -- ordering in "Mijn voetbal"
  alerts      TEXT NOT NULL DEFAULT '{}',  -- JSON: which events to be told about
  created_at  TEXT NOT NULL,
  PRIMARY KEY (profile_id, kind, target_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_ok_at TEXT,
  failures   INTEGER NOT NULL DEFAULT 0
);

-- Fired notifications, so a restart never re-announces an old goal.
CREATE TABLE IF NOT EXISTS notifications_sent (
  key        TEXT PRIMARY KEY,             -- profile:event id
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  job        TEXT NOT NULL,                -- live | daily | boot | manual
  provider   TEXT,
  ok         INTEGER,
  matches_seen    INTEGER NOT NULL DEFAULT 0,
  matches_changed INTEGER NOT NULL DEFAULT 0,
  events_added    INTEGER NOT NULL DEFAULT 0,
  message    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_log_time ON sync_log(started_at DESC);
