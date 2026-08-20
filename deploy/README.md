# Self-hosting marlon

One way to run marlon on a single Linux box: Nitro's node-server build under
systemd, with Caddy in front for HTTPS. Nitro also has presets for Vercel,
Netlify, Cloudflare, and friends — see https://v3.nitro.build/deploy.

```
Internet ──▶ Caddy (:443) ──▶ node .output/server/index.mjs (:8081, systemd)
                                    └──▶ /var/lib/marlon/marlon.db
```

## Server setup (once)

1. **Node 22:** `curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs`
2. **Service user:** `adduser --system --group --no-create-home --home /var/lib/marlon marlon`
3. **Env:** `install -d /etc/marlon && cp marlon.env.example /etc/marlon/marlon.env`,
   then `chown root:marlon /etc/marlon/marlon.env && chmod 0640 /etc/marlon/marlon.env`
   and fill in the Inngest keys.
4. **Service:** copy `marlon.service` to `/etc/systemd/system/`, then
   `systemctl daemon-reload && systemctl enable marlon`.
5. **DNS:** point an A record at the server (no proxying, so Caddy can issue a cert).
6. **Caddy:** append `Caddyfile` to `/etc/caddy/Caddyfile`, `caddy validate` and reload.
7. **Inngest:** sync the app at `https://<your-host>/api/inngest` in the Inngest dashboard.

## Deploying

```sh
cp deploy/deploy.env.example deploy/deploy.env   # once
./deploy/deploy.sh
```

Rsyncs the source, builds and migrates on the server, restarts the service.
The build happens server-side because `@libsql/client` has native bindings.

Logs: `journalctl -u marlon -f`
