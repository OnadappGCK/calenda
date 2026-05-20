-- Migration: ancien enum -> nouveau enum EventCategory
-- Mapping:
--   Concert          -> Culture & spectacle
--   Spectacle        -> Culture & spectacle
--   Danse            -> Sortie
--   Feux d'artifice  -> Spécial
--   Exposition       -> Arts & expos
--   Autre            -> Spécial

UPDATE event
SET categorie = 'Culture & spectacle'
WHERE categorie IN ('Concert', 'Spectacle');

UPDATE event
SET categorie = 'Sortie'
WHERE categorie = 'Danse';

UPDATE event
SET categorie = 'Sortie'
WHERE categorie = 'Vie sociale';

UPDATE event
SET categorie = 'Arts & expos'
WHERE categorie = 'Exposition';

UPDATE event
SET categorie = 'Spécial'
WHERE categorie IN ('Feux d''artifice', 'Autre');

-- Migration: anciens tags -> nouveaux tags EventTag
-- Mapping:
--   MUSIQUE          -> MUSIQUE       (inchangé)
--   DANSE            -> DANSE         (inchangé)
--   SPORT            -> SPORT         (inchangé)
--   RENCONTRE        -> RENCONTRE     (inchangé)
--   PLEIN AIR        -> PLEIN_AIR
--   FEU D'ARTIFICE   -> FEU_DARTIFICE
--   MARCHÉ           -> (supprimé - pas d'équivalent direct, remplacé par vide)
--   COMPÉTITION      -> CONCOURS
--   HUMOUR           -> (supprimé)
--   ART              -> CULTUREL
--   VISITE           -> CULTUREL

-- Les caractéristiques sont stockées en tableau PostgreSQL text[].
-- Adapter selon le type exact de la colonne (text[], jsonb, varchar...).

-- Si la colonne est de type text[] (PostgreSQL array):
UPDATE event
SET caracteristiques = array_replace(caracteristiques, 'PLEIN AIR', 'PLEIN_AIR')
WHERE caracteristiques @> ARRAY['PLEIN AIR'];

UPDATE event
SET caracteristiques = array_replace(caracteristiques, 'FEU D''ARTIFICE', 'FEU_DARTIFICE')
WHERE caracteristiques @> ARRAY['FEU D''ARTIFICE'];

UPDATE event
SET caracteristiques = array_replace(caracteristiques, 'COMPÉTITION', 'CONCOURS')
WHERE caracteristiques @> ARRAY['COMPÉTITION'];

UPDATE event
SET caracteristiques = array_replace(caracteristiques, 'ART', 'CULTUREL')
WHERE caracteristiques @> ARRAY['ART'];

UPDATE event
SET caracteristiques = array_replace(caracteristiques, 'VISITE', 'CULTUREL')
WHERE caracteristiques @> ARRAY['VISITE'];

-- Supprimer les anciens tags qui n'ont plus d'équivalent
UPDATE event
SET caracteristiques = array_remove(caracteristiques, 'MARCHÉ')
WHERE caracteristiques @> ARRAY['MARCHÉ'];

UPDATE event
SET caracteristiques = array_remove(caracteristiques, 'HUMOUR')
WHERE caracteristiques @> ARRAY['HUMOUR'];
