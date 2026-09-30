# EventHub – Discover Experiences. Create Moments.
Full-stack app: browser frontend → Node.js REST API → SQLite database. No `npm install` needed.

## Run
1. Install Node.js 22.5 or newer (https://nodejs.org).
2. In this folder run: `node --no-warnings server.js`   (or `npm start`)
3. Open http://localhost:3000

The database file is created automatically at `data/eventhub.db` with demo data. Delete the `data` folder to reset.

## Demo logins (password `Password@123`)
- admin@eventhub.demo
- organizer@eventhub.demo
- attendee@eventhub.demo

## Structure
- `server.js` – API, JWT auth, role checks, validation, database schema and seed data
- `public/index.html` – frontend (calls `/api/*` with fetch)
- `data/` – SQLite database (created on first run)

## API
POST /api/auth/register · POST /api/auth/login · GET /api/state
POST/DELETE /api/events/:id/register · POST /api/events · PUT/DELETE /api/events/:id · PATCH /api/events/:id/status
POST /api/notifications/read-all · PATCH /api/admin/users/:id/toggle

## Security
Passwords hashed with scrypt, JWT (HS256) tokens, role checks on every write, parameterized SQL, auth rate limiting.
Seat booking runs inside a BEGIN IMMEDIATE transaction, so seats cannot be overbooked.
