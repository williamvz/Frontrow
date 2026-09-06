#!/usr/bin/env sh
# Reads the Home Assistant app options and hands them to the server as
# environment variables. Running standalone under docker-compose there is no
# /data/options.json and plain env vars are used instead.
set -eu

OPTIONS=/data/options.json

if [ -f "$OPTIONS" ]; then
  get()     { jq -r --arg d "$2" ".${1} // \$d" "$OPTIONS"; }
  getlist() { jq -r "(.${1} // []) | join(\",\")" "$OPTIONS"; }

  FAVOURITE_TEAM="$(get favourite_team '')"
  COMPETITIONS="$(getlist competitions)"
  LANGUAGE="$(get language 'nl')"
  GOAL_NOTIFICATIONS="$(get goal_notifications 'true')"
  HA_NOTIFY_SERVICE="$(get ha_notify_service '')"
  VAPID_CONTACT="$(get vapid_contact '')"
  LOG_LEVEL="$(get log_level 'info')"
  export FAVOURITE_TEAM COMPETITIONS LANGUAGE GOAL_NOTIFICATIONS \
         HA_NOTIFY_SERVICE VAPID_CONTACT LOG_LEVEL
  [ "$(get demo_mode 'false')" = "true" ] && export DEMO_MODE=1

  # Only inside the Supervisor is the X-Remote-User-* header trustworthy.
  export RUNNING_UNDER_SUPERVISOR=1
  export DB_PATH="${DB_PATH:-/data/frontrow.db}"
fi

if [ "${DEMO_MODE:-}" = "1" ]; then
  # The demo replays a scripted matchday against a throwaway database, so the
  # real history is never touched. A fresh demo starts on every restart.
  export DB_PATH="${DEMO_DB_PATH:-/data/frontrow-demo.db}"
  rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
  echo "🎬 DEMO-MODUS — gesimuleerde speelronde op ${DB_PATH} (echte database blijft ongemoeid)"
fi

export PORT="${PORT:-8199}"
export DB_PATH="${DB_PATH:-/data/frontrow.db}"

echo "⚽ Frontrow start op poort ${PORT} — database ${DB_PATH}"

# exec so the container's init forwards SIGTERM straight to Node, which closes
# the database cleanly instead of being killed with an open WAL.
exec node /app/src/server.js
