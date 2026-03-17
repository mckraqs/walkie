# Configuration

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed. The backend falls back to
development defaults (`walkie`/`walkie`/`walkie`) when variables are unset.

| Variable               | Description          | Default                  |
| ---------------------- | -------------------- | ------------------------ |
| `DEBUG`                | Enable debug mode    | `False`                  |
| `SECRET_KEY`           | Django secret key    | random (dev only)        |
| `POSTGRES_DB`          | Database name        | `walkie`                 |
| `POSTGRES_USER`        | Database user        | `walkie`                 |
| `POSTGRES_PASSWORD`    | Database password    | `walkie`                 |
| `POSTGRES_HOST`        | Database host        | `localhost`              |
| `POSTGRES_PORT`        | Database port        | `5432`                   |
| `ALLOWED_HOSTS`        | Comma-separated list | `localhost,127.0.0.1`    |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list | `http://localhost:3000`  |

## Docker Compose

When running via `docker compose up`, the following configuration is handled
automatically:

- **`POSTGRES_HOST`** is overridden to `db` (the compose service name) by the
  `environment` block in `docker-compose.yml`. The value in `.env` is ignored.
- **GDAL and GEOS** libraries are installed inside the backend Docker image
  (`backend/Dockerfile`). The environment variables `GDAL_LIBRARY_PATH` and
  `GEOS_LIBRARY_PATH` are set to the correct paths within the container. No host-level
  GDAL installation is needed when using Docker.

## GDAL / GEOS Library Paths (Native Setup)

GeoDjango requires GDAL and GEOS native libraries. On macOS with Homebrew the defaults
point to `/opt/homebrew/lib/`. Override via environment variables if your paths differ:

```bash
export GDAL_LIBRARY_PATH="/opt/homebrew/lib/libgdal.dylib"
export GEOS_LIBRARY_PATH="/opt/homebrew/lib/libgeos_c.dylib"
```

These variables are only needed for native (non-Docker) development.

## CORS

The backend allows requests from `http://localhost:3000` by default. Override via the
`CORS_ALLOWED_ORIGINS` environment variable (comma-separated). This is configured in
`backend/walkie/settings.py` via `CORS_ALLOWED_ORIGINS`.

## Database Docker Image

The project uses `pgrouting/pgrouting:17-3.5-3.7.3`, which includes PostGIS and
pgRouting extensions with multi-architecture builds (AMD64 and ARM64). No platform flag
is needed on Apple Silicon Macs.
