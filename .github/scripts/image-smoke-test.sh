#!/usr/bin/env bash
#
# Smoke test of the container image (docs/development/deployment-plan.md,
# phase G): starts it as a deployment would (read-only root file system,
# uid 1000, under a base path, without login, with a declared
# infrastructure) and checks health, pages, assets and the API.
#
#   bash .github/scripts/image-smoke-test.sh basyx-studio:dev

set -euo pipefail

IMAGE="${1:?usage: image-smoke-test.sh <image>}"
NAME="studio-smoke-$$"
PORT="${SMOKE_PORT:-3990}"
BASE="http://127.0.0.1:${PORT}"
JAR="$(mktemp)"
DATA_KEY="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")"
INFRASTRUCTURES='{version: 1, infrastructures: [{key: smoke, name: Smoke target, template: mono-all, endpoints: [{type: aasEnvironment, url: "https://basyx.smoke.invalid"}], security: {mode: unsecured}}]}'

cleanup() {
  status=$?
  if [[ $status -ne 0 ]]; then
    echo "--- container logs ---"
    docker logs "${NAME}" 2>&1 | tail -n 100 || true
  fi
  docker rm -f -v "${NAME}" >/dev/null 2>&1 || true
  rm -f "${JAR}"
  exit $status
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

docker run -d --name "${NAME}" \
  --read-only --tmpfs /tmp --user 1000:1000 \
  -p "127.0.0.1:${PORT}:3000" \
  -e STUDIO_BASE_PATH=studio \
  -e "STUDIO_PUBLIC_URL=http://127.0.0.1:${PORT}/studio" \
  -e "STUDIO_DATA_KEY=${DATA_KEY}" \
  -e STUDIO_AUTH_MODE=none \
  -e STUDIO_ANONYMOUS_ROLES=studio-admin \
  -e "STUDIO_INFRASTRUCTURES=${INFRASTRUCTURES}" \
  "${IMAGE}" >/dev/null

echo "Waiting for the health check of ${IMAGE}"
for _ in $(seq 1 60); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "${NAME}")"
  [[ "${health}" == "healthy" ]] && break
  [[ "$(docker inspect -f '{{.State.Running}}' "${NAME}")" == "true" ]] || fail "the container exited"
  sleep 2
done
[[ "${health}" == "healthy" ]] || fail "the container did not become healthy (${health})"

[[ "$(docker exec "${NAME}" id -u)" == "1000" ]] || fail "the service does not run as uid 1000"

status="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/studio/health/ready")"
[[ "${status}" == "200" ]] || fail "/studio/health/ready answered ${status}"

page="$(curl -sf -c "${JAR}" -H 'Accept: text/html' "${BASE}/studio/")" || fail "/studio/ did not answer"
asset="$(grep -o '/studio/_nuxt/[^"]*\.js' <<<"${page}" | head -n 1)"
[[ -n "${asset}" ]] || fail "the page links no assets under /studio/_nuxt/"
status="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${asset}")"
[[ "${status}" == "200" ]] || fail "${asset} answered ${status}"

status="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/health/live")"
[[ "${status}" == "404" ]] || fail "a path outside the base path answered ${status}"

infrastructures="$(curl -sf -b "${JAR}" "${BASE}/studio/api/studio/v1/infrastructures")" || fail "the infrastructure list did not answer"
grep -q '"name":"Smoke target"' <<<"${infrastructures}" || fail "the declared infrastructure is missing: ${infrastructures}"
grep -q '"managed":true' <<<"${infrastructures}" || fail "the declared infrastructure is not managed"

docker exec "${NAME}" sh -c 'touch /app/write-test' 2>/dev/null && fail "the root file system is writable"

echo "OK: ${IMAGE} serves Studio under /studio/ as uid 1000 on a read-only root file system"
