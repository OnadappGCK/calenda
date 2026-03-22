# Cahier des charges – Site de calendrier en ligne d’événements

## Données

### Événement
- id: UUID
- titre: string
- description: string
- catégorie: enum [DANSE, CONCERT, SPECTACLE, FEUX_D_ARTIFICE, EXPOSITION, AUTRE]
- caractéristiques: liste de tags (max 3) [MUSIQUE, DANSE, PLEIN AIR, RENCONTRE, FEU D’ARTIFICE, SPORT, MARCHÉ]
- ville: string
- lieu: string
- adresse: string | null
- latitude: number | null
- longitude: number | null
- organisateur: Utilisateur
- thème: string | null
- origin: enum [MANUAL, MARTIGUES_SITE, SALSA_OLIVIER]
- imageUrl: string | null
- tarif: string | null
- contact: string | null
- dateDébut: datetime (ISO)
- dateFin: datetime (ISO) | null
- public: boolean
- enAvant: boolean
- couleur: string | null
- createdAt: datetime
- updatedAt: datetime

### Utilisateur
- id: UUID
- pseudo: string
- email: string
- lieu: string
- ville: string
- profileImage: string | null
- passwordHash: string (crypté)
- rôle: enum [ADMIN, ORGANISATEUR, UTILISATEUR]
- emailVerified: boolean
- emailVerificationToken: string | null
- favoris: Liste d’événements

### News
- id: UUID
- titre: string
- datePublication: date
- texte: string
- image: optionnelle

---

## Fonctionnalités globales

### Navbar
- Logo à gauche menant à l'accueil
- Liens : Calendrier, Actualité, Contact
- Sélecteur de langue avec menu déroulant
  - Langues supportées: fr, en, es, it, de
  - Persistance de la langue dans le stockage local navigateur
  - Langue HTML (`<html lang>`) synchronisée automatiquement
- Toggle thème clair/sombre
- À droite :
  - Non connecté : bouton "Connexion"
  - Connecté :
    - icône cœur → favoris
    - accès profil (salutation + avatar)
    - bouton "Déconnexion"
    - ADMIN : cloche de notification (lien vers événements en attente + badge)

---

## Pages

### 1. Accueil
- Carrousel événements mis en avant (`enAvant == true`)
- Présentation du service + bouton vers le calendrier
- Actualités (aperçu de la page 1)
- Navigation du carrousel (précédent/suivant + pagination)
- Rotation automatique du carrousel côté navigateur

### 2. Connexion
- Formulaire email + mot de passe
- Lien vers inscription
- Captcha (optionnel selon configuration)
- Limite 5 tentatives (rate-limit côté backend)
- Message d’erreur explicite

### 3. Inscription
- Formulaire : pseudo, email, ville, lieu, mot de passe (validé + confirmation)
- Choix d’avatar (image de profil) parmi une liste
- Captcha (optionnel selon configuration)
- Email de confirmation (prévu, non bloquant actuellement)

### 4. Calendrier
#### Menu supérieur
- Affichage jour/semaine actuel
- Sélecteur de date
- Filtres : catégorie, lieu, ville, mot-clé, caractéristiques, favoris, dates (début/fin)
- Bulles de filtres actifs avec croix de suppression
- Boutons "Rechercher" et "Réinitialiser"
- Toggle semaine/journalier (mobile = journalier par défaut)
- ADMIN/ORGANISATEUR/UTILISATEUR connecté : bouton "Proposer un événement" (popup formulaire)
- Utilisateur non connecté: popup d'accès (connexion / création de compte)
- Libellés traduits (menus, navigation, période, filtres)

#### Vue calendrier
- Grille 7 colonnes (jours), lignes horaires de 6h à 23h
- Lignes pleines (heures), pointillées (demi-heures) darrière les blocs evenements.
- Heures et demi heures à gauche du calendrier et à la base des lignes des heures correspondantes.
- Blocs événements : couleur par catégorie, tags (icônes), cœur (favori)
- Groupement événements :
  - 1 à 3 → côte à côte
  - 4+ → bloc fusionné "n événements"
- Navigation swipe tactile (mobile/tablette)
- Bouton "événements nocturnes" par jour
- Clic bloc événement → apparition menu latéral :
  - Liste des événements du jour sous forme de carte avec résumé, bouton "voir plus" et bouton favoris (coché ou non si l'évenement est dans la liste de favori de l'utilisateur connecté)
  - Onglet "nuit" pour les événements 00:00–05:59
- Rechargement protégé contre les appels concurrents

#### Liste hebdomadaire (sous le calendrier)
- Liste "à venir" chargée progressivement (pagination) et regroupée par semaines
- Cartes regroupées par jour
- Ordre par heure puis titre
- Événements publics ou tous (ADMIN/ORGANISATEUR)
- Responsive mobile
- bouton favoris (coché ou non si l'évenement est dans la liste de favori de l'utilisateur connecté)
- Chargement progressif via observer de visibilité (infinite scroll)

### 5. Page Événement
- Affichage complet : titre, date, heure, lieu, description
- Boutons : retour, like
- Section "autres événements" (même jour ou catégorie)
- Lightbox image
- Mode édition (organisateur propriétaire ou admin)
- Édition de l'image avec prévisualisation + galerie d'images par défaut
- Édition de l'adresse avec suggestions et géocodage
- Carte OpenStreetMap + lien Google Maps
- Suppression avec confirmation
- Champs administrables (admin): visibilité publique, mise en avant, réassignation organisateur
- Interface traduite (libellés, messages, catégories, tags)

### 6. Favoris
- Icône cœur dans navbar
- Liste d’événements favoris (même structure que calendrier)
- Filtres identiques
- Tri automatique par date (à venir uniquement)

### 7. Profil utilisateur
- Informations personnelles
- Photo (choix parmi images proposées)
- Possibilité de modifier pseudo, ville, lieu, mot de passe

### 8. Événements en attente (ADMIN)
- Accessible via icône cloche (badge nombre)
- Liste filtrable (filtre/sort par origine)
- Cartes événements :
  - Titre, lieu, date, résumé, organisateur
  - Chevron → description complète + détails
  - Boutons : valider (popup confirmation), supprimer (popup)
  - Sélection multiple (actions en lot)

### 9. Merge événements (ADMIN)
- Bouton sur la page événements en attente
- Popup avec liste des sources configurées (stub UI)
- Importation / dédoublonnage / récupération externe (prévu, non implémenté côté backend)

### 10. Contact
- Formulaire simple (email, motif, message)
- Confirmation d’envoi (actuellement locale, sans envoi backend)

---

## Rôles

### UTILISATEUR
- Voir événements
- Ajouter en favoris
- Voir page favoris

### ORGANISATEUR
- Droits UTILISATEUR +
- Proposer événements (création)
- Modifier / supprimer ses événements
- Voir les événements non publics

### ADMIN
- Droits ORGANISATEUR +
- Voir tous les événements en attente
- Valider / Supprimer événements en attente
- Lancer des merges (prévu)

---

## Aspects techniques

- Angular (frontend) / NestJS (backend)
- Authentification JWT
- API REST
- TypeORM (entités `events`, `users`, `news`)
- Cible DB configurable (SQLite/Postgres)
- Script de migration de données SQLite vers Postgres
- Rate limiting sur la connexion (5/min)
- Captcha en mode `dev` (no-op) ou blocage si non configuré
- Responsive full mobile
- Pas de mode offline/PWA
- Système i18n interne (traductions applicatives)
- Locales de dates enregistrées pour fr/en/es/it/de