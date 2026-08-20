#!/usr/bin/env bash
# Rsync source to the server, build there, migrate, restart.
# Config: deploy/deploy.env (see deploy.env.example). Setup: deploy/README.md.
# Builds on the server because @libsql/client ships native bindings.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . deploy/deploy.env; set +a

echo ">> syncing source to $HOST"
rsync -az --delete \
	--exclude .git --exclude node_modules --exclude .output --exclude .nitro \
	--exclude .tanstack --exclude .data --exclude '.env*' --exclude .DS_Store \
	--exclude 'deploy/deploy.env' \
	-e "ssh -i $SSH_KEY" ./ "$HOST:/opt/marlon/"

echo ">> building, migrating, restarting"
ssh -i "$SSH_KEY" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/marlon
# install, not ci: "latest" dist-tag specifiers drift past the lockfile.
npm install --no-audit --no-fund
npm run build
set -a; . /etc/marlon/marlon.env; set +a
# drizzle-kit's turso dialect rejects an empty authToken, so only pass it when set.
sudo -u marlon env HOME=/var/lib/marlon DATABASE_URL="$DATABASE_URL" \
	${DATABASE_AUTH_TOKEN:+DATABASE_AUTH_TOKEN="$DATABASE_AUTH_TOKEN"} \
	node_modules/.bin/drizzle-kit migrate
systemctl restart marlon
systemctl --no-pager --lines=0 status marlon
REMOTE

echo ">> done — $APP_URL"
