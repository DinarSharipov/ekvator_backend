#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Run from the existing production Compose directory. Never source or replace .env.
image=${1:?candidate image required}
revision=${2:?release revision required}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release revision'; exit 1; }
test -s .env
test -s docker-compose.yml
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
release="$PWD/backups/release-$(date -u +%Y%m%dT%H%M%SZ)-$revision"
mkdir -m 700 -p "$release"
sha256sum .env docker-compose.yml > "$release/config.sha256"
current=$(docker compose ps -q app)
test -n "$current"
previous=$(docker inspect --format '{{.Image}}' "$current")
candidate=$(docker image inspect --format '{{.Id}}' "$image")
docker image tag "$previous" "dinarsharipov/ekvator:rollback-$revision"
docker image tag "$candidate" "dinarsharipov/ekvator:release-$revision"
printf 'services:\n  app:\n    image: dinarsharipov/ekvator:release-%s\n' "$revision" > "$release/candidate.yml"
printf 'services:\n  app:\n    image: dinarsharipov/ekvator:rollback-%s\n    command: ["node", "main.js"]\n' "$revision" > "$release/rollback.yml"
printf '%s\n' "$previous" > "$release/previous-image"
compose() { docker compose -f docker-compose.yml -f "$release/candidate.yml" "$@"; }
db_image=$(docker inspect --format '{{.Image}}' "$(docker compose ps -q db)")
verify_name="ekvator-verify-${revision:0:12}"
verify_network="$verify_name"
stopped=false
success=false
cleanup() {
  result=$?
  trap - EXIT
  docker rm -f -v "$verify_name" >/dev/null 2>&1 || true
  docker network rm "$verify_network" >/dev/null 2>&1 || true
  if [ "$success" != true ] && [ "$stopped" = true ]; then
    echo 'Deployment failed; restoring previous application image without restoring or resetting production data.'
    docker compose -f docker-compose.yml -f "$release/rollback.yml" up -d --no-deps app || true
  fi
  exit "$result"
}
trap cleanup EXIT
backup() {
  target=$1
  compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$target.partial"
  test -s "$target.partial"
  compose exec -T db pg_restore --list < "$target.partial" > /dev/null
  mv "$target.partial" "$target"
  sha256sum "$target" > "$target.sha256"
  echo "Private backup saved: $target ($(stat -c %s "$target") bytes)"
}
isolated() { docker run --rm -i --network "$verify_network" -e DATABASE_URL=postgresql://verify@db:5432/verify --entrypoint node "$candidate" "$@"; }
production() { compose run --rm -T --no-deps --entrypoint node app "$@"; }

production scripts/auth-preflight.cjs
backup "$release/rehearsal.dump"
docker network create --internal "$verify_network" >/dev/null
docker run -d --name "$verify_name" --network "$verify_network" --network-alias db \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_USER=verify -e POSTGRES_DB=verify \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$db_image" >/dev/null
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$verify_name" pg_isready -U verify -d verify >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
[ "$ready" = true ] || { echo 'Restore database did not become ready'; exit 1; }
if ! docker exec -i "$verify_name" pg_restore -U verify -d verify --no-owner --no-privileges --exit-on-error < "$release/rehearsal.dump" > "$release/restore.log" 2>&1; then
  echo 'Backup restore failed; private log retained, production unchanged'; exit 1
fi
isolated scripts/data-integrity.cjs snapshot > "$release/rehearsal-integrity.json"
isolated node_modules/prisma/build/index.js migrate deploy
isolated scripts/data-integrity.cjs verify < "$release/rehearsal-integrity.json"
isolated scripts/data-integrity.cjs invariants
echo 'Backup restore and migration rehearsal passed.'
docker rm -f -v "$verify_name" >/dev/null
docker network rm "$verify_network" >/dev/null

# Prevent application writes throughout the final backup/migration/integrity window.
stopped=true
docker compose stop -t 30 app
production scripts/data-integrity.cjs snapshot > "$release/production-integrity.json"
backup "$release/before-migration.dump"
production node_modules/prisma/build/index.js migrate deploy
production scripts/data-integrity.cjs verify < "$release/production-integrity.json"
production scripts/data-integrity.cjs invariants
sha256sum -c "$release/config.sha256"
compose up -d --no-deps app
healthy=false
for attempt in $(seq 1 36); do
  container=$(compose ps -q app)
  if [ -n "$container" ]; then
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container")
    if [ "$health" = healthy ]; then healthy=true; break; fi
    if [ "$health" = unhealthy ]; then break; fi
  fi
  sleep 5
done
[ "$healthy" = true ] || { echo 'Candidate health verification failed'; exit 1; }
docker exec "$container" node scripts/production-smoke.cjs
sha256sum -c "$release/config.sha256"
success=true
printf 'healthy\n' > "$release/status"
echo "Backend deployment is healthy. Revision: $revision. Recovery files: $release"
