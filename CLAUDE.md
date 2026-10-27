# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BookScanner (Jolly Book)** — система автоматизации создания карточек товаров (б/у книг) для маркетплейса Ozon на основе фотографий.

### Key Features

- Mobile app (React Native/Expo) для операторов: загрузка фото, создание карточек, корректировка данных
- Admin panel (встроена в mobile app при роли администратора): управление пользователями, статистика, база книг, настройки Ozon магазинов
- Backend API (NestJS): обработка фотографий, AI-распознавание (Gemini Vision + OpenAI), интеграция с Ozon
- Work sessions: рабочие сессии операторов для группировки карточек
- Статистика работы сотрудников (количество карточек, производительность)

### User Roles

- **Operator** (OPERATOR): создание карточек, загрузка фото, проверка данных, рабочие сессии
- **Admin** (ADMIN): управление пользователями, настройки системы, статистика, база книг, модерация

---

## Project Structure

```
BookScanner/
├── apps/
│   ├── backend/                 # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/           # JWT auth (login, register, refresh)
│   │   │   ├── users/          # User management
│   │   │   ├── boxes/          # Box management (уникальность boxNumber per user)
│   │   │   ├── books/          # Book cards CRUD + bulk actions
│   │   │   ├── photos/         # Photo upload/reorder/delete
│   │   │   ├── vision/         # AI extraction (BullMQ queue + Gemini Vision)
│   │   │   ├── ozon/           # Ozon integration (publish, bulk, status cron)
│   │   │   ├── admin/          # Admin: stats, search, pending review
│   │   │   ├── stats/          # Activity logs
│   │   │   ├── settings/       # System settings (Ozon stores, etc.)
│   │   │   ├── work-sessions/  # Work session tracking
│   │   │   ├── common/         # Guards, decorators, filters, interceptors
│   │   │   ├── database/
│   │   │   │   └── migrations/ # TypeORM migrations
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   │   └── data-source.ts
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── mobile/                  # React Native (Expo ~54)
│       ├── src/
│       │   ├── screens/
│       │   │   ├── auth/           # LoginScreen, RegisterScreen
│       │   │   ├── operator/       # CardsList, CreateCard, CardDetail, PhotoUpload, SettingsScreen
│       │   │   └── admin/          # Dashboard, UserManagement, Statistics, BookDatabase,
│       │   │                       # PendingReview, ProductDetail
│       │   ├── components/         # Button, Card, Input, LoadingOverlay, PhotoGrid
│       │   ├── hooks/              # useAuth
│       │   ├── services/           # api.ts, auth/books/boxes/photos/sessions/vision/admin .service.ts
│       │   ├── context/            # AuthContext
│       │   ├── utils/              # format.ts, sessionStore.ts, storage.ts
│       │   ├── navigation/         # AppNavigator, AuthNavigator, OperatorNavigator, AdminNavigator, DevNavigator
│       │   ├── types/              # index.ts
│       │   └── config.ts           # API base URL
│       ├── App.tsx
│       ├── app.json               # name: "Jolly Book" (version: see «Version bump» in Important Notes)
│       └── package.json
│
├── packages/
│   ├── shared/                  # @bookscanner/shared — shared TS types, constants, utils
│   │   └── src/
│   │       ├── types/           # user, book, box, photo, ocr, ozon, stats, settings, api types
│   │       ├── constants/       # auth, ozon, photo constants
│   │       └── utils/           # formatting, validation
│   │
│   └── ocr-processor/           # @bookscanner/ocr-processor — OCR/Vision library
│       └── src/
│           ├── ocr.ts           # OCR processing
│           ├── vision.ts        # Gemini Vision integration
│           ├── extraction.ts    # Data extraction logic
│           └── validators.ts    # Extracted data validation
│
├── docker/
│   ├── docker-compose.dev.yml   # PostgreSQL 14 + Redis 7
│   └── docker-compose.prod.yml  # PostgreSQL + Redis + Backend + Nginx + Certbot
│
├── CLAUDE.md
├── ТЗ.md
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
└── tsconfig.json
```

---

## Tech Stack

### Backend (apps/backend)

- **Framework**: NestJS 10.4 with TypeScript 5.4
- **Runtime**: Node 20 (Alpine in Docker)
- **Database**: PostgreSQL 14 + TypeORM 0.3.20
- **Queue**: BullMQ 5.72 + Redis 7 (vision extraction jobs)
- **Authentication**: JWT (access + refresh tokens), bcryptjs, passport-jwt
- **AI/Vision**: OpenAI API + Google Gemini Vision API (via `@bookscanner/ocr-processor`)
- **File Storage**: AWS S3 (`@aws-sdk/client-s3`) or local filesystem (configurable)
- **API Documentation**: Swagger at `/api/docs`
- **Security**: Helmet, throttler (rate limiting), CORS, global validation pipe
- **Other**: `@nestjs/schedule` (cron for Ozon status), `@nestjs/config`

