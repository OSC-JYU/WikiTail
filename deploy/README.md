# Deploying Wikitail on RHEL 9 with Podman Quadlets

This directory contains everything you need to run Wikitail on a RHEL 9 host
using podman (managed by systemd via [Quadlets][quadlet]), behind an Apache
reverse proxy that terminates TLS and authenticates visitors.

- `../Dockerfile` — production image (Node 22, single container).
- `quadlet/wikitail.container` — Podman Quadlet unit.
- `quadlet/wikitail-data.volume` — SQLite volume.
- `quadlet/wikitail-uploads.volume` — uploads volume.
- `apache/wikitail.conf` — Apache 2.4 vhost with SSO + reverse proxy.

Requirements: RHEL 9.2+, `podman` ≥ 4.4 (Quadlet support), `httpd`, `mod_ssl`.

## 1. Build the image

Do this on a build host (can be the server itself, or your laptop with `podman
save`/`load` to move the image over).

```bash
git clone <this-repo> wikitail && cd wikitail
podman build -t localhost/wikitail:latest .
```

If Apache mounts the app at a sub-path instead of its own vhost (see
`apache/wikitail.conf`'s `ProxyPass "/s/wikitail" ...`), build with that path
so the UI generates correct asset/link/API URLs — it's baked in at build time
and cannot be changed by an env var on the running container:

```bash
podman build --build-arg VITE_BASE_PATH=/s/wikitail/ -t localhost/wikitail:latest .
```

Moving a locally-built image to the server:

```bash
podman save localhost/wikitail:latest | ssh server 'sudo podman load'
```

(Or push to a private registry and change `Image=` in the Quadlet.)

## 2. Install the Quadlet units

```bash
sudo cp deploy/quadlet/wikitail.container       /etc/containers/systemd/
sudo cp deploy/quadlet/wikitail-data.volume     /etc/containers/systemd/
sudo cp deploy/quadlet/wikitail-uploads.volume  /etc/containers/systemd/
sudo systemctl daemon-reload
```

Before starting, open `/etc/containers/systemd/wikitail.container` and set at
least these env vars for your deployment:

- `ADMIN_EMAILS` — comma-separated emails that get admin on first sign-in.
- `WIKIPEDIA_USER_AGENT` — Wikimedia asks callers to identify themselves with
  a real contact address.
- Optionally `DEFAULT_LANGUAGE`, `COMMONS_IMAGE_WIDTH`, `MAX_IMPORT_BYTES`,
  `MAX_UPLOAD_BYTES`. (Whether Finna NonCommercial material is copied in is a
  per-project setting in the app itself, not an env var.)

Anything secret (registry pull tokens, future API keys) belongs in a systemd
drop-in rather than checked into git:

```bash
sudo systemctl edit wikitail.service
# → adds /etc/systemd/system/wikitail.service.d/override.conf
```

Start it:

```bash
sudo systemctl start wikitail.service
sudo systemctl enable wikitail.service   # start on boot
journalctl -u wikitail.service -f        # follow logs
```

The service listens on `127.0.0.1:3000` — nothing on the network can reach it
directly. Verify from the host:

```bash
curl -H "mail: admin@example.org" http://127.0.0.1:3000/api/users/me
```

### Rootless variant

For a rootless install, put the same files under
`~/.config/containers/systemd/` and use `systemctl --user`:

```bash
mkdir -p ~/.config/containers/systemd
cp deploy/quadlet/*.container deploy/quadlet/*.volume ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user start wikitail.service
loginctl enable-linger $USER   # keep the service running after logout
```

## 3. Configure Apache

Install httpd and mod_ssl, and allow httpd to open a local socket (SELinux
denies this by default on RHEL 9):

```bash
sudo dnf install -y httpd mod_ssl
sudo setsebool -P httpd_can_network_connect on
sudo systemctl enable --now httpd
```

Get a TLS certificate (Let's Encrypt is easiest):

```bash
sudo dnf install -y python3-certbot-apache
sudo certbot --apache -d wikitail.example.org
```

Drop the vhost in place, edit it (server name, cert path, and pick an auth
block), test the config, then reload:

```bash
sudo cp deploy/apache/wikitail.conf /etc/httpd/conf.d/wikitail.conf
sudo vim /etc/httpd/conf.d/wikitail.conf   # set ServerName, choose auth
sudo apachectl configtest
sudo systemctl reload httpd
```

Open ports 80 and 443 in the firewall:

```bash
sudo firewall-cmd --add-service=http  --permanent
sudo firewall-cmd --add-service=https --permanent
sudo firewall-cmd --reload
```

## 4. How the identity header works — and why

Wikitail runs in `AUTH_MODE=header`, which means the server trusts the
`mail` HTTP header on every request as the visitor's identity. The Apache
vhost is what makes that safe:

1. **Strip anything the client sent.** `RequestHeader unset mail early` runs
   before any auth module, so a browser (or `curl`) that sets `mail:` itself
   gets it wiped before the app ever sees it.
2. **Authenticate the visitor.** Whatever module you enable (OIDC, Basic
   auth, mod_auth_mellon…) sets `REMOTE_USER` to the visitor's email.
3. **Inject the trusted value.** `RequestHeader set mail "expr=%{REMOTE_USER}"`
   sends the authenticated email downstream. That is the only source of the
   `mail` header the container ever sees.

Bypass any of those three steps and you lose identity guarantees.

If your SSO puts email somewhere other than `REMOTE_USER` (e.g. a
`OIDC_CLAIM_email` env var or a header `X-Auth-Email`), adjust the `expr=`
accordingly, e.g.

```apache
RequestHeader set mail "expr=%{reqenv:OIDC_CLAIM_email}"
```

## 5. Backups

Both volumes are managed by podman. Export snapshots:

```bash
sudo podman volume export systemd-wikitail-data    -o wikitail-data-$(date +%F).tar
sudo podman volume export systemd-wikitail-uploads -o wikitail-uploads-$(date +%F).tar
```

For a consistent SQLite backup, stop the service first (SQLite in WAL mode is
usually safe to copy live, but stopping is simplest):

```bash
sudo systemctl stop wikitail.service
sudo podman volume export systemd-wikitail-data -o wikitail-data-$(date +%F).tar
sudo systemctl start wikitail.service
```

Restore:

```bash
sudo systemctl stop wikitail.service
sudo podman volume import systemd-wikitail-data wikitail-data-2026-09-14.tar
sudo systemctl start wikitail.service
```

## 6. Upgrades

```bash
git pull
podman build -t localhost/wikitail:latest .
sudo systemctl restart wikitail.service   # picks up the new image
```

Migrations run at server start, so a version bump is usually just a restart.
If you push images to a registry, `podman auto-update` can pull them on a
timer — enable `AutoUpdate=registry` in the Quadlet and `podman auto-update
--dry-run` to see what would change.

[quadlet]: https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html
