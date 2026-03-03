# Configuration

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed. The backend falls back to
development defaults (`walkie`/`walkie`/`walkie`) when variables are unset.

| Variable            | Description       | Default     |
| ------------------- | ----------------- | ----------- |
| `POSTGRES_DB`       | Database name     | `walkie`    |
| `POSTGRES_USER`     | Database user     | `walkie`    |
| `POSTGRES_PASSWORD` | Database password | `walkie`    |
| `POSTGRES_HOST`     | Database host     | `localhost` |
| `POSTGRES_PORT`     | Database port     | `5432`      |

## GDAL / GEOS Library Paths

GeoDjango requires GDAL and GEOS native libraries. On macOS with Homebrew the defaults
point to `/opt/homebrew/lib/`. Override via environment variables if your paths differ:

```bash
export GDAL_LIBRARY_PATH="/opt/homebrew/lib/libgdal.dylib"
export GEOS_LIBRARY_PATH="/opt/homebrew/lib/libgeos_c.dylib"
```

## CORS

The backend allows requests from `http://localhost:3000` and `http://localhost:3001`
(the Next.js dev server, which picks whichever port is available). This is configured in
`backend/walkie/settings.py` via `CORS_ALLOWED_ORIGINS`.

## Database Docker Image

The project uses `pgrouting/pgrouting:17-3.5-3.7.3`, which includes PostGIS and
pgRouting extensions with multi-architecture builds (AMD64 and ARM64). No platform flag
is needed on Apple Silicon Macs.
