# TODO

## Mobile: "start session" 409 loop (needs app release)

Found in server diagnostics on 2026-09-30: an operator hit `POST /api/work-sessions/start` → `409` three times in a row while a session was already active.

**Cause:** `fetchActiveSession` in `apps/mobile/src/screens/operator/CardsList.tsx` treats any error (timeout, network) as "no active session" and shows the "Start session" button. Tapping it returns 409 ("У вас уже есть активная рабочая сессия") and an error alert, again and again.

The trigger was likely the 1.25 MB `/work-sessions/active` response timing out on mobile data. That is fixed on the backend (response no longer embeds books), but the client logic is still fragile.

**Fix:**
- [ ] `handleStartSession`: on `409`, don't alert — call `fetchActiveSession()` and load its books (`fetchBooks(active.id, 1, true)` + `fetchBoxCounts`).
- [ ] `fetchActiveSession`: distinguish "server says no session" (`null` response) from a request error. On error, show an error state with a "Повторить" button instead of the "Start session" button.
