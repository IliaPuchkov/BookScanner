# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BookScanner** — система автоматизации создания карточек товаров (б/у книг) для маркетплейса Ozon на основе фотографий.

### Key Features

- 📱 Mobile app (React Native) для операторов: загрузка фото, создание карточек, корректировка данных
- 🖥️ Admin panel (встроена в mobile app при роли администратора): управление пользователями, статистика, база книг
- 🤖 Backend API: обработка фотографий, OCR, AI-распознавание, интеграция с Ozon
- 📊 Статистика работы сотрудников (количество карточек, производительность)

### User Roles

- **Operator** (Фотограф/Сотрудник): создание карточек, загрузка фото, проверка данных
- **Admin** (Администратор): управление пользователями, настройки, статистика, база книг

---

## Project Structure

```
BookScanner/
├── apps/
│   ├── backend/                 # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/           # Authentication & authorization
│   │   │   ├── users/          # User management
│   │   │   ├── books/          # Book cards CRUD
│   │   │   ├── photos/         # Photo processing & storage
│   │   │   ├── vision/         # OCR & AI extraction
│   │   │   ├── ozon/           # Ozon integration
│   │   │   ├── admin/          # Admin features
│   │   │   ├── stats/          # Statistics & reporting
│   │   │   └── common/         # Shared filters, guards, decorators
│   │   ├── test/               # Unit & e2e tests
│   │   ├── .env.example        # Environment variables template
│   │   └── package.json
│   │
│   └── mobile/                  # React Native (Expo)
│       ├── src/
│       │   ├── screens/
│       │   │   ├── auth/       # Login/Register screens
│       │   │   ├── operator/   # Operator screens
│       │   │   │   ├── CreateCard.tsx
│       │   │   │   ├── PhotoUpload.tsx
│       │   │   │   ├── CardsList.tsx
│       │   │   │   └── CardDetail.tsx
│       │   │   └── admin/      # Admin screens
│       │   │       ├── Dashboard.tsx
│       │   │       ├── UserManagement.tsx
│       │   │       ├── Statistics.tsx
│       │   │       └── BookDatabase.tsx
│       │   ├── components/     # Reusable components
│       │   ├── hooks/          # Custom hooks
│       │   ├── services/       # API clients
│       │   ├── context/        # Context API (auth, user state)
│       │   ├── utils/          # Utilities, helpers
│       │   ├── navigation/     # Navigation config
│       │   ├── types/          # TypeScript types
│       │   └── App.tsx
│       ├── app.json            # Expo config
│       └── package.json
│
├── packages/
│   ├── shared/                  # Shared types & constants
│   │   ├── src/
│   │   │   ├── types/          # Shared TS interfaces
│   │   │   ├── constants/      # App constants
│   │   │   ├── utils/          # Validation, formatting
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── ocr-processor/           # Photo processing module
│       ├── src/
│       │   ├── ocr.ts          # Tesseract OCR
│       │   ├── vision.ts       # AI vision API (Claude/Google Vision)
│       │   ├── extraction.ts   # Data extraction logic
│       │   ├── validators.ts   # Extracted data validation
│       │   └── index.ts
│       └── package.json
│
├── docker/
│   ├── postgres.dockerfile     # PostgreSQL setup
│   └── docker-compose.dev.yml  # Development environment
│
├── .github/
│   └── workflows/              # CI/CD pipelines (optional)
│
├── ТЗ.md                        # Technical specification
├── CLAUDE.md                    # This file
├── package.json               # Root workspace config (pnpm)
├── pnpm-workspace.yaml        # Workspace definition
├── tsconfig.json              # Root TS config
└── .gitignore
```

---

## Tech Stack

### Backend (apps/backend)

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT tokens
- **OCR & Vision**:
  - Tesseract.js (local OCR)
  - Claude API or Google Vision API (AI extraction)
- **File Storage**: AWS S3 or local filesystem
- **API Documentation**: Swagger/OpenAPI
- **Testing**: Jest, Supertest

### Mobile (apps/mobile)

- **Framework**: React Native with Expo Go later ejecting Expo to bare
- **Language**: TypeScript
- **Navigation**: React Navigation
- **State Management**: Context API + useState
- **HTTP Client**: Axios
- **Image handling**: expo-image-picker, expo-image-manipulator
- **Storage**: AsyncStorage (local caching)

