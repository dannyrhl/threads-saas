# Threads SaaS Backend (Node.js + Express + PostgreSQL + Prisma)

Clean backend API for a Threads-like SaaS app using:
- Express
- PostgreSQL
- Prisma ORM
- JWT authentication
- bcrypt password hashing

## Features

- User registration (`POST /api/auth/register`)
- User login (`POST /api/auth/login`)
- Protected current-user route (`GET /api/auth/me`)
- Thread model with text content
- Like model for thread reactions
- Create thread (`POST /api/threads`)
- Edit own thread (`PATCH /api/threads/:id`)
- Get all threads (`GET /api/threads`)
- Delete own thread (`DELETE /api/threads/:id`)
- Toggle like on a thread (`POST /api/threads/:id/likes/toggle`)

## Folder Structure

```text
.
├── prisma/
│   └── schema.prisma
├── src/
│   ├── config/
│   │   └── prisma.js
│   ├── controllers/
│   │   ├── authController.js
│   │   └── threadController.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── errorHandler.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── threadRoutes.js
│   ├── utils/
│   │   └── token.js
│   ├── app.js
│   └── server.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL running locally or remotely

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Update `.env` values (especially `DATABASE_URL` and `JWT_SECRET`).

4. Generate Prisma client:

```bash
npm run prisma:generate
```

5. Run database migrations:

```bash
npm run prisma:migrate -- --name init
```

6. Start dev server:

```bash
npm run dev
```

Server default URL: `http://localhost:4000`

## React Frontend

A React frontend is available in `frontend/` with:
- Login/Register
- Thread creation (authenticated)
- Thread editing (own threads)
- Feed view (public)

Run it in a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:4000`.
Keep the backend running (`npm run dev` in project root) while using the frontend.

## Show It On iPhone

For a quick live demo on your iPhone in the same Wi-Fi:

1. Start the backend from the project root:

```bash
npm run dev
```

2. Start the frontend from `frontend/`:

```bash
npm run dev
```

3. Open the Vite URL on your iPhone using your Mac's LAN IP:

```text
http://YOUR-MACBOOK-LAN-IP:5173
```

Example: `http://192.168.1.42:5173`

Notes:
- The frontend dev server is configured to listen on `0.0.0.0`, so devices in the same network can open it.
- On a real iPhone, the UI now uses full-screen mobile layout instead of the centered desktop phone frame.
- If you build the frontend for a standalone iPhone web app or Capacitor app, create `frontend/.env` from `frontend/.env.example` and set `VITE_API_BASE_URL=http://YOUR-MACBOOK-LAN-IP:4000`.

## Deploy On Render

This repo is now set up for a single Render web service:
- Express serves the API under `/api/*`
- Express also serves the built frontend from `frontend/dist`
- Render can use the included [`render.yaml`](/Users/dannyrehrl/threads-saas/render.yaml)

What you need in Render:
- `DATABASE_URL`
- `JWT_SECRET`

Deploy flow:
1. Push this repo to GitHub.
2. In Render, create a new Blueprint and select the repo.
3. Render will detect `render.yaml` and create the `threads-saas` web service.
4. Add your PostgreSQL `DATABASE_URL` and a real `JWT_SECRET`.
5. Deploy.

After deploy, open the Render URL on your iPhone in Safari and use “Add to Home Screen” if you want it to behave like an app icon.

## API Endpoints

### Auth

- `POST /api/auth/register`

Request body:

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "securepassword"
}
```

- `POST /api/auth/login`

Request body:

```json
{
  "email": "alice@example.com",
  "password": "securepassword"
}
```

- `GET /api/auth/me` (Protected)

Header:

```text
Authorization: Bearer <jwt_token>
```

### Threads

- `GET /api/threads` (Public)
- Response includes `likeCount` for each thread.
- `POST /api/threads` (Protected)
- `PATCH /api/threads/:id` (Protected, only thread owner can edit)

Request body:

```json
{
  "content": "Hello from my first thread"
}
```

- `DELETE /api/threads/:id` (Protected, only thread owner can delete)
- `POST /api/threads/:id/likes/toggle` (Protected)

## Notes

- Thread content is limited to 280 characters.
- Passwords are hashed with bcrypt before storage.
- JWT payload stores `userId` and uses `JWT_SECRET`.
- No in-memory storage is used; all persistent data is stored in PostgreSQL via Prisma.
