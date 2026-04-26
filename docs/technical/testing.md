# Testing

## Backend

### Framework

pytest with pytest-django. Configuration in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "walkie.settings"
pythonpath = ["backend"]
testpaths = ["backend", "data"]
```

### Shared Fixtures

The file `backend/conftest.py` provides reusable fixtures available to all backend
tests:

- `user` - a test user created with `create_user`
- `auth_token` - a DRF Token for the test user
- `auth_client` - an `APIClient` pre-authenticated with the token
- `sample_region` / `saved_region` - Region instances (unsaved / saved)
- `sample_path` - Path instance with valid MultiLineString geometry
- `sample_segment` / `saved_segment` - Segment instances (unsaved / saved)
- `multipolygon` / `multilinestring` - raw GEOSGeometry fixtures

Use these fixtures in your test functions to avoid repeated setup and teardown logic.

### Test Files

The following test files are included in the project:

- `backend/test_migrations.py` - Database migration tests
- `backend/regions/tests.py` - Region listing and detail tests
- `backend/paths/tests.py` - Path and segment listing tests
- `backend/places/tests.py` - Place CRUD tests
- `backend/routes/tests.py` - Route generation, saving, and management tests
- `backend/walks/tests.py` - Walk creation, update, deletion, and progress tests
- `backend/users/tests/test_users.py` - User authentication and account tests
- `backend/users/tests/test_walked_paths.py` - Walk coverage computation tests

Each Django app should have a `tests/` subdirectory with a corresponding test module for
each major feature.

### Prerequisites

A running PostGIS database is required for backend tests. Use the same Docker container
that runs during development. Ensure the database is initialized with the latest
migrations before running tests:

```bash
uv run python manage.py migrate
```

### Running Tests

Execute tests using the following commands:

```bash
uv run pytest
```

Run a single test file:

```bash
uv run pytest backend/users/tests/test_users.py
```

Run tests matching a name pattern:

```bash
uv run pytest -k "test_login"
```

Run tests with verbose output:

```bash
uv run pytest -v
```

Run tests and show print statements:

```bash
uv run pytest -s
```

## Frontend

### Frontend Framework

Vitest with Testing Library. Configuration in `frontend/vitest.config.ts`:

```typescript
test: {
  environment: "jsdom",
  globals: true,
  setupFiles: ["./src/test/setup.ts"],
  include: ["src/**/*.test.{ts,tsx}"],
  css: false,
}
```

### Setup File

`frontend/src/test/setup.ts` configures the test environment:

- Imports `@testing-library/jest-dom/vitest` for DOM matchers
- Polyfills `ResizeObserver` (required by Radix UI components)
- Mocks `next/navigation` (useRouter, usePathname, useSearchParams)
- Mocks `next/dynamic` (returns null component for dynamically imported modules like the
  map)
- Runs `cleanup()` after each test

### Frontend Test Files

Component tests in `frontend/src/components/__tests__/`:

- `ConfirmDialog.test.tsx`
- `LoginForm.test.tsx`
- `PathList.test.tsx`
- `PlaceNameDialog.test.tsx`
- `Places.test.tsx`
- `RoutePlanner.test.tsx`
- `SavedRoutes.test.tsx`
- `Select.test.tsx`
- `SidePanel.test.ts`
- `Toast.test.tsx`
- `UploadGpxDialog.test.tsx`

Library tests in `frontend/src/lib/__tests__/`:

- `api.test.ts`
- `geo.test.ts`
- `gpx.test.ts`

### Running Frontend Tests

```bash
cd frontend && npm run test        # single run
cd frontend && npm run test:watch  # watch mode
```

## Static Analysis

### Linting and Formatting

Use ruff for linting and code formatting:

```bash
uv run ruff check .
```

Automatically format code:

```bash
uv run ruff format .
```

### Type Checking

Run pyright for static type analysis:

```bash
uv run pyright
```

This checks for type errors and ensures code adheres to type annotations.

### Pre-commit Hooks

The project uses pre-commit hooks (configured via `.pre-commit-config.yaml`) to enforce
code quality on every commit. Install hooks with:

```bash
uv run pre-commit install
```

Hooks will automatically run on `git commit`. If a hook fails, the commit is blocked.
Fix the issue and try again.

To manually run hooks on all files:

```bash
uv run pre-commit run --all-files
```
