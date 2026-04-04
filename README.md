# Jolly Book — BookScanner

Система автоматизации создания карточек товаров (б/у книг) для маркетплейса Ozon на основе фотографий.

Оператор фотографирует книгу → ИИ распознаёт все данные → администратор проверяет данные и отправляет на Озон → карточка автоматически публикуется на Ozon.

---

## Как это работает

```
Фото книги → Gemini Vision → Данные карточки → Проверка администратором → Публикация на Ozon
```

1. Оператор (фотограф) создаёт рабочую сессию и загружает фото книги (обложка + страница с данными)
2. ИИ извлекает: название, автор, ISBN, издательство, год, размеры, вес, тип бумаги, аннотацию, цену
3. Оператор закрывает сессию (ккарточки книг отправляются администраторам на проверку)
4. Администратор проверяет и при необходимости корректирует данные
5. Система публикует карточку товара на Ozon с правильными атрибутами

---

## Возможности

**Для операторов:**

- Создание карточек книг с AI-распознаванием
- Управление рабочими сессиями и коробками
- Загрузка и упорядочивание фотографий (до 10 штук)
- Просмотр и редактирование карточек

**Для администраторов:**

- Создание карточек книг с AI-распознаванием
- Загрузка и упорядочивание фотографий (до 10 штук)
- Управление пользователями (создание, одобрение, роли)
- Статистика по операторам и карточкам
- База всех книг с поиском
- Модерация карточек перед публикацией
- Настройка нескольких Ozon-магазинов
- Управление системными настройками

---

## Технологии

| Слой           | Стек                                                  |
| -------------- | ----------------------------------------------------- |
| Backend        | NestJS 10, TypeScript, PostgreSQL 14, Redis 7, BullMQ |
| Mobile         | React Native 0.81, Expo 54, React Navigation 7        |
| AI/Vision      | Google Gemini Vision, OpenAI API                      |
| Storage        | Yandex Cloud Object Storage S3 Standard               |
| Infrastructure | Docker, Nginx, SSL (Certbot)                          |
| Monorepo       | pnpm workspaces                                       |

---

## Структура проекта

```
BookScanner/
├── apps/
│   ├── backend/        # NestJS API
│   └── mobile/         # React Native (Expo)
├── packages/
│   ├── shared/         # Общие типы и утилиты
│   └── ocr-processor/  # Библиотека OCR/Vision
└── docker/             # Docker Compose конфигурации
```

---

## Установка и запуск

### Требования

- Node.js 20+
- pnpm
- Docker (для PostgreSQL и Redis)

### Локальный запуск

```bash
# 1. Установить зависимости
pnpm install

# 2. Настроить переменные окружения
cp apps/backend/.env.example apps/backend/.env
# Заполнить .env своими данными (см. раздел ниже)

# 3. Запустить базу данных и Redis
docker-compose -f docker/docker-compose.dev.yml up -d

# 4. Применить миграции
cd apps/backend && pnpm migration:run

# 5. Запустить backend
cd apps/backend && pnpm dev

# 6. В другом терминале — запустить мобильное приложение
cd apps/mobile && pnpm start
```

Swagger документация доступна по адресу: `http://localhost:3000/api/docs`

---

## Продакшн

Проект задеплоен на `jollybook.duckdns.org`.

Запуск в продакшне:

```bash
docker-compose -f docker/docker-compose.prod.yml up -d
```

Стек продакшна: PostgreSQL + Redis + Backend (Node 20) + Nginx с SSL.

---

## API

Полная документация: `/api/docs` (Swagger).

Основные группы эндпоинтов:

| Группа            | Базовый путь         |
| ----------------- | -------------------- |
| Авторизация       | `/api/auth`          |
| Книги             | `/api/books`         |
| Коробки           | `/api/boxes`         |
| Фотографии        | `/api/photos`        |
| Vision/OCR        | `/api/vision`        |
| Ozon              | `/api/ozon`          |
| Рабочие сессии    | `/api/work-sessions` |
| Администрирование | `/api/admin`         |
| Настройки         | `/api/settings`      |

---

## Разработка

```bash
# Backend
cd apps/backend
pnpm dev              # Сервер с hot reload
pnpm test             # Тесты
pnpm migration:create # Создать миграцию
pnpm migration:run    # Применить миграции

# Mobile
cd apps/mobile
pnpm start            # Expo dev server
pnpm ios              # iOS симулятор
pnpm android          # Android эмулятор

# Shared packages
cd packages/shared
pnpm build            # Компиляция в dist/
```