### Mobile (apps/mobile)

- **Framework**: React Native 0.81.5 + Expo ~54
- **Language**: TypeScript 5.9
- **Navigation**: React Navigation 7 (native-stack + bottom-tabs)
- **State Management**: Context API (AuthContext) + useState
- **HTTP Client**: Axios 1.13 (with JWT interceptors + token refresh)
- **Image**: expo-image-picker, expo-image-manipulator, react-native-image-crop-picker
- **Storage**: AsyncStorage
- **Icons**: @expo/vector-icons
- **API Base URL**: `https://jollybook.duckdns.org/api`

### Packages

- **@bookscanner/shared**: Common TypeScript types, enums, constants, utils (no runtime deps)
- **@bookscanner/ocr-processor**: OCR + Gemini Vision extraction library (depends on `openai`)

---

## Database Schema (PostgreSQL)

### Tables

| Table | Key Columns |
|-------|-------------|
| `users` | id (UUID), fullName, phone (unique), email (unique), passwordHash, role (OPERATOR/ADMIN), isApproved, refreshToken, failedLoginAttempts (int, default 0), lockedUntil (timestamp, nullable), mustChangePassword (boolean, default false) |
| `boxes` | id (UUID), boxNumber, description, createdById (FK users) — unique (boxNumber, createdById) |
| `books` | id (UUID), sku (unique), title, author, isbn, publisher, yearPublished, dimensions (JSONB), weightGross, weightNet, paperType, coverType, pageCount, language, price, annotation, hashtags[], condition, bookType, direction, boxId, createdById, workSessionId, status (PENDING_REVIEW/PENDING_PUBLICATION/PUBLISHED/PUBLICATION_FAILED/ARCHIVED/IN_LIBRARY), publishedToOzon, isCopy (boolean, default false), libraryOwnerId (FK users, nullable), addedToLibraryAt (timestamp, nullable) |
| `book_photos` | id (UUID), bookId, fileUrl, fileKey, sortOrder, originalFilename, mimeType, fileSizeBytes |
| `ocr_results` | id (UUID), bookId (unique), rawOcrText, extractedData (JSONB), photo01Extraction (JSONB), photo02Extraction (JSONB), status, errorMessage |
| `ozon_products` | id (UUID), bookId (unique), ozonProductId, taskId, publishPayload (JSONB), status, averageMarketPrice, errorMessage |
| `work_sessions` | id (UUID), userId, status (active/completed), startedAt, endedAt |
| `activity_logs` | id (UUID), userId, action, entityType, entityId, metadata (JSONB) |
| `system_settings` | id (UUID), key (unique), value, description, valueType |

### Migrations

Located in `apps/backend/src/database/migrations/`:
- `1710600000000-AddWorkSessions.ts`
- `1710700000000-AddBookStatus.ts`
- `1710800000000-BoxNumberUniquePerUser.ts`
- `1747100000000-AddBookIsCopy.ts` — adds `"isCopy"` boolean column (camelCase, default false)
- `1747300000000-AddUserLoginLockout.ts` — adds `"failedLoginAttempts"` (int, default 0) and `"lockedUntil"` (timestamp, nullable) to `users` for brute-force lockout
- `1747600000000-AddBookLibrary.ts` — adds `'in_library'` to `books_status_enum`, plus `"libraryOwnerId"` (uuid FK users, ON DELETE SET NULL) and `"addedToLibraryAt"` to `books`
- `1747700000000-AddBookCopyGroupId.ts` — adds `"copyGroupId"` (uuid, nullable, partial index) to `books`: id of the copy set a book was marked into
- `1747800000000-BackfillCopyGroupIds.ts` — data migration: assigns a `copyGroupId` to every legacy copy using `buildCopySets()` (same matching as duplicates + same raw ISBN text with the same 20-char title start); existing set ids are kept; `down()` is a no-op
- `1747900000000-DedupeDuplicateResolutions.ts` — prod `duplicate_resolutions` had no unique index / order check (table predates 1711200000000), so `orIgnore()` never skipped repeats (8 397 extra rows on 2026-10-18). Keeps the earliest row per pair, sorts pairs, adds `uq_dup_res_pair` + `chk_dup_res_order`; aborts if the set of pairs would change
- `1748000000000-AddUserMustChangePassword.ts` — adds `"mustChangePassword"` (boolean, default false) to `users` (temporary password set by an admin)

---

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- PostgreSQL 14+ or Docker
- Redis 7+ or Docker

### Installation

```bash
cd /Users/gabryszewski003/projects/BookScanner
pnpm install

# Setup environment
cp apps/backend/.env.example apps/backend/.env
# Edit .env with DB credentials, API keys

# Start infrastructure
docker-compose -f docker/docker-compose.dev.yml up -d

# Run migrations
cd apps/backend && pnpm migration:run
```

