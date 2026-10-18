#!/bin/sh
# Separate databases and users for Studio and BaSyx on one server.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE studio LOGIN PASSWORD '${STUDIO_DB_PASSWORD}';
CREATE DATABASE studio OWNER studio;
CREATE ROLE basyx LOGIN PASSWORD '${BASYX_DB_PASSWORD}';
CREATE DATABASE basyx OWNER basyx;
\connect basyx
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