### Shared (packages/shared)

- **Purpose**: Common types, constants, utilities
- **Exports**: TypeScript interfaces, enums, validation functions

### OCR Processor (packages/ocr-processor)

- **OCR Engine**: Tesseract.js
- **Vision AI**: Claude API / Google Vision API
- **Data extraction**: Pattern matching, text parsing

---

## Database Schema (PostgreSQL)

### Core Tables

- `users` — User accounts with role (operator/admin)
- `boxes` - Коробки каждая из которых имеет свой артикль
- `books` — Book cards with metadata
- `book_photos` — Photos for each book (up to 10) содержит file_url на S3
- `ocr_results` - Results from OCR
- `ozon_products` — Generated Ozon listings
- `activity_logs` — Statistics (cards created, user actions)
- `system_settings` - Settings that admin can change

---

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm (npm i -g pnpm)
- PostgreSQL 14+
- Docker (optional, for PostgreSQL)

### Installation

```bash
# Clone and setup
cd /Users/gabryszewski003/projects/BookScanner
pnpm install

# Setup environment files
cp apps/backend/.env.example apps/backend/.env
# Update .env with your database credentials, API keys, etc.

# Run PostgreSQL in Docker (optional)
docker-compose -f docker/docker-compose.dev.yml up -d

# Run database migrations
cd apps/backend
pnpm run migration:run
```

### Common Commands

#### Backend Development

```bash
# From repository root
cd apps/backend

# Development server with hot reload
pnpm dev

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run e2e tests
pnpm test:e2e

# Build for production
pnpm build

# Database migrations
pnpm migration:create   # Create new migration
pnpm migration:run      # Run migrations
pnpm migration:revert   # Revert last migration

# Generate API docs
pnpm swagger
```

#### Mobile Development

```bash
# From repository root
cd apps/mobile

# Start Expo dev server
pnpm start

# Run on iOS simulator
pnpm ios

# Run on Android emulator
pnpm android

# Run tests
pnpm test

# Build for production
pnpm build
```

#### Workspace (root level)

```bash
# Install dependencies across all packages
pnpm install

# Build all packages
pnpm build

# Run tests in all packages
pnpm test

# Lint all packages
pnpm lint

# Shared package specific
cd packages/shared
pnpm build  # Compile to dist/
```

---

## API Endpoints (Backend)

### Authentication

- `POST /auth/register` — Register new user (requires admin approval)
- `POST /auth/login` — Login with phone/email + password
- `POST /auth/refresh` — Refresh JWT token
- `POST /auth/logout` — Logout

### Boxes (Operator)

- `POST /boxes/create` - Create a new box of books
- `GET /boxes` - Get the list of boxes
- `GET /boxes/:id` - Get box details
- `PATCH /boxes/:id` - Update box details
- `DELETE /box/:id` - Delete box

### Books (Operator)

- `POST /books` — Create new book card
- `GET /books` — List user's books
- `GET /books/:id` — Get book details
- `PATCH /books/:id` — Update book data
- `DELETE /books/:id` — Delete book

### Photos

- `POST /books/:id/photos` — Upload photos (up to 10)
- `PATCH /books/:id/photos/:photoId` — Replace photo
- `DELETE /books/:id/photos/:photoId` — Delete photo
- `POST /books/:id/photos/reorder` — Change photo order

### Vision & OCR

- `POST /vision/extract` — Extract data from photo
- `POST /vision/isbn-lookup` — Search by ISBN on Ozon

### Ozon Integration

- `POST /ozon/publish` — Create product listing on Ozon
- `GET /ozon/price-lookup` — Get average price from Ozon

### Admin

- `GET /admin/users` — List all users
- `POST /admin/users` — Create user
- `PATCH /admin/users/:id` — Update user (role, permissions)
- `DELETE /admin/users/:id` — Delete user
- `GET /admin/statistics` — Get statistics (cards, users, performance)
- `GET /admin/books/database` — Search/export book database
- `POST /admin/settings` — Update system settings
- `GET /admin/settings` — Get current settings

---

## Key Implementation Details

### Photo Processing Workflow