### Common Commands

```bash
# Backend (from apps/backend)
pnpm dev              # Dev server with hot reload
pnpm build            # Production build
pnpm test             # Unit tests
pnpm test:e2e         # E2E tests
pnpm migration:create # Create new migration
pnpm migration:run    # Apply migrations
pnpm migration:revert # Revert last migration

# Mobile (from apps/mobile)
pnpm start            # Expo dev server
pnpm ios              # iOS simulator
pnpm android          # Android emulator

# Shared packages (from packages/shared or packages/ocr-processor)
pnpm build            # Compile to dist/

# Root
pnpm install          # Install all workspace deps
pnpm build            # Build all packages
pnpm lint             # Lint all
```

---

## API Endpoints (Backend)

All routes prefixed with `/api`.

### Auth (`/api/auth`)
- `POST /register` — Register (requires admin approval)
- `POST /login` — Login (phone/email + password)
- `POST /refresh` — Refresh JWT tokens

### Boxes (`/api/boxes`)
- `GET /` — List user's boxes
- `POST /` — Create box
- `PATCH /:id` — Update box

### Books (`/api/books`)
- `GET /` — List books (paginated, filterable)
- `GET /:id` — Get book details
- `POST /` — Create book card
- `POST /create-with-photos` — Create book + upload photos in single FormData request
- `PATCH /:id` — Update book
- `DELETE /:id` — Delete book

### Photos (`/api/photos`)
- `POST /upload` — Upload photos (multipart, up to 10MB/photo)
- `DELETE /:id` — Delete photo
- `PATCH /reorder` — Reorder photos

### Vision (`/api/vision`)
- `POST /extract` — Extract data from book photo (queues BullMQ job)
- `POST /extract-bulk` — Bulk queue extraction for multiple books
- `GET /results/:bookId` — Get OCR results for a book

### Ozon (`/api/ozon`)
- `POST /publish` — Publish single book to Ozon
- `POST /publish-bulk` — Bulk publish books to Ozon
- `GET /status/:bookId` — Get publication status

### Admin (`/api/admin`)
- `POST /users/:id/password` — `{ password? }`: set a **temporary** password for an **operator** (403 for admins); without `password` the server generates one (`generateTemporaryPassword`, 10 chars, no look-alikes) and returns `generatedPassword` once. Clears the login lock and the stored refresh token, sets `mustChangePassword`, logged as `password_reset` in `activity_logs`. `POST /users` (admin-created user) also sets `mustChangePassword`
- `GET /statistics` — Statistics summary (includes `copiesCount`, `duplicatesCount`, etc.)
- `GET /books/database` — Search books across all users
- `GET /books/pending-review` — Books with PENDING_REVIEW status (excludes `isCopy=true` unless already published)
- `GET /books/pending-review/ids` — IDs for bulk approval (optional `?boxId`)
- `GET /books/pending-review/counts-by-box` — Count per box
- `GET /books/failed-publication` — Ozon PUBLICATION_FAILED books
- `GET /books/ocr-failed` — Books where OCR extraction failed
- `GET /books/underpriced` — Books with possibly low price (year ≤ 1985, print run < 10 000)
- `GET /books/duplicates` — Groups of possible duplicates with their review state. `criterion` (isbn/exact/fuzzy, default exact), `respectIsbn`, `includeUnknownAuthor`, `showResolved`; filters: `search`, `status`, `count`, `operatorId`, `storeId`, `boxId`
- `POST /books/duplicates/resolve` — Mark a (book1Id, book2Id) pair as not duplicates; `/resolve-many` takes `pairs`
- `POST /books/duplicates/unresolve` — Take back "not duplicates" for `pairs`
- `POST /books/duplicates/unresolve-last` — `{ bookId, otherIds }`: take back the book's latest decision in the group; returns `pairs`.
- `POST /books/mark-copies` — Mark bookIds one copy set (`masterBookId`, `restBookIds`, `overrideResolutions`); returns `copyGroupId`
- `POST /books/unmark-copies` — Clear the copy flags; returns `unmarkedIds` (incl. a book left alone in its set)
- `GET /books/copies/groups` — Books with `isCopy=true`, grouped by copy set (`copyGroupId`), with `matchedFields`/`differingFields`/`isbnDiffers`. Filters: `search`, `status` (published/not_published/archived), `count`, `operatorId`, `storeId`, `boxId`
- `GET /books/copy-sets` — Copy sets (`sets`) and books in no set (`books: [{ book, suggested }]`) to add a book to by hand: `forBookId` (look-alikes first — same valid ISBN, same raw ISBN text even with a bad checksum (`rawIsbn`), or similar title by the same author) and/or `search` (title, author, ISBN, SKU); the book's own set is left out
- `POST /books/:id/copy-set` — `{ copyGroupId }`: put the book into that set (see «Adding a book to a copy set by hand»)
- `POST /books/:id/copy-set/new` — `{ withBookId }`: start a new set of the book and a book in no set (`startCopySet`); returns `master` (SKU of the main copy)
- `GET /books/library` — "Домашняя книга": books with status `IN_LIBRARY`. Filters: `ownerId`, `search`
- `POST /books/:id/library` — Add a PENDING_REVIEW, never-published book to the current admin's library
- `DELETE /books/:id/library` — Remove from library → back to PENDING_REVIEW

