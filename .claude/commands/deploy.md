Deploy BookScanner to the production server at 31.184.197.226 (jollybook.duckdns.org).

**Target server**: `root@31.184.197.226`
**Project path on server**: `/opt/bookscanner`
**Docker compose file**: `/opt/bookscanner/docker/docker-compose.prod.yml`
**Deploy script**: `deploy.sh` at project root (uses rsync — the server has no `.git`)

## Steps to perform

1. **Pre-flight checks (local)**
   - Run `git status` — confirm working tree is clean (all changes committed)
   - Run `git log origin/main..HEAD --oneline` — show commits to be deployed
   - If there are unpushed commits, ask user whether to push them first

2. **Run the deploy script**
   ```bash
   bash deploy.sh 31.184.197.226 jollybook.duckdns.org
   ```
   This script:
   - `rsync`s source code to the server (excludes `.git`, `node_modules`, `apps/mobile`, `*.env`)
   - Runs `docker compose build backend`
   - Runs `docker compose up -d --force-recreate backend`
   - Reconnects nginx network aliases
   - Runs `pnpm migration:run` inside the container
   - Prints container status and resource usage

3. **Health check** — after the script completes, verify:
   ```bash
   curl -sk -o /dev/null -w '%{http_code}' https://jollybook.duckdns.org/api/auth/login
   ssh root@31.184.197.226 "docker logs bookscanner-backend --tail 30 2>&1"
   ```

4. **Report** — summarise what was deployed (git log), whether containers are healthy, and any warnings from logs.

If `$ARGUMENTS` is provided, treat it as extra context (e.g. "skip migrations", "rebuild all", "rollback").