1. **Upload**: Operator uploads 2-10 photos (Photo 01 = cover, Photo 02 = book info)
2. **Extraction**:
   - Photo 01: Size (by ruler), title, author
   - Photo 02: ISBN, title, author, dimensions, weight, publisher, year, paper type, cover type, pages, annotation
3. **AI Processing**: Use Claude API to extract and validate data
4. **Price Lookup**: Query Ozon API for similar books, calculate average price
5. **Card Generation**: Auto-fill Ozon product card with extracted data + manual fields
6. **Validation**: Operator reviews and corrects data before publishing

### Book Card Structure

```typescript
interface BookCard {
  id: string;
  boxNumber: string;
  sku: string; // BoxNumber_UniqueCode

  // Basic info
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  yearPublished: number;

  // Physical attributes
  dimensions: { width: number; height: number; depth: number };
  weightGross: number;
  weightNet: number;
  paperType: "офсетная" | "глянцевая" | "матовая";
  coverType: "твердый переплет" | "мягкий переплет";
  pageCount: number;
  language: "русский" | "английский";

  // Ozon specific
  price: number;
  annotation: string;
  hashtags: string[];
  condition: "Хорошая";

  // Photos
  photos: PhotoReference[]; // 2 required, up to 5 additional for Ozon

  // Metadata
  createdBy: string; // User ID
  createdAt: Date;
  updatedAt: Date;
  publishedToOzon?: Date;
}
```

### Authentication & Authorization

- JWT tokens (access + refresh)
- Role-based access control: `@Roles('operator', 'admin')`
- Admin features hidden in mobile UI unless `isAdmin === true`
- Phone/Email uniqueness validation

### Statistics Tracking

- `activity_logs` table: card creation, user login, data extraction events
- Admin dashboard shows: total cards, cards per user, daily/weekly trends

---

## Error Handling & Validation

- All requests validated with class-validators (NestJS)
- Extracted data validated against expected schema
- User-friendly error messages in Russian
- Invalid photos rejected (format, size > 10MB)
- Missing required fields fallback to defaults per spec

---

## Security Considerations

- Passwords hashed with bcrypt (NestJS guard)
- JWT tokens expire (15 min access, 7 day refresh)
- Admin approval required for user registration
- File uploads scanned for viruses (optional ClamAV integration)
- Rate limiting on auth endpoints
- CORS configured for mobile app domain
- Least Privilege
- Privileged access control management

---

## Environment Variables (.env)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/bookscanner
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=bookscanner

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRATION=900 # 15 minutes
JWT_REFRESH_EXPIRATION=604800 # 7 days

# AI/Vision API
CLAUDE_API_KEY=sk-...
VISION_API_KEY=... # Google Vision or alternative

# Ozon Integration
OZON_API_KEY=...
OZON_CLIENT_ID=...

# File Storage
AWS_S3_BUCKET=bookscanner-photos
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# App
NODE_ENV=development
BACKEND_PORT=3000
FRONTEND_URL=http://localhost:8100
```

---

## Important Notes

1. **Photo Requirements**:
   - Photo 01 (cover) must include measurement ruler for size detection
   - Photo 02 (book info page) required for metadata extraction
   - Max 10MB per photo, JPEG/PNG format

2. **Ozon Integration**:
   - Fixed category: Книги → Букинистические издания (1942–2010) → Печатная книга
   - Default values: height = 35mm, weight = 450g (if not detected)
   - Annotation prefix: "ВНИМАНИЕ! Книга не новая! Состояние - на фото."

3. **Operator Flow**:
   - Upload box number + photos
   - System auto-extracts data
   - Review & correct info
   - Generate SKU (BoxNumber_UniqueCode)
   - Lookup price on Ozon
   - Publish to Ozon or save as draft

4. **Admin Functions**:
   - Create/delete users
   - View per-user statistics
   - Manage system settings (OCR prompts, photo limits, etc.)
   - Search & export book database

---

## Testing Strategy

- **Unit Tests**: Individual services, validators, utilities
- **Integration Tests**: API endpoints with mock database
- **E2E Tests**: Full workflow (upload → extract → publish)
- Test photos in `/apps/backend/test/fixtures/photos/`

---
