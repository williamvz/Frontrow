#!/usr/bin/env bash
# Reads the Home Assistant add-on options (when running under the Supervisor)
# and hands them to the server as environment variables. Running standalone via
# docker-compose there is no /data/options.json and plain env vars are used.
set -euo pipefail

OPTIONS=/data/options.json

if [ -f "$OPTIONS" ]; then
  get()      { jq -r --arg d "$2" ".${1} // \$d" "$OPTIONS"; }
  getlist()  { jq -r "(.${1} // []) | join(\",\")" "$OPTIONS"; }

  export FAVOURITE_TEAM="$(get favourite_team '')"
  export COMPETITIONS="$(getlist competitions)"
  export LANGUAGE="$(get language 'nl')"
  export GOAL_NOTIFICATIONS="$(get goal_notifications 'true')"
  export HA_NOTIFY_SERVICE="$(get ha_notify_service '')"
  export HA_GOAL_EVENT="$(get ha_goal_event 'true')"
  export LOG_LEVEL="$(get log_level 'info')"
  [ "$(get demo_mode 'false')" = "true" ] && export DEMO_MODE=1

  export DB_PATH="${DB_PATH:-/data/frontrow.db}"
  export RUNNING_UNDER_SUPERVISOR=1
fi

if [ "${DEMO_MODE:-}" = "1" ]; then
  # The demo replays a scripted matchday against a throwaway database so the
  # real history is never touched. A fresh demo starts on every restart.
  export DB_PATH="${DEMO_DB_PATH:-/data/frontrow-demo.db}"
  rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
  echo "🎬 DEMO-MODUS — gesimuleerde speelronde op ${DB_PATH} (echte database blijft ongemoeid)"
fi

export PORT="${PORT:-8199}"
export DB_PATH="${DB_PATH:-/data/frontrow.db}"

echo "⚽ Frontrow start op poort ${PORT} — database ${DB_PATH}"
exec node /app/src/server.js
