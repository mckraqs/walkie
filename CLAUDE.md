# Claude Code Guidelines

## Project Context

This codebase provides reusable Python utilities and enforces engineering standards
across projects. Code quality, data integrity, and operational reliability are
non-negotiable.

All code must pass static analysis (ruff, pyright), automated tests (pytest), and
pre-commit checks before merge.

## Communication Style

- Provide professional, concise answers without unnecessary filler
- Skip emojis unless explicitly requested
- Give thorough explanations when discussing architecture, trade-offs, or complex logic
- Be direct about limitations or concerns with proposed approaches

## Do Not

- Read environment variables without being asked
- Run AWS CLI commands (use documentation or ask for confirmation first)
- Execute destructive database operations without explicit approval
- Expose or log sensitive data (API keys, PII, financial records)
- Make assumptions about production data or infrastructure state

## Best Practices to Follow

### Code Quality

- Write self-documenting code with clear naming conventions
- Keep functions focused and small -- single responsibility, single level of abstraction
- Prefer explicit over implicit behavior; no hidden side effects
- Use type annotations everywhere; code must pass pyright in standard mode
- Handle edge cases and failure modes explicitly -- fail fast with descriptive errors
- Favor composition over inheritance; use dependency injection for testability

### Data Engineering

- Validate data at ingestion boundaries; enforce schemas and data contracts between
  producers and consumers
- Design pipelines to be idempotent and support incremental processing -- full refreshes
  only when explicitly justified
- Document data lineage and transformation logic; treat pipeline metadata as
  a first-class artifact
- Use appropriate data types for the domain -- precision matters (decimals for money,
  proper types for timestamps, geometry, etc.)
- Build data quality checks into pipelines, not as afterthoughts -- assert row counts,
  null rates, and value distributions at each stage
- Design for schema evolution from the start; prefer formats that handle additive
  changes gracefully (Parquet, Avro, Delta/Iceberg)

### Security

- Never hardcode credentials or secrets
- Sanitize inputs, especially for SQL queries
- Follow principle of least privilege for IAM roles and database access
- Be cautious with logging - avoid PII and sensitive business data

### Python Ecosystem

- Use uv for dependency management and virtual environments; do not use pip directly
- Target the Python version in .python-version; use modern syntax (PEP 695 type aliases,
  match statements, X | Y unions)
- Run ruff for linting and formatting; do not introduce black, isort, flake8, or pylint
- Run pyright for static type checking; do not introduce mypy
- Follow Google-style docstrings (enforced by ruff D rules)
- Prefer standard library solutions before reaching for third-party packages

### Testing Strategy

- Write tests alongside implementation, not after; every module gets a corresponding
  test module
- Use pytest with fixtures for setup; prefer fixtures over setUp/tearDown class methods
- Test behavior, not implementation -- assert on outputs and side effects, not internal
  state
- Cover edge cases and error paths, not just the happy path
- Use parametrize for testing multiple input variations; avoid copy-pasted test
  functions
- Keep tests fast and isolated -- mock external dependencies, never hit real databases
  or APIs in unit tests

## When Uncertain

- Ask clarifying questions before implementing
- Propose multiple approaches with trade-offs when applicable
- Flag potential impacts on downstream systems or data consumers
