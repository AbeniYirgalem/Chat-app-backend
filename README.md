# Chatify Backend

Express + MongoDB + Socket.IO backend for a real-time chat application. Handles authentication, messaging, image uploads, email verification, and live presence/events.

## Stack

- Node.js, Express, Mongoose
- JWT auth with HTTP-only cookies
- Socket.IO for real-time messaging and read/delete events
- Cloudinary for image storage
- Nodemailer for email verification
- Arcjet middleware for abuse/rate protection

## Features

- Email/password signup with verification token flow
- Login/logout with signed JWT cookies
- Profile photo upload to Cloudinary
- User discovery (contact list) and chat partner summaries with unread counts
- One-to-one messaging with optional images, read receipts, and delete (for me / everyone)
- Message/state updates pushed via Socket.IO

## Quickstart

1. Install dependencies

```sh
npm install
```

2. Configure environment

Create `.env` (or update `.env.example`) with the variables below.

3. Run the server

```sh
npm run dev   # uses nodemon
# or
npm start
```

Server defaults to port 3000 unless `PORT` is set.

## Environment variables

- `PORT` (optional) – server port
- `MONGO_URI` – MongoDB connection string
- `JWT_SECRET` – secret for signing JWTs
- `NODE_ENV` – `development` | `production`
- `CLIENT_URL` – allowed origin for CORS and cookies
- `EMAIL_USER`, `EMAIL_PASS` – SMTP credentials for verification emails
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` – Cloudinary upload credentials
- `ARCJET_KEY`, `ARCJET_ENV` – Arcjet configuration

## API overview

Base path: `/api`

**Auth**

- `POST /auth/signup` – create account, sends verification email
- `POST /auth/login` – login and set JWT cookie
- `POST /auth/logout` – clear session
- `GET /auth/verify-email?token=...` – verify email token
- `PUT /auth/update-profile` – update profile picture (auth required)
- `DELETE /auth/delete-account` – delete user, messages, and Cloudinary assets (auth required)
- `GET /auth/check` – return current user (auth required)

**Messages** (all auth + Arcjet protected)

- `GET /messages/contacts` – list other users
- `GET /messages/chats` – chat partners with unread counts
- `GET /messages/:id` – fetch conversation with a user; marks incoming as read
- `POST /messages/send/:id` – send text/image message
- `DELETE /messages/:id?scope=me|everyone` – delete message for self or everyone (sender only)

## Real-time events (Socket.IO)

- `newMessage` – emitted to receiver on new message
- `messagesRead` – emitted when messages marked read
- `messageDeleted` – emitted when a message is removed for everyone

## Project structure

```
src/
  controllers/      # auth and message handlers
  lib/              # db, env, socket, email, cloudinary, utils
  middleware/       # auth and Arcjet protection
  models/           # User, Message schemas
  routes/           # auth.route.js, message.route.js
  server.js         # entrypoint
```

## Deployment notes

- In production, static frontend served from `../frontend/dist` when present.
- Ensure CORS `CLIENT_URL` matches deployed frontend for cookies to work.
