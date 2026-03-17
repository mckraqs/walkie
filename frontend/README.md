# Walkie Frontend

Next.js application providing the web interface for Walkie. Displays interactive maps
with Leaflet.js, handles route visualization, and communicates with the Django backend
via REST API.

## Docker

When using `docker compose up` from the repository root, the frontend is built and
served automatically. Source files are bind-mounted so changes trigger hot reload. The
instructions below are for native (non-Docker) development only.

## Development

```bash
npm install
npm run dev    # http://localhost:3000
```

The frontend expects the backend API at `http://localhost:8000` by default. Override
with a `NEXT_PUBLIC_API_URL` variable in `.env.local` if needed.

## Build

```bash
npm run build
```

## Tests

```bash
npm run test
```
