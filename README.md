# Phool & Prakash Backend

Starter Node.js + Express API for the Phool & Prakash storefront.

## Requirements
- Node.js 18 or newer
- npm

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and adjust values as needed.

```bash
npm run dev
```

The API starts on `http://localhost:5000`.

## Test endpoints
- `GET /` — API welcome response
- `GET /api/health` — health check

Example response from `/api/health`:

```json
{
  "success": true,
  "status": "healthy"
}
```

## Environment variables
- `PORT` — API port, default `5000`
- `FRONTEND_URL` — allowed frontend origin for CORS, default `http://localhost:5173`
- `MONGODB_URI` — reserved for the MongoDB Atlas connection in the next step

## Security notes
- Never commit `.env` or real database credentials.
- This is a starter API, not a complete production e-commerce backend yet.
- Product and order routes, database connection, admin authentication, and payment verification will be added in subsequent steps.
