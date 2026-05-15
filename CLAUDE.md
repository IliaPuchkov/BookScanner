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
│       ├── app.json               # name: "Jolly Book", version: "1.0.1"
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
| `users` | id (UUID), fullName, phone (unique), email (unique), passwordHash, role (OPERATOR/ADMIN), isApproved, refreshToken |
| `boxes` | id (UUID), boxNumber, description, createdById (FK users) — unique (boxNumber, createdById) |
| `books` | id (UUID), sku (unique), title, author, isbn, publisher, yearPublished, dimensions (JSONB), weightGross, weightNet, paperType, coverType, pageCount, language, price, annotation, hashtags[], condition, bookType, direction, boxId, createdById, workSessionId, status (PENDING_REVIEW/PENDING_PUBLICATION/PUBLISHED/PUBLICATION_FAILED/ARCHIVED), publishedToOzon, isCopy (boolean, default false) |
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
- `GET /statistics` — Statistics summary (includes `copiesCount`, `duplicatesCount`, etc.)
- `GET /books/database` — Search books across all users
- `GET /books/pending-review` — Books with PENDING_REVIEW status (excludes `isCopy=true` unless already published)
- `GET /books/pending-review/ids` — IDs for bulk approval (optional `?boxId`)
- `GET /books/pending-review/counts-by-box` — Count per box
- `GET /books/failed-publication` — Ozon PUBLICATION_FAILED books
- `GET /books/ocr-failed` — Books where OCR extraction failed
- `GET /books/underpriced` — Books with possibly low price (year ≤ 1985, print run < 10 000)
- `GET /books/duplicates` — Groups of possible duplicates (same ISBN or title, from completed sessions). Filters: `search`, `status`, `count`, `operatorId`, `storeId`, `boxId`
- `POST /books/duplicates/resolve` — Mark a (book1Id, book2Id) pair as not duplicates
- `POST /books/mark-copies` — Set `isCopy=true` on a list of bookIds (confirms they are copies)
- `GET /books/copies/groups` — Books with `isCopy=true`, grouped by ISBN or normalized title. Filters: `search`, `status` (published/not_published/archived)

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
```

### Copies / Duplicates System

The admin has two dedicated screens for managing books that are potential or confirmed copies:

**Duplicates screen** (`GET /admin/books/duplicates`) — "На проверке: Копии":
- Shows groups of books suspected to be duplicates (same ISBN, or same normalized title+author from completed sessions)
- Each group has a probability level (High/Medium/Low based on matched fields): High=ISBN+title+author, Medium=any 2, Low=1 (filtered out, never shown)
- `calcGroupProbability` in `books.service.ts` re-checks actual `isbn` values from the fetched Book entities — it does NOT trust the cached group `type` field. This prevents stale 'isbn' groups (2-min cache TTL) from showing `isbn=null` books as ISBN matches.
- Title normalization in `calcGroupProbability`: lowercase + ё→е + Latin/Cyrillic homoglyph substitution + whitespace collapse. Intentionally does NOT strip punctuation (stripping caused false-positive title collisions).
- Admin can: mark all as copies (`POST /books/mark-copies`), mark as not copies (adds to `duplicate_resolutions`), or delete individual unpublished books
- Published books show "Опубликована на Ozon"; archived books show "В архиве" (no delete)
- `duplicate_resolutions` table suppresses resolved (book1Id, book2Id) pairs

**Copies screen** (`GET /admin/books/copies/groups`) — "Копии":
- Shows only books where `isCopy=true`, grouped by ISBN or LOWER(TRIM(title))
- Each book card shows: cover photo, title, author, SKU, price, box number, publication status
- Published books display store name (e.g. "Основной магазин") + "Опубликована на Ozon"
- Archived books show "В архиве" badge (no delete); unpublished books have a delete button
- When deleting a book leaves only 1 book in its group, that remaining book's `isCopy` is automatically reset to `false`
- Books with `isCopy=true` that are not yet published are blocked from Ozon publication

**Key invariant**: `isCopy=true` books with `publishedToOzon IS NULL` are excluded from the pending-review queue and cannot be published to Ozon until `isCopy` is cleared.

### Ozon Integration

- `ozon-api.client.ts` — raw Ozon API calls
- `ozon-payload.builder.ts` — builds Ozon product payload from book entity
- `ozon-status.cron.ts` — periodic cron to check publication task statuses
- Multiple Ozon stores configurable via `system_settings` (key pattern: `ozon_store_*`)
- Fixed category: Книги → Букинистические издания (1942–2010) → Печатная книга
- Annotation prefix: "ВНИМАНИЕ! Книга не новая! Состояние - на фото."

### Authentication Flow

- JWT access token (short-lived) + refresh token (stored in DB on user)
- `JwtAuthGuard` + `RolesGuard` on protected routes
- `@Roles('admin')` decorator for admin-only endpoints
- `@CurrentUser()` decorator extracts user from JWT payload
- Mobile: Axios interceptor auto-refreshes token on 401, retries original request

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
│   │                              PendingReview / Duplicates / Copies / ProductDetail
│   ├── CardCreationTab → CardsList / CreateCard / CardDetail / PhotoUpload
│   ├── SettingsTab → SettingsScreen / UserManagement
│   └── ProfileTab → ProfileScreen
└── DevNavigator (dev only)
```

Admin screens in `apps/mobile/src/screens/admin/`:
- `Dashboard.tsx` — grid of stat cards including Duplicates (→ Duplicates) and Copies count (→ Copies)
- `DuplicatesScreen.tsx` — "На проверке: Копии", grouped suspected duplicates with probability
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
