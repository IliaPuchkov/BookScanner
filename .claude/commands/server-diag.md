Diagnose the BookScanner production server at 31.184.197.226.

**Target server**: `root@31.184.197.226`

Run ALL checks below via SSH and produce a concise diagnostic report grouped by section. Flag anything that looks abnormal.

## Checks to run

### Containers
```bash
ssh root@31.184.197.226 "docker compose -f /opt/bookscanner/docker/docker-compose.prod.yml ps 2>&1"
ssh root@31.184.197.226 "docker stats --no-stream 2>&1"
```

### Recent logs (last 50 lines each)
```bash
ssh root@31.184.197.226 "docker logs bookscanner-backend --tail 50 2>&1"
ssh root@31.184.197.226 "docker logs bookscanner-nginx --tail 30 2>&1"
ssh root@31.184.197.226 "docker logs bookscanner-postgres --tail 20 2>&1"
ssh root@31.184.197.226 "docker logs bookscanner-redis --tail 20 2>&1"
```

### System resources
```bash
ssh root@31.184.197.226 "df -h && echo '---' && free -h && echo '---' && uptime"
```

### Database connectivity
```bash
ssh root@31.184.197.226 "docker exec bookscanner-postgres pg_isready -U postgres 2>&1"
ssh root@31.184.197.226 "docker exec bookscanner-postgres psql -U postgres -d bookscanner -c 'SELECT COUNT(*) FROM books;' 2>&1"
```

### Redis connectivity
```bash
ssh root@31.184.197.226 "docker exec bookscanner-redis redis-cli ping 2>&1"
ssh root@31.184.197.226 "docker exec bookscanner-redis redis-cli info stats 2>&1 | grep -E 'total_commands|connected_clients|used_memory_human'"
```

### API health
```bash
curl -sk -o /dev/null -w '%{http_code}' https://jollybook.duckdns.org/api/health || echo "no /api/health — try /api"
```

### Nginx / SSL
```bash
ssh root@31.184.197.226 "docker exec bookscanner-nginx nginx -t 2>&1"
ssh root@31.184.197.226 "openssl s_client -connect jollybook.duckdns.org:443 -servername jollybook.duckdns.org </dev/null 2>/dev/null | openssl x509 -noout -dates 2>/dev/null"
```

## Report format

Produce a summary table:

| Component | Status | Notes |
|-----------|--------|-------|
| backend   | ✅/❌  | ...   |
| nginx     | ...    | ...   |
| postgres  | ...    | ...   |
| redis     | ...    | ...   |
| disk      | ...    | X% used |
| memory    | ...    | ...   |
| SSL cert  | ...    | expires ... |

Then list any ERRORs or WARNINGs found in logs with timestamps.

If `$ARGUMENTS` is provided (e.g. "backend logs only", "database", "redis"), focus on that subsystem.
