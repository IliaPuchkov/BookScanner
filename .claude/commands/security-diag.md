Run a security diagnostic on the BookScanner production server at 31.184.197.226.

**Target server**: `root@31.184.197.226`

Execute all checks below and produce a security report. Flag any finding that is HIGH or MEDIUM severity.

## Checks to run

### 1. Open ports & listening services
```bash
ssh root@31.184.197.226 "ss -tlnp 2>&1"
```
Expected: only 22 (SSH), 80 (HTTP→redirect), 443 (HTTPS). Flag anything unexpected.

### 2. Firewall status
```bash
ssh root@31.184.197.226 "ufw status verbose 2>&1 || iptables -L -n --line-numbers 2>&1 | head -40"
```

### 3. Failed SSH login attempts (last 24h)
```bash
ssh root@31.184.197.226 "journalctl _SYSTEMD_UNIT=ssh.service --since '24 hours ago' 2>/dev/null | grep -i 'failed\|invalid\|refused' | tail -30 || grep -i 'Failed password\|Invalid user' /var/log/auth.log 2>/dev/null | tail -30"
```

### 4. Recent successful logins
```bash
ssh root@31.184.197.226 "last -20 2>&1"
```

### 5. Docker security posture
```bash
ssh root@31.184.197.226 "docker inspect --format '{{.Name}} privileged={{.HostConfig.Privileged}} caps={{.HostConfig.CapAdd}}' \$(docker ps -q) 2>&1"
ssh root@31.184.197.226 "docker ps --format 'table {{.Names}}\t{{.Ports}}' 2>&1"
```
Flag: any container with `privileged=true`, or ports bound to `0.0.0.0` other than 80/443.

### 6. Sensitive file permissions on server
```bash
ssh root@31.184.197.226 "ls -la /opt/bookscanner/apps/backend/.env 2>/dev/null; ls -la /opt/bookscanner/docker/docker-compose.prod.yml 2>/dev/null; find /opt/bookscanner -name '*.pem' -o -name '*.key' 2>/dev/null | head -10"
```
Expected: .env should be readable only by root (600 or 640).

### 7. SSL certificate validity
```bash
ssh root@31.184.197.226 "openssl s_client -connect jollybook.duckdns.org:443 -servername jollybook.duckdns.org </dev/null 2>/dev/null | openssl x509 -noout -dates -subject 2>/dev/null"
```
Flag if expiry is within 14 days.

### 8. Unattended-upgrades / OS patches
```bash
ssh root@31.184.197.226 "apt list --upgradable 2>/dev/null | head -20 || echo 'not Debian/Ubuntu'"
ssh root@31.184.197.226 "uname -r && cat /etc/os-release | head -5"
```

### 9. Environment variable leaks in containers
```bash
ssh root@31.184.197.226 "docker inspect bookscanner-backend | python3 -c \"import sys,json; env=json.load(sys.stdin)[0]['Config']['Env']; [print(e[:80]) for e in env if any(k in e.upper() for k in ['KEY','SECRET','PASSWORD','TOKEN'])]\" 2>&1"
```
Verify no plaintext secrets are exposed that shouldn't be.

### 10. Writable world-accessible directories
```bash
ssh root@31.184.197.226 "find /opt/bookscanner -perm -o+w -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -20"
```

## Report format

List findings as:
- 🔴 HIGH: ...
- 🟡 MEDIUM: ...
- 🟢 OK: ...

Finish with a summary: overall risk level and top 3 recommended actions.

If `$ARGUMENTS` is provided (e.g. "ssh only", "docker", "certs"), focus on that area.
