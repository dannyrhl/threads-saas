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
- Get all threads (`GET /api/threads`)
- Delete own thread (`DELETE /api/threads/:id`)
- Like a thread (`POST /api/threads/:id/likes`)
- Unlike a thread (`DELETE /api/threads/:id/likes`)

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
- Feed view (public)

Run it in a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:4000`.
Keep the backend running (`npm run dev` in project root) while using the frontend.

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

Request body:

```json
{
  "content": "Hello from my first thread"
}
```

- `DELETE /api/threads/:id` (Protected, only thread owner can delete)
- `POST /api/threads/:id/likes` (Protected)
- `DELETE /api/threads/:id/likes` (Protected)

## Notes

- Thread content is limited to 280 characters.
- Passwords are hashed with bcrypt before storage.
- JWT payload stores `userId` and uses `JWT_SECRET`.
- No in-memory storage is used; all persistent data is stored in PostgreSQL via Prisma.
