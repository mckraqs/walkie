# Local Setup

## Prerequisites

Install these system-level dependencies before proceeding:

- **Python 3.14+** - managed via [uv](https://docs.astral.sh/uv/)
- **Node.js 25+** / npm 11+
- **Docker Desktop**
- **GDAL** - `brew install gdal` on macOS (provides GDAL and GEOS libraries for
  GeoDjango)

## Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with appropriate values:

| Variable            | Description                 | Default     |
| ------------------- | --------------------------- | ----------- |
| `DEBUG`             | Enable Django debug mode    | `False`     |
| `SECRET_KEY`        | Django secret key           | -           |
| `POSTGRES_DB`       | Database name               | `walkie`    |
| `POSTGRES_USER`     | Database user               | `walkie`    |
| `POSTGRES_PASSWORD` | Database password           | `walkie`    |
| `POSTGRES_HOST`     | Database host               | `localhost` |
| `POSTGRES_PORT`     | Database port               | `5432`      |

The Docker Compose port mapping is `5432:5432` (host:container), so the default port
works without changes.

If GDAL/GEOS libraries are not at the default Homebrew paths, override them:

```bash
export GDAL_LIBRARY_PATH="/opt/homebrew/lib/libgdal.dylib"
export GEOS_LIBRARY_PATH="/opt/homebrew/lib/libgeos_c.dylib"
```

## Database

Start the PostGIS + pgRouting container:

```bash
docker compose up -d
```

Verify it is running:

```bash
docker compose ps
```

The image is `pgrouting/pgrouting:17-3.5-3.7.3` (PostGIS and pgRouting included). Port
mapping: host `5432` -> container `5432`.

## Backend

Install Python dependencies, apply migrations, and start the Django dev server:

```bash
uv sync
uv run python backend/manage.py migrate
uv run python backend/manage.py createsuperuser  # optional
uv run python backend/manage.py runserver         # http://localhost:8000
```

## Frontend

Install Node dependencies and start the Next.js dev server:

```bash
cd frontend && npm install
npm run dev  # http://localhost:3000
```

Optionally create `frontend/.env.local` with:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Defaults work without it.

## Data Ingestion (Optional)

To populate the database with walking data:

1. Download street data via the OSM provider
2. Run the management commands in order: `load_regions` -> `load_paths` ->
   `load_segments` -> `build_topology`

See [Data Pipeline](data-pipeline.md) for full details.

## Running Tests

Backend (requires a running database):

```bash
uv run pytest
```

Frontend:

```bash
cd frontend && npm run test
```

Linting:

```bash
uv run ruff check .
```

Type checking:

```bash
uv run pyright
```

## Developer Tooling

Install pre-commit hooks to enforce code quality on every commit:

```bash
uv run pre-commit install
```

## Terminal Layout

Three long-running processes run in parallel during development:

| Terminal | Service  | Command                                          |
| -------- | -------- | ------------------------------------------------ |
| 1        | Database | `docker compose up` (or `up -d` for background)  |
| 2        | Backend  | `uv run python backend/manage.py runserver`      |
| 3        | Frontend | `cd frontend && npm run dev`                     |

## Teardown

Stop frontend and backend servers with Ctrl+C in their respective terminals. Then stop
the database:

```bash
docker compose down       # stop the container
docker compose down -v    # stop and wipe the database volume
```
