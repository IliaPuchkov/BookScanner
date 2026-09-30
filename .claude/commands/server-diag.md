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
ssh root@31.184.197.226 "docker logs bookscanner-db --tail 20 2>&1"
ssh root@31.184.197.226 "docker logs bookscanner-redis --tail 20 2>&1"
```

### System resources
```bash
ssh root@31.184.197.226 "df -h && echo '---' && free -h && echo '---' && uptime"
```

### Database connectivity
```bash
# Container is bookscanner-db; the DB role is NOT "postgres" — read it from the container env
ssh root@31.184.197.226 'U=$(docker exec bookscanner-db printenv POSTGRES_USER); D=$(docker exec bookscanner-db printenv POSTGRES_DB); docker exec bookscanner-db pg_isready -U "$U" 2>&1; docker exec bookscanner-db psql -U "$U" -d "$D" -c "SELECT COUNT(*) FROM books;" -c "SELECT pg_size_pretty(pg_database_size(current_database()));" 2>&1'
```

### Backend errors (last 24h)
```bash
ssh root@31.184.197.226 "docker logs bookscanner-backend --since 24h 2>&1 | grep -E 'ERROR|WARN' | tail -30"
```

### Redis connectivity
```bash
ssh root@31.184.197.226 "docker exec bookscanner-redis redis-cli ping 2>&1"
ssh root@31.184.197.226 "docker exec bookscanner-redis redis-cli info 2>&1 | grep -E 'total_commands|connected_clients|used_memory_human'"
```

### API health
```bash
# There is no /api/health route; /api/maintenance is public and hits the backend
curl -sk -o /dev/null -w '%{http_code}' https://jollybook.duckdns.org/api/maintenance
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
