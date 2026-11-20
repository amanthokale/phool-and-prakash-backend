# RangPop Backend

Starter Node.js + Express API for the RangPop storefront (RangPop, formerly "Phool & Prakash"; directory names and `PHOOL_PRAKASH_MONGODB_URI` keep the old name).

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
- `PHOOL_PRAKASH_MONGODB_URI` — MongoDB Atlas connection string (required; the server exits if it is missing or the connection fails)

## Security notes
- Never commit `.env` or real database credentials.
- This is a starter API, not a complete production e-commerce backend yet.
- Product and order routes, database connection, admin authentication, and payment verification will be added in subsequent steps.
