# UI Rules – Couleurs, tags, icônes, i18n

## 1) Catégories d'événements

- Chaque événement a **une seule catégorie**.
- La catégorie pilote :
  - la couleur de base,
  - le dégradé de la carte,
  - la couleur de texte (contraste auto),
  - l'icône catégorie (fallback si pas de tags).

| Catégorie (métier) | Couleur de base | Icône catégorie |
|---|---|---|
| Concert | `#4A90E2` | `♪` |
| Spectacle | `#4A90E2` | `▸` |
| Danse | `#2FBF71` | `⌁` |
| Feux d’artifice | `#F5B841` | `*` |
| Exposition | `#E85D5D` | `▦` |
| Autre | `#8E6AD8` | `•` |

Règles d'affichage :
- Le fond des cartes/blocs utilise un **dégradé** dérivé de la couleur de catégorie.
- La couleur du texte est calculée automatiquement pour rester lisible.

## 2) Tags

- Maximum **3 tags** par événement.
- Affichage prioritaire en bulles/icônes dans les cartes événement.
- Si aucun tag n'est présent, on affiche l'icône de catégorie.

| Tag | Icône |
|---|---|
| MUSIQUE | 🎵 |
| DANSE | 💃 |
| PLEIN AIR | ☀️ |
| RENCONTRE | 🤝 |
| FEU D’ARTIFICE | 🔥 |
| SPORT | ⚽ |
| MARCHÉ | 🏠 |

## 3) Images événement

- Priorité d'image :
  1. URL HTTP/HTTPS explicite,
  2. chemin asset explicite,
  3. image par défaut selon catégorie.
- Une galerie d'images par défaut est disponible dans l'édition d'un événement.

Mapping par défaut :
- Concert / Danse / Spectacle -> `img/categorie/SPECTACLE/spec1.png`
- Feux d’artifice -> `img/categorie/FESTIVAL/fest1.png`
- Exposition -> `img/categorie/EXPOSITION/expo1.png`
- Autre -> `img/categorie/AUTRE/autre1.png`

## 4) Règles i18n UI

- Langues supportées : **fr, en, es, it, de**.
- La langue sélectionnée doit :
  - mettre à jour les libellés UI,
  - mettre à jour `<html lang>`,
  - être persistée en localStorage (`lang`).
- Le calendrier et la page détail utilisent des dates localisées selon la langue active.

## 5) Règles spécifiques calendrier

- Vue semaine : 7 colonnes (lundi -> dimanche), créneau 06:00-23:00 + section nocturne.
- Boutons de navigation, labels semaine/jour, filtres et bouton nocturne sont traduits.
- Le bouton nocturne affiche le compteur: `Événements nocturnes (N)` via clé i18n.
- Superpositions d'événements :
  - 1 à 3 événements simultanés -> colonnes,
  - 4+ -> bloc fusionné `N événements`.