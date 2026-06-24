-- Migration: étendre le type d'établissement unique en plusieurs types
-- La colonne `type` (texte simple) devient `types` (simple-array TypeORM).
-- Simple-array stocke les valeurs en texte séparé par des virgules ; un seul type
-- existant reste donc valide comme tableau à un seul élément.

-- PostgreSQL
ALTER TABLE etablissements RENAME COLUMN type TO types;

-- SQLite
-- ALTER TABLE etablissements RENAME COLUMN type TO types;
