# TODO

## Mobile: "start session" 409 loop (needs app release)

Found in server diagnostics on 2026-09-30: an operator hit `POST /api/work-sessions/start` → `409` three times in a row while a session was already active.

**Cause:** `fetchActiveSession` in `apps/mobile/src/screens/operator/CardsList.tsx` treats any error (timeout, network) as "no active session" and shows the "Start session" button. Tapping it returns 409 ("У вас уже есть активная рабочая сессия") and an error alert, again and again.

The trigger was likely the 1.25 MB `/work-sessions/active` response timing out on mobile data. That is fixed on the backend (response no longer embeds books), but the client logic is still fragile.

**Fix:**
- [ ] `handleStartSession`: on `409`, don't alert — call `fetchActiveSession()` and load its books (`fetchBooks(active.id, 1, true)` + `fetchBoxCounts`).
- [ ] `fetchActiveSession`: distinguish "server says no session" (`null` response) from a request error. On error, show an error state with a "Повторить" button instead of the "Start session" button.

## Server alerts (security + server status) — channel to decide

Today nobody is told when something breaks on prod. The Ozon status sync once crashed silently with an out-of-memory error, and a backup broken by CRLF line endings went unnoticed for a month. A working version was written on 2026-11-27 for Telegram, then removed, because Telegram needs a VPN in Russia. The code is kept in git stash `server alerts (ops/monitoring) — Telegram blocked, see TODO.md` (`git stash list`, then `git stash apply stash@{N}`); it includes a CLAUDE.md note.

**Design (already built, keep it):** shell scripts in `ops/monitoring/`, not in Docker, so they still work when the containers are down. `install.sh` (run on the server as root) installs them to `/usr/local/lib/bs-monitor`, adds `/etc/cron.d/bs-monitor` and a `pam_exec` line (`optional`) to `/etc/pam.d/sshd` + `/etc/pam.d/login`. Secrets go in `/etc/bs-monitor.env` (600), which the user fills in on the server, never in chat or the repo. `BS_DRY_RUN=1 BS_STATE=/tmp/bs-test <script>` prints instead of sending.
- Every 2 min: a container down, unhealthy or restarted by Docker (out of memory shown); the API through nginx failing 2 runs in a row; disk ≥ 85%; memory < 80 MB 3 runs in a row; backend `ERROR` lines (first at once, then batched per 30 min); no successful backup for 26 h; fail2ban/ufw stopped. Hourly: TLS < 14 days; `sshd -T` shows password login on again (the hoster did that on 2026-11-07). Any change to root's SSH keys, shell accounts or the sudo group, or the root password.
- Each problem: one alert, repeated every few hours while it lasts, then "OK again".
- Login hook: an SSH login from an address not seen in 30 days (pre-filled from the last 30 days of the journal, minus 31.184.196.79, the hoster's session), every console login (the hosting panel's VNC).
- Daily summary at 09:00 MSK: disk, memory, containers, last backup, TLS days, SSH logins by IP, failed attempts and bans, pending updates and reboot, backend errors/warnings, the last Ozon sync line, new books / waiting for review / total.

**To do:**
- [ ] Pick the channel. Only `tg_send`/`tg_curl` in `lib.sh` change. All of these were reachable from the server on 2026-11-27:
  - **Email (recommended)** via `smtps://smtp.yandex.ru:465` or `smtp.mail.ru:465` using `curl` (nothing to install). Needs a separate sending mailbox + an app password ("Пароли приложений"), and the address to receive at.
  - SMS (sms.ru / SMSC, ~3–5 ₽ each) on top of email, only for the critical ones: site down, unknown SSH login, console login.
  - Push in the Jolly Book app (Expo → FCM), needs an app build and a backend endpoint; can't report the backend itself being down.
  - ntfy (an open-source push service run on the server itself), VK or MAX bot.
  - Telegram works from the server only via 149.154.167.220 (149.154.166.110, the DNS answer, times out); `TG_FALLBACK_IPS` handles it.
- [ ] Docker 29: `docker inspect -f` with `{{if .State.Health}}` fails for containers without a healthcheck when combined with other fields. The stashed code already reads `docker inspect` JSON with python3 instead.
- [ ] Optional: an outside check (Healthchecks.io / UptimeRobot) for when the whole server is down. The user creates the account.
- [ ] `deploy.sh`: `docker builder prune -f --filter until=72h` frees nothing on Docker 29.1.3 (checked 2026-11-27). Use `docker builder prune -f --keep-storage 1gb`, which freed 2.7 GB by hand.
