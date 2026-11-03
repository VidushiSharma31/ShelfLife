# ShelfLife

ShelfLife is a full-stack reading tracker that combines Open Library metadata with a personal library, reading dashboard, and AI-assisted book recommendations. Readers can search books, maintain shelves, track reading progress, manage favorite genres, and publish a public profile while keeping private notes and personal data protected.

## Features

- Open Library-powered book search and details
- Personal reading library with default and custom shelves
- Reading status tracking: want to read, currently reading, read, on hold, dropped
- Progress tracking with page counts, ratings, and private notes
- Editable user profile with avatar uploads and favorite genres
- Public profile page that exposes only public shelf data
- Book Buddy recommendation chat powered by Gemini on the backend
- JWT-based authentication with HttpOnly refresh cookies

## Tech stack

- Frontend: React + Vite
- Backend: Express.js + Prisma + PostgreSQL
- Auth: JWT access tokens + rotating refresh tokens in secure cookies
- Book metadata: Open Library APIs
- AI recommendations: LangChain + Google GenAI Gemini
- Validation: Node's built-in test runner; frontend lint/build checks

## Repository structure

```text
ShelfLife/
├── backend/              # Express API, Prisma schema, migrations, scripts, tests
│   ├── controllers/
│   ├── middleware/
│   ├── prisma/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   ├── tests/
│   ├── uploads/          # Local avatar storage for development
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/             # Vite + React client
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── README.md
└── .gitignore
```

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm

## Local setup

### 1) Configure environment variables

Copy the backend example file and update the values for your local database and secrets:

```bash
test -f backend/.env || cp backend/.env.example backend/.env
```

PowerShell:

```powershell
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

Example `backend/.env`:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shelflife_dev?schema=public"
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-different-long-random-secret
GEMINI_API_KEY=replace-with-a-google-ai-studio-key
OPEN_LIBRARY_TIMEOUT_MS=7000
OPEN_LIBRARY_RETRIES=1
GEMINI_TIMEOUT_MS=12000
GEMINI_RETRIES=1
```

Important notes:

- `GEMINI_API_KEY` must be set in the backend environment only.
- `VITE_API_URL` can be used by the frontend when the API is not running at the default `http://localhost:5000/api`.
- Never commit real credentials or secrets.

### 2) Create the PostgreSQL database

Create a database named `shelflife_dev` and ensure the configured user has permission to create tables and run migrations.

### 3) Install dependencies and initialize Prisma

```bash
cd backend
npm install
npm run db:generate
npm run db:migrate
```

Optional demo data:

```bash
cd backend
npm run db:seed
```

Use demo data only in local or development environments.

## Run the app

Start the API:

```bash
cd backend
npm run dev
```

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The main frontend app will run on `http://localhost:5173` and proxy to the API at `http://localhost:5000/api` by default.

## Testing and validation

Backend tests:

```bash
cd backend
npm test
```

Optional AI sanity check:

```bash
cd backend
npm run check:ai
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

## Book Buddy

The backend exposes a recommendation endpoint that accepts either a guest request or an authenticated request. Authenticated requests can use the signed-in reader's favorite genres and limited library context; guest requests are anonymous.

Example Guest request (PowerShell):

```powershell
$body = @{
  message = "Recommend a fantasy book with clever twists"
  history = @()
  preferences = @{ genres = @("Fantasy") }
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:5000/api/recommendations/chat" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

The recommendation flow:

- Queries Open Library for candidate books
- Uses the user's preferences and limited reading data when available
- Sends a structured prompt to Gemini
- Returns curated book recommendations in the app UI

The rate limiter is enforced per process and is intended for local or small deployments; a shared limiter is recommended for production multi-instance deployments.

## API overview

The backend is organized around the main reader workflows:

- `POST /api/auth/register` – Create an account
- `POST /api/auth/login` – Sign in
- `POST /api/auth/logout` – Invalidate the current refresh session
- `POST /api/auth/refresh` – Refresh access tokens
- `GET /api/auth/me` – Get the current authenticated user
- `GET /api/books/search` – Search Open Library titles
- `GET /api/books/:openLibraryId` – Fetch a specific Open Library record
- `GET /api/reading/dashboard` – Get reading stats, shelves, and updates
- `GET /api/shelves` / `POST /api/shelves` – List or create shelves
- `PATCH /api/shelves/:shelfId` / `DELETE /api/shelves/:shelfId` – Update or delete a shelf
- `POST /api/shelves/:shelfId/books` – Add a book to a shelf
- `PATCH /api/reading/:entryId` – Update progress, rating, notes, or shelf placement
- `DELETE /api/reading/:entryId` – Remove a book from the library
- `PATCH /api/profile/me` – Update profile fields such as display name and bio
- `PUT /api/profile/me/avatar` / `DELETE /api/profile/me/avatar` – Upload or delete a profile image
- `GET /api/profile/me/genres` / `PUT /api/profile/me/genres` – Read or replace favorite genres
- `GET /api/profile/users/:userId` – Read a public profile and public shelves
- `POST /api/recommendations/chat` – Run Book Buddy recommendations

Most data-mutating routes and reading/profile endpoints require an authenticated session.

## Operational notes

- Default shelves are private unless explicitly made public.
- Custom shelves are private by default.
- Reading notes are always private.
- Profile images are stored in `backend/uploads` and served by the API for local development.
- Public profiles show only public shelf information; private notes and email data are excluded.
- Friends/social features are not the primary implementation in the current build; the UI includes public-profile access points but the underlying social graph is still limited.
