-- Migration: ancien enum -> nouveau enum EventCategory (adapté pour PostgreSQL, table events)
-- Mapping:
--   Concert          -> Culture & spectacle
--   Spectacle        -> Culture & spectacle
--   Danse            -> Sortie
--   Exposition       -> Arts & expos
--   Autre            -> Spécial

UPDATE events
SET categorie = 'Culture & spectacle'
WHERE categorie IN ('Concert', 'Spectacle');

UPDATE events
SET categorie = 'Sortie'
WHERE categorie = 'Danse';

UPDATE events
SET categorie = 'Sortie'
WHERE categorie = 'Vie sociale';

UPDATE events
SET categorie = 'Arts & expos'
WHERE categorie = 'Exposition';

UPDATE events
SET categorie = 'Spécial'
WHERE categorie IN ('Feux d''artifice', 'Autre');

-- Migration: anciens tags -> nouveaux tags EventTag (adapté pour JSON texte)
-- Mapping:
--   PLEIN AIR        -> PLEIN_AIR
--   FEU D'ARTIFICE   -> FEU_DARTIFICE
--   COMPÉTITION      -> CONCOURS
--   ART              -> CULTUREL
--   VISITE           -> CULTUREL

UPDATE events
SET caracteristiques = replace(caracteristiques, 'PLEIN AIR', 'PLEIN_AIR')
WHERE caracteristiques LIKE '%PLEIN AIR%';

UPDATE events
SET caracteristiques = replace(caracteristiques, 'FEU D''ARTIFICE', 'FEU_DARTIFICE')
WHERE caracteristiques LIKE '%FEU D''ARTIFICE%';

UPDATE events
SET caracteristiques = replace(caracteristiques, 'COMPÉTITION', 'CONCOURS')
WHERE caracteristiques LIKE '%COMPÉTITION%';

UPDATE events
SET caracteristiques = replace(caracteristiques, 'ART', 'CULTUREL')
WHERE caracteristiques LIKE '%ART%';

UPDATE events
SET caracteristiques = replace(caracteristiques, 'VISITE', 'CULTUREL')
WHERE caracteristiques LIKE '%VISITE%';
