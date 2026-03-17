#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -q; do
  sleep 1
done

echo "Running migrations..."
python backend/manage.py migrate --noinput

echo "Starting development server..."
exec python backend/manage.py runserver 0.0.0.0:8000
