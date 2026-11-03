# ShelfLife

ShelfLife combines Open Library discovery with a personal library for organizing books, tracking reading progress, and maintaining a reader profile. Reader accounts, shelves, books, and progress are stored in PostgreSQL through Prisma.

## Current architecture

- Frontend: React + Vite
- Backend: Express.js API
- Book metadata source: Open Library search and work endpoints
- Data access: Prisma ORM configured for PostgreSQL
- Authentication: short-lived JWT access tokens held in frontend memory and rotating, HttpOnly refresh cookies
- Personal library: five default shelves, custom shelves, book ratings, private notes, and page progress
- Profiles: editable account profile with locally stored profile images, favorite-genre preferences, and public profiles that show only public shelves

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm

### Environment variables

Copy the backend example environment file and update values:

```bash
test -f backend/.env || cp backend/.env.example backend/.env
```

On Windows PowerShell, use:

```powershell
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

Then set `GEMINI_API_KEY` in `backend/.env` to a key created in Google AI Studio. Do not put this key in any `VITE_*` variable or frontend environment file.

Example values:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shelflife_dev?schema=public"
JWT_ACCESS_SECRET=replace-with-long-random-secret
JWT_REFRESH_SECRET=replace-with-long-random-secret
GEMINI_API_KEY=replace-with-a-Google-AI-Studio-key
```

### PostgreSQL setup

1. Create a database named `shelflife_dev`.
2. Ensure the configured database user has create-table permissions.
3. Run Prisma migrations:

```bash
cd backend
npm run db:generate
npm run db:migrate
```

### Seed demo data

```bash
cd backend
npm run db:seed
```

Only use demo data in local or test environments.

## Run the app

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:5000/api`. Set `VITE_API_URL` in the frontend environment when the API is hosted elsewhere.

## Testing

```bash
cd backend
npm test
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

### Try Book Buddy locally

After adding a Google AI Studio key to `backend/.env` and starting the backend, send one guest request from PowerShell:

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

The endpoint also accepts the frontend's verified bearer token to personalize recommendations. A guest request has no account context. Both use a per-process request limit.

## Important migration notes

- MongoDB was not the active application database in this repository; the current app uses an Open Library-backed API and a simple Express server. The project now uses PostgreSQL and Prisma as the canonical data layer.
- Existing Open Library search behavior remains intact and is preserved through the same API surface.
- Any production credential or secret should stay in environment variables and never be committed to source control.

## API routes

All `/api/shelves`, `/api/reading`, `/api/profile/me`, and `/api/auth/me` endpoints require a valid Bearer access token. The frontend keeps the access token in memory and obtains a replacement through the HttpOnly refresh cookie after a reload or token expiry.

- `GET /api/books/search` - Search Open Library books
- `GET /api/books/:openLibraryId` - Fetch a specific Open Library title
- `POST /api/recommendations/chat` - Get grounded Book Buddy recommendations (guest or authenticated; rate limited)
- `POST /api/auth/register` - Create an account
- `POST /api/auth/login` - Log in
- `POST /api/auth/logout` - Revoke the current refresh session and invalidate its access token
- `POST /api/auth/refresh` - Refresh a session
- `GET /api/auth/me` - Fetch the current authenticated user
- `GET /api/reading/dashboard` - Authenticated reading counts, shelves, current progress, and recently updated books
- `GET /api/shelves` - List the current user's shelves and books
- `POST /api/shelves` - Create a custom shelf (`name`, optional `description`, and `visibility`)
- `PATCH /api/shelves/:shelfId` / `DELETE /api/shelves/:shelfId` - Update or delete a custom shelf; default shelves cannot be deleted
- `POST /api/shelves/:shelfId/books` - Add or move an Open Library book to one of the user's shelves
- `PATCH /api/reading/:entryId` - Update page progress, rating, private notes, or move a book to another shelf
- `DELETE /api/reading/:entryId` - Remove a book from the user's library
- `PATCH /api/profile/me` - Update the authenticated user's display name or bio
- `PUT /api/profile/me/avatar` / `DELETE /api/profile/me/avatar` - Upload or remove the authenticated user's profile image (JPEG, PNG, or WebP; maximum 5 MB)
- `GET /api/profile/me/genres` / `PUT /api/profile/me/genres` - Read or replace the authenticated user's favorite genres
- `GET /api/profile/users/:userId` - Read a public profile and its public shelves (no email or private notes)

## Known limitations

- Friend connections and other social interactions are not implemented; the Friends page points readers to their public profile.
- Open Library search and detail pages require a working connection to `openlibrary.org`.
- Book Buddy requires a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Set `GEMINI_API_KEY` in `backend/.env`; it is used only by the backend and is never sent to the frontend. The integration uses LangChain's `@langchain/google-genai` adapter with the stable `gemini-3.8-flash` model. Google currently lists standard text input/output for this model as free of charge within the free tier, subject to model and account rate limits. See Google's [model details](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and [current pricing](https://ai.google.dev/gemini-api/docs/pricing).
- Book Buddy retrieves candidates from Open Library before invoking Gemini; only retrieved candidate records can appear as recommendation cards. Authenticated requests use only the current user's favorite genres and limited book/status/rating context. Guest requests use no account data. Chat is limited to 3 guest or 8 authenticated requests per 10 minutes per process; deploy behind a shared rate limiter for multi-instance production.
- Default shelves are private unless the owner explicitly changes their visibility. Custom shelves are private by default, and reading notes are always private.
- Profile images are stored in `backend/uploads` and served by the API. This is suitable for a single-instance local deployment; multi-instance or ephemeral deployments should use shared object storage. The upload directory is excluded from Git.