### Settings (`/api/settings`)
- `GET /` — Get all system settings (includes Ozon store configs)
- `PUT /` or `POST /` — Upsert setting

### Stats (`/api/stats`)
- `GET /summary` — Activity summary

### Work Sessions (`/api/work-sessions`)
- `GET /` — List sessions
- `POST /` — Start session
- `PATCH /:id` — Update session status (complete)

### Users (`/api/users`)
- `POST /me/password` — `{ currentPassword, newPassword }`: change own password (Profile → «Сменить пароль»). Throttled 5/60s; a wrong current password counts towards the login lockout, and a locked account gets 403. The current session is kept. Password rule: `@StrongPassword()` (`common/decorators/strong-password.decorator.ts`), mirrored in mobile `passwordRuleError()` (`components/PasswordModal.tsx`)
- `GET /` — List users (admin)
- `GET /:id` — Get user
- `POST /` — Create user (admin)
- `PATCH /:id` — Update user (role, isApproved, etc.)

---

## Key Implementation Details

### Vision/OCR Workflow

1. Photos uploaded via `POST /api/photos/upload` or `POST /api/books/create-with-photos`
2. Vision extraction queued via BullMQ (`POST /api/vision/extract` or `/extract-bulk`)
3. `vision.processor.ts` processes jobs using `@bookscanner/ocr-processor` (Gemini Vision)
4. Results stored in `ocr_results` table, book fields auto-populated
5. Operator reviews extracted data in `CardDetail` screen and corrects if needed

### Book Status Flow

```
PENDING_REVIEW → (admin approves) → PENDING_PUBLICATION → (ozon publish) → PUBLISHED
                                                                          ↘ PUBLICATION_FAILED
                                                                          ↘ ARCHIVED
PENDING_REVIEW ⇄ IN_LIBRARY   (admin: ⋮ → "Добавить в мою библиотеку" / "Вернуть на проверку")
```

### Home Library ("Домашняя книга")

- An admin can take a book from the PendingReview list into their own collection via the card's ⋮ menu. Status becomes `IN_LIBRARY`, `libraryOwnerId` = that admin.
- `IN_LIBRARY` books are out of the review queue (status filter) and **blocked from Ozon publication** in both `OzonService.publish` and `publishBulk`.
- Dashboard tile "Домашняя книга" → `LibraryScreen` (Моя библиотека / Все администраторы, "Вернуть на проверку"). ProductDetail also has "Вернуть на проверку".
- Duplicates and Copies screens have a per-book "В библиотеку" button (PENDING_REVIEW, never-published books). The book **stays in its group** — only its status/caption changes (`replaceBookInGroups` in `utils/bookEvents.ts`); grouping queries don't filter on status.
- Copies, Duplicates, BookDatabase (`BookCard`), Rare books and ProductDetail show the caption "В библиотеке: <admin fullName>" via `libraryLabel()` in `apps/mobile/src/utils/format.ts`; library books get no delete button on Copies/Duplicates. Backend queries for those screens join `libraryOwner` (User fields are `@Exclude`d by the global ClassSerializerInterceptor).

### Copies / Duplicates System

The admin has two dedicated screens for managing books that are potential or confirmed copies:

