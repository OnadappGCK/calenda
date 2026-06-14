# UI Rules – Couleurs, tags, icônes, i18n

## 1) Catégories d'événements

- Chaque événement a **une seule catégorie**.
- La catégorie pilote :
  - la couleur de base,
  - le dégradé de la carte,
  - la couleur de texte (contraste auto),
  - l'icône catégorie (fallback si pas de tags).

| Catégorie (métier) | Valeur enum | Couleur de base | Icône |
|---|---|---|---|
| Culture & spectacle | `CULTURE_SPECTACLE` | `#5C6BC0` | 🎭 |
| Arts & expos | `ARTS_EXPOS` | `#E85D5D` | 🎨 |
| Sortie | `SORTIE` | `#2FBF71` | 💃 |
| Activités | `ACTIVITES` | `#FF7043` | 🏃 |
| Vie locale | `VIE_LOCALE` | `#AB47BC` | 🛍️ |
| Spécial | `SPECIAL` | `#F5B841` | 🎆 |

**Mots-clés de catégorisation automatique (merge services) :**

| Catégorie | Mots-clés déclencheurs |
|---|---|
| Culture & spectacle | concert, musique, jazz, rock, théâtre, spectacle, comédie, humour, cinéma |
| Arts & expos | exposition, galerie, vernissage, musée, peinture, sculpture, photo |
| Sortie | danse, salsa, tango, bachata, festival, soirée |
| Activités | sport, atelier, bien-être, yoga, pilates, randonnée |
| Vie locale | marché, brocante, salon |
| Spécial | feux d'artifice, pyro *(fallback par défaut)* |

Règles d'affichage :
- Le fond des cartes/blocs utilise un **dégradé** dérivé de la couleur de catégorie.
- La couleur du texte est calculée automatiquement pour rester lisible.

## 2) Tags

- Maximum **3 tags** par événement.
- Affichage prioritaire en bulles/icônes dans les cartes événement.
- Si aucun tag n'est présent, on affiche l'icône de catégorie.

| Tag | Icône | Tag | Icône |
|---|---|---|---|
| `CONCERT` | 🎤 | `MUSIQUE` | 🎵 |
| `SPORT` | ⚽ | `FESTIF` | 🎉 |
| `DANSE` | 💃 | `CALME` | 🌿 |
| `CONCOURS` | 🏆 | `CULTUREL` | 🎭 |
| `FEU_DARTIFICE` | 🎆 | `RENCONTRE` | 🤝 |
| `ENFANT` | 🧒 | `NETWORKING` | 💼 |
| `FAMILLE` | 👨‍👩‍👧 | `JOUR` | 🌤️ |
| `ADULTE` | 🔞 | `NUIT` | 🌙 |
| `TOUT_PUBLIC` | � | `FOOD` | 🍽️ |
| `PLEIN_AIR` | ☀️ | `BOISSON` | 🥂 |
| `INTERIEUR` | 🏠 | `DJ` | 🎧 |
| — | — | `LIVE` | 🎸 |

## 3) Images événement

- Priorité d'image :
  1. URL HTTP/HTTPS explicite,
  2. chemin asset explicite,
  3. image par défaut selon catégorie.
- Une galerie d'images par défaut est disponible dans l'édition d'un événement.

Mapping par défaut :
- Culture & spectacle -> `img/categorie/CULTURE_SPECTACLE/spec1.png`
- Sortie -> `img/categorie/SORTIE/social1.png`
- Spécial -> `img/categorie/FESTIVAL/fest1.png`
- Arts & expos -> `img/categorie/EXPOSITION/expo1.png`
- Activités / Vie locale -> `img/categorie/AUTRE/autre1.png`

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