FROM python:3.14-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    gdal-bin \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/lib/$(uname -m)-linux-gnu/libgdal.so /usr/lib/libgdal.so \
    && ln -sf /usr/lib/$(uname -m)-linux-gnu/libgeos_c.so /usr/lib/libgeos_c.so

ENV GDAL_LIBRARY_PATH=/usr/lib/libgdal.so
ENV GEOS_LIBRARY_PATH=/usr/lib/libgeos_c.so

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

ENV PATH="/app/.venv/bin:$PATH"

COPY backend/ backend/

EXPOSE 8000

ENTRYPOINT ["backend/entrypoint.sh"]