**Duplicates screen** (`GET /admin/books/duplicates`) — "На проверке: Копии":
- The admin picks a **criterion** in the collapsible «Критерий: …» panel next to «Фильтры» (only one of the two is open at a time; the choice is remembered in AsyncStorage `duplicates.view`): `isbn` — same valid ISBN, title/author not checked; `exact` — same `normalizeTitle` + `authorsCompatible`; `fuzzy` — one title core is the start of the other + `authorsCompatible`. Switch **«Учитывать ISBN»** (`respectIsbn`, title criteria only, default on): books with two different valid ISBNs are not linked; off → they are grouped and the odd one is captioned "ISBN отличается". Switch **«Книги без автора»** (`includeUnknownAuthor`, title criteria only, default off): books with an empty or placeholder author (`isKnownAuthor`: "Не указан", "Неизвестен", "Коллектив авторов") are grouped with each other by title, never with a known author; off → left out. Switch **«Разобранные»** (`showResolved`) also lists fully decided groups.
- Grouping is done in JS: `getDuplicateRows()` (books outside active work sessions, 2-min cache) → `buildDuplicateGroups(rows, criterion, respectIsbn)` in `books/duplicate-matching.ts` (unit-tested in `duplicate-matching.spec.ts`, incl. the «Бухара» fixture). Groups are cached per view (`criterion:respectIsbn:includeUnknownAuthor`) until the rows reload. Every criterion partitions the books, so a group's `id` = its smallest book id (mobile key `criterion:id`). Rows are sorted by id first — complete linkage is order-dependent.
- ISBNs count only if the checksum is valid (`canonicalIsbn`): placeholders like `978-5-0000-0000-0` (~8k imported books) and OCR junk like `501(13)-86` are treated as "no ISBN".
- `authorsCompatible()`: every name part of the shorter author maps to a distinct part of the other (identical, or a ≤3-letter initial/abbreviation prefix), with at least one identical part of ≥3 letters (the surname). So "И. И. Лажечников" = "Лажечников Иван Иванович", but "Борис Слуцкий" ≠ "Житков Борис Степанович" and "Андрей Платонов" ≠ "Богданов Андрей Платонович". Components merge only if every author of one fits every author of the other (complete linkage) and, with `respectIsbn`, they hold at most one valid ISBN together. Candidate pairs are only books sharing a ≥3-letter name part (keeps big "Избранное" buckets cheap).
- `normalizeTitle`: lowercase + ё→е + Latin/Cyrillic homoglyphs + whitespace collapse; does NOT strip punctuation (exact mode). `titleCore` (fuzzy): words without punctuation, prepositions and volume markers ("книга 2", "том первый", "в двух книгах" — a volume word counts only next to a number or in the plural, so "Книга джунглей" keeps it). Core words of 6+ letters tolerate one typo (`wordsMatch`); fuzzy buckets by the core's first word, typo-neighbour words found via a deletion index. `volumeLabel` gives the "Кн. 1" / "Т. 2" badge.
- **Decisions never cut a group** (`groupState`): a pair is decided when both books are in one copy set (copies), in two different sets (not copies), or resolved in `duplicate_resolutions` (not copies). Different ISBNs do not decide a pair. A group leaves the queue when `unresolvedCount` is 0. The response carries `sets`, `looseIds`, `excludedIds` (books in no set resolved against every other book — shown folded as «Не копии (N)», restored by «Вернуть»), `resolvedPairs`, `conflictPairs` (resolved but in one set — old data, the set wins, ⚠ in UI), `matchedFields`/`differingFields` chips (`groupMatch`), `isbnDiffers`, `volumes`. So old resolutions need no migration: two «Бухара» resolved "not copies" stay in the fuzzy group and end up in different sets (Кн. 1 / Кн. 2).
- Group states are cached in `_cardsCache` per view until the groups rebuild or `dropDuplicateStates()` (called on every resolution insert/delete). Totals are counted before paging; the dashboard tile shows "~N" undecided groups of the criterion + switches chosen on the Duplicates screen (`utils/duplicatesView.ts`, shared AsyncStorage view; fetched via `GET /duplicates?limit=1`, the criterion name below the number), falling back to the statistics `duplicatesCount` (default view: `exact`, ISBN respected).
- Actions (mobile `DuplicatesScreen`, group updated in place by `utils/duplicateGroups.ts` `recomputeGroup`, a mirror of `groupState`): «Все — копии» / «Добавить к набору (N)» / «Остальные — отдельный набор (N)», «Выбрать копии из группы» (tapping a set book selects its whole set) → «Это копии (N)» (sends `restBookIds` = unselected books outside the touched sets → resolved selected×rest), per book «Не копия» (resolved vs every other book), «Убрать из набора» (`unmark-copies` + resolved vs its set mates; a set left with one book is dissolved and `unmarkedIds` says so), «Вернуть» (`POST /books/duplicates/unresolve-last` — takes back only the book's latest tap: pairs written within 5 s of its newest resolution in the group; older decisions stay), «Это не копии» / «Остальные — не копии» (all undecided pairs via `POST /books/duplicates/resolve-many`). Marking copies among books with an earlier "not copies" asks first and sends `overrideResolutions` (those resolutions are deleted).
- Inside a group (mobile): group title (16 px bold) above uppercase grey section labels; status line only «Разобрана ✓» or «Новых книг: N» (no pair counts); «Не разобраны (N)» (loose books, most undecided pairs first, then newest; note "Не решено с N книгами" from `undecidedCount` in `utils/duplicateGroups.ts`; badge «Новая» only when the book has no "not copies" at all in a group that already has history), then «Набор копий», then folded «Не копии (N)» ("Не копия со всеми"). Quick actions never offer to join books already marked "not copies" of each other («Добавить к набору» counts only books with no resolution against the set).
- `markAsCopies` joins an existing set the books touch (merging several sets) and returns its `copyGroupId`; it keeps the existing `isCopyMaster` unless a new master is picked. The master picker lists the current main copy first with "Основная сейчас" and offers "Оставить текущую основную" (sends no `masterBookId`).
- Published books show "Опубликована на Ozon"; archived books show "В архиве" (no delete)

**Copies screen** (`GET /admin/books/copies/groups`) — "Копии":
- Shows only books where `isCopy=true`, grouped by `copyGroupId` (set by mark-copies; several copy sets can share an ISBN/title). Every copy has one since the backfill migration `1747800000000` (built with `buildCopySets()`); a copy without a set would show alone. Each group has a unique `id`.
- Grouping/filtering runs on light rows of all copies (one raw SQL, ~60 ms); photos/box/store/createdBy are loaded only for the page's books.
- Filters (collapsible «Фильтры», same as Duplicates): status, count (2/3/4+), store, operator, box — plus search. Book-level filters select **whole groups**: a set is listed when at least one of its books matches, and all its books are returned with the matching ones first (filter → sort), never a lone matching book
- Each group shows the Duplicates-style ✓/≠ chips (ISBN / Название / Автор via `groupMatch(rows, "exact")`) and its shortest title; a book whose ISBN differs is captioned "ISBN отличается"
- Each book card shows: cover photo, title, author, SKU, price, box number, publication status
- Published books display store name (e.g. "Основной магазин") + "Опубликована на Ozon"
- Archived books show "В архиве" badge (no delete); unpublished books have a delete button
- When deleting a book leaves only 1 book in its copy set (`copyGroupId`), that remaining book's `isCopy`/`isCopyMaster`/`copyGroupId` are reset
- Books with `isCopy=true` that are not yet published are blocked from Ozon publication

**Adding a book to a copy set by hand** (`moveToCopySet`, mobile `components/CopySetPicker.tsx`; opened from BookDatabase ⋮ on a book card and from ProductDetail «Добавить в набор копий» / «Перенести в другой набор копий»):
- The book leaves its own set (if any) and joins the chosen one as a plain copy (`isCopyMaster=false`). Decisions follow the set: its earlier "not copies" with the set's books are deleted, and it inherits every "not copies" the set has with other books. Leaving an old set records "not a copy" with that set's other books; a set left with one book dissolves (`unmarkSingletonCopy`), and a set that lost its main copy gets a new one (`ensureCopyMaster`: an already published book first, else the oldest) — the response's `oldSetMaster` names it.
- Runs in one transaction; drops the duplicate caches afterwards.
- The picker also lists books in no set («Похожие книги без набора»): choosing one starts a new set of the two (`startCopySet` — the other book gets a fresh `copyGroupId`, then the book joins it via `moveToCopySet`; main copy = an already published book, else the older one, via `ensureCopyMaster`). If the other book is already in a set, the book just joins that set.

**Key invariant**: `isCopy=true` books with `publishedToOzon IS NULL` are excluded from the pending-review queue and cannot be published to Ozon until `isCopy` is cleared.

### Undo banner for critical actions (mobile, v1.12.0)

- `UndoProvider` (`apps/mobile/src/context/UndoContext.tsx`, mounted in `App.tsx`) + `useUndoable()`: `undoable({ message, action })` shows a banner at the top of the screen ("Отменить действие?" + "Отменить") with a 6 s progress bar (`UNDO_DELAY_MS`); the action runs only when the bar runs out.
- Used after the existing confirmation `Alert` for every critical action: card/photo/user/store/account deletion (single + bulk), Ozon publication, bulk re-extraction, library add/return, mark copies / not copies / return copies to review, promote to admin, end work session.
- One banner at a time: a new critical action commits the pending one immediately; the app going to background commits too. The action may run after its screen unmounted — guard navigation (`if (navigation.isFocused()) navigation.goBack()`) and use ids, not list indexes.

### Ozon Integration

- `ozon-api.client.ts` — raw Ozon API calls
- `ozon-payload.builder.ts` — builds Ozon product payload from book entity
- `ozon-status.cron.ts` — periodic cron to check publication task statuses
- Multiple Ozon stores configurable via `system_settings` (key pattern: `ozon_store_*`)
- **Import task ≠ source of truth**: Ozon may report `failed` for products it created, and its product list lags behind the task. `resolveImport()` treats `product_id > 0` as published, looks the offer_id up in *all* stores before failing, never fails on a lookup error, and waits `FAILURE_GRACE_MS` (1h). `task_id` is per seller account — `getImportInfo` must use the publishing store's credentials.
- `reconcileFailedPublications()` (hourly cron + ⋮ "Проверить статус на Ozon" on ErrorsScreen via `POST /ozon/repair-failed-publications`) batch-checks all `PUBLICATION_FAILED` SKUs on Ozon and flips found ones to `PUBLISHED`. Retry (`publish` / `publishBulk`) also checks Ozon first and returns `alreadyPublished` instead of re-importing.
- Fixed category: Книги → Букинистические издания (1942–2010) → Печатная книга
- Annotation prefix: "ВНИМАНИЕ! Книга не новая! Состояние - на фото."

### Authentication Flow

- JWT access token (short-lived) + refresh token (stored in DB on user)
- Tokens carry `typ: 'access' | 'refresh'`; refresh tokens are signed with `JWT_REFRESH_SECRET`. `JwtStrategy` rejects anything but `typ: 'access'` (a 7-day refresh token must not work as a bearer token); `AuthService.verifyRefreshToken` accepts only refresh tokens, plus legacy untyped ones until 2026-10-26 (they still have to match the stored hash)
- `JwtAuthGuard` + `RolesGuard` on protected routes
- `@Roles('admin')` decorator for admin-only endpoints
- `@CurrentUser()` decorator extracts user from JWT payload
- Mobile: Axios interceptor auto-refreshes token on 401, retries original request

#### Temporary password (`mustChangePassword`)

- Set when an admin chose the password (password reset or admin-created user); cleared by `POST /users/me/password`.
- While set, `JwtStrategy` answers `403 { error: 'PasswordChangeRequired' }` to everything except `/users/me`, `/users/me/password`, `/users/me/consent` and `/auth/logout`. Mobile 1.13.x has no form for it, so such users are stuck there until they update.
- Mobile: `AppNavigator` mounts no tabs and shows `PasswordModal` («Временный пароль» → new one, or «Выйти») after consent. A device that was already logged in learns about it from that 403 (`onPasswordChangeRequired` in `services/api.ts` → `AuthContext`).

#### Login brute-force protection

- **Rate limit**: `@Throttle` 5 req/60s on `POST /api/auth/register` and `POST /api/auth/login` (`ThrottlerModule` global default is 30/60s). `main.ts` sets `app.set('trust proxy', 1)` so the limiter keys on the real client IP from `X-Forwarded-For` (nginx sets it to `$remote_addr`, replace-not-append). Without `trust proxy` every request looks like it comes from the nginx container and the login limit collapses to one global bucket.
- **Account lockout**: `AuthService.validateUser` counts consecutive failures via `UsersService.recordFailedLogin`. After `MAX_FAILED_LOGIN_ATTEMPTS` (8, in `@bookscanner/shared` auth.constants) the account is locked for `LOGIN_LOCK_MS` (15 min); every further failure re-arms the window. A correct password during the lock returns `403` "заблокирован ... повторите через N мин" (safe to reveal — caller proved they know the password). `resetFailedLogin` clears the counter on any successful login.
- **Constant-time**: `validateUser` always runs one `bcrypt.compare` (against a startup-generated `DUMMY_PASSWORD_HASH` when the account is not found), so a missing account can't be distinguished from a wrong password by response time.
- **Server-side (fail2ban)**: the `bookscanner-login` jail on the prod host bans IPs with 10× `401/403/429` on `POST /api/auth/login` in 10 min (reads nginx's Docker JSON log); repeat offenders escalate via the `recidive` jail to a permanent ban. `maxretry` (10) sits above the in-app lockout (8) so honest mistakes hit the friendly app lock first.

### Mobile Navigation

```
AppNavigator (root)
├── AuthNavigator (unauthenticated)
│   ├── Login
│   └── Register
├── OperatorNavigator (role: OPERATOR)
│   ├── CardsTab → CardsList → CreateCard / CardDetail / PhotoUpload
│   └── ProfileTab → ProfileScreen
├── AdminNavigator (role: ADMIN)
│   ├── MainTab (AdminMainStack) → Dashboard / Statistics / BookDatabase /
│   │                              PendingReview / Duplicates / Copies / Library / ProductDetail
│   ├── CardCreationTab → CardsList / CreateCard / CardDetail / PhotoUpload
│   ├── SettingsTab → SettingsScreen / UserManagement
│   └── ProfileTab → ProfileScreen
└── DevNavigator (dev only)
```

Admin screens in `apps/mobile/src/screens/admin/`:
- `Dashboard.tsx` — grid of stat cards including Duplicates (→ Duplicates) and Copies count (→ Copies)
- `DuplicatesScreen.tsx` — "На проверке: Копии": criterion picker (ISBN / автор+название / похожие названия), groups with copy sets, undecided and folded books
- `CopiesScreen.tsx` — confirmed copies (`isCopy=true`), grouped by ISBN/title, with store name display

---

## Environment Variables (.env)

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=bookscanner

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=another-secret  # signs refresh tokens only; required
JWT_EXPIRATION=900        # 15 minutes
JWT_REFRESH_EXPIRATION=604800  # 7 days

# AI/Vision
OPENAI_API_KEY=sk-...
# Gemini key configured in ocr-processor

# Ozon Integration
OZON_API_KEY=...
OZON_CLIENT_ID=...

# File Storage (choose one)
STORAGE_TYPE=local         # 'local' or 's3'
AWS_S3_BUCKET=bookscanner-photos
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-central-1

# App
NODE_ENV=development
BACKEND_PORT=3000
CORS_ORIGINS=http://localhost:8081
```

---

## Deployment

Production runs via Docker Compose (`docker/docker-compose.prod.yml`):
- PostgreSQL + Redis on internal network
- Backend built from `apps/backend/Dockerfile` (Node 20-alpine, pnpm)
- Nginx reverse proxy with SSL via Certbot
- Production domain: `jollybook.duckdns.org`

Build order in Dockerfile: `shared` → `ocr-processor` → `backend`

---

## Important Notes

1. **Photo Limits**: Max 10MB per photo, JPEG/PNG, up to 10 photos per book
2. **SKU Format**: `BoxNumber_UniqueCode` (auto-generated)
3. **Default values if not detected**: height = 35mm, weight = 450g
4. **boxNumber uniqueness**: scoped per user (not globally unique)
5. **Admin approval**: new users require `isApproved = true` before they can use the app
6. **Swagger docs**: available at `http://localhost:3000/api/docs` in development
7. **TypeORM column naming — mixed**: Most DB columns are camelCase (e.g. `"isCopy"`, `"publishedToOzon"`, `"yearPublished"`), but several older FK columns are snake_case: `work_session_id`, `box_id`, `created_by`. In QueryBuilder `.andWhere()` always use the TypeORM **entity property name** (e.g. `book.workSession` or `book.work_session_id`). In raw `manager.query()` SQL, use the **actual DB column name** — check `\d books` if unsure.
8. **Deployment uses rsync, not git**: the production server at `31.184.197.226` has no `.git` directory. Code is pushed via `bash deploy.sh 31.184.197.226 jollybook.duckdns.org`. The script rsyncs source, rebuilds the backend Docker image, restarts the container, and runs migrations.
9. **`useFocusEffect` always passes `isRefresh=true`**: when fetching stores or other secondary data in an admin screen, guard on `pageNum === 1` only (not `&& !isRefresh`), otherwise the data never loads on navigation focus.
10. **Version bump — always update every file at once.** The native `android/` and `ios/` projects are committed, so `expo run:android` / `expo run:ios` read the version from them and ignore `app.json` (that's how builds stayed at 1.11.1 while `app.json` said 1.13.0). One version (`X.Y.Z`) and one build number (`N`, +1 on every release) go into all of:
    - `apps/mobile/app.json` — `expo.version` = X.Y.Z, `expo.ios.buildNumber` = "N", `expo.android.versionCode` = N
    - `apps/mobile/android/app/build.gradle` — `versionName "X.Y.Z"`, `versionCode N`
    - `apps/mobile/ios/JollyBook.xcodeproj/project.pbxproj` — `MARKETING_VERSION = X.Y.Z;` and `CURRENT_PROJECT_VERSION = N;` (2 build configs each)
    - `apps/mobile/ios/JollyBook/Info.plist` — `CFBundleShortVersionString` = X.Y.Z, `CFBundleVersion` = N
    - `apps/mobile/package.json` and `apps/backend/package.json` — `"version": "X.Y.Z"`
    - `apps/backend/src/main.ts` — Swagger `.setVersion('X.Y.Z')`

    Check before committing — every value must match: `git grep -nE -A1 'versionName|versionCode|MARKETING_VERSION|CURRENT_PROJECT_VERSION|setVersion|"version"|"buildNumber"|CFBundleShortVersionString|CFBundleVersion' -- apps/mobile/app.json apps/mobile/android/app/build.gradle apps/mobile/ios/JollyBook.xcodeproj/project.pbxproj apps/mobile/ios/JollyBook/Info.plist apps/mobile/package.json apps/backend/package.json apps/backend/src/main.ts`. Versions of `packages/*` are not app versions and stay as they are.
11. **Prod host hardening** (`31.184.197.226`, not in code): SSH is key-only (`PasswordAuthentication no`, root `prohibit-password`); fail2ban runs three jails — `sshd`, `bookscanner-login` (nginx auth-endpoint abuse), and `recidive` (repeat offenders → permanent ban). TLS is Let's Encrypt via the `certbot` compose service (`restart: unless-stopped`); nginx access logs reach fail2ban through the Docker `json-file` driver. The jail's `logpath` glob (`/var/lib/docker/containers/*/*-json.log`) is expanded only on load, so after recreating containers run `fail2ban-client reload bookscanner-login` (`deploy.sh` does). Container logs are capped at 20 MB × 5 (`x-logging` in the prod compose).
