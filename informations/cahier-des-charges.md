# Cahier des charges – Site de calendrier en ligne d’événements

## Données

### Événement
- id: UUID
- titre: string
- description: string
- catégorie: enum [SPECTACLE, EXPOSITION, REUNION, FESTIVAL, AUTRE]
- tags: liste de tags (max 3) [MUSIQUE, DANSE, PLEIN AIR, RENCONTRE, FEU D’ARTIFICE, SPORT, MARCHÉ, COURSE]
- ville: string
- lieu: string
- organisateur: Utilisateur
- thème: sélection parmi une banque d’images (2 images/thème : grande + simplifiée)
- dateDébut: datetime
- dateFin: datetime
- public: boolean

### Utilisateur
- id: UUID
- pseudo: string
- email: string
- lieu: string
- ville: string
- motDePasse: string (crypté)
- rôle: enum [ADMIN, ORGANISATEUR, UTILISATEUR]
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
- Liens : Calendrier, Contact
- À droite :
  - Non connecté : bouton "Connexion"
  - Connecté :
    - pseudo, rôle
    - bouton "Déconnexion"
    - icône cœur → favoris
    - ADMIN : cloche de notification (nombre d’événements à valider)

---

## Pages

### 1. Accueil
- Carrousel événements mis en avant (`enAvant == true`)
- Présentation du service + bouton vers le calendrier
- Actualités (paginées, triées par date)
- Formulaire de contact (email, motif, pièce jointe)

### 2. Connexion
- Formulaire email + mot de passe
- Lien vers inscription
- Captcha + limite 5 tentatives
- Message d’erreur explicite

### 3. Inscription
- Formulaire : pseudo, email, ville, lieu, mot de passe (validé + confirmation)
- Captcha
- Email de confirmation

### 4. Calendrier
#### Menu supérieur
- Affichage jour/semaine actuel
- Sélecteur de date
- Filtres : jour, heure, catégorie, lieu, ville, mot-clé, favoris
- Bulles de filtres actifs avec croix de suppression
- Boutons "Rechercher" et "Réinitialiser"
- Toggle semaine/journalier (mobile = journalier par défaut)
- ADMIN/ORGANISATEUR : bouton "Proposer un événement" (popup formulaire)

#### Vue calendrier
- Grille 7 colonnes (jours), lignes horaires de 6h à 5h
- Lignes pleines (heures), pointillées (demi-heures) darrière les blocs evenements.
- Heures et demi heures à gauche du calendrier et à la base des lignes des heures correspondantes.
- Blocs événements : couleur par catégorie, tags (icônes), cœur (favori)
- Groupement événements :
  - 1 à 3 → côte à côte
  - 4+ → bloc fusionné "n événements"
- Clic bloc événement → apparition menu latéral :
  - Liste des événements du jour sous forme de carte avec résumé, image, bouton "voir plus" et bouton favoris (coché ou non si l'évenement est dans la liste de favori de l'utilisateur connecté)

#### Liste hebdomadaire (sous le calendrier)
- liste les evenements de la journée en cours jusqu'à la fin de la semaine selectionnée
- Cartes regroupées par jour (séparateur de date, date du jour suivis d'une ligne horizontale pour séparer clairement)
- Ordre par heure puis titre
- Événements publics ou tous (ADMIN/ORGANISATEUR)
- Responsive mobile
- bouton favoris (coché ou non si l'évenement est dans la liste de favori de l'utilisateur connecté)

### 5. Page Événement
- Affichage complet : titre, date, heure, lieu, description, image fond
- Boutons : retour, partager, like
- Section "autres événements" (même jour ou catégorie)

### 6. Favoris
- Icône cœur dans navbar
- Liste d’événements favoris (même structure que calendrier)
- Filtres identiques
- Tri automatique par date (à venir uniquement)

### 7. Profil utilisateur
- Informations personnelles
- Photo (choix parmi images proposées)
- Possibilité de modifier pseudo, adresse, mot de passe

### 8. Événements en attente (ADMIN)
- Accessible via icône cloche (badge nombre)
- Liste filtrable (mêmes filtres que calendrier)
- Cartes événements :
  - Titre, lieu, date, résumé, organisateur
  - Chevron → description complète + détails
  - Boutons : valider (popup confirmation), supprimer (popup)
  - Bouton modifier pour ajuster les infos (titre, tags, catégorie, etc.)

### 9. Merge événements (ADMIN)
- Bouton sur la page événements en attente
- Popup avec liste des sources configurées
- Sélection source → estimation événements récupérables
- Importation avec vérification : exclure doublons (date + lieu + organisateur)
- Résultat : événements ajoutés avec `public: false`

---

## Rôles

### UTILISATEUR
- Voir événements
- Ajouter en favoris
- Voir page favoris

### ORGANISATEUR
- Droits UTILISATEUR +
- Proposer événements
- Voir et modifier ses événements en attente

### ADMIN
- Droits ORGANISATEUR +
- Voir tous les événements en attente
- Valider / Supprimer / Modifier événements en attente
- Gérer utilisateurs
- Lancer des merges

---

## Aspects techniques

- Angular (frontend) / NestJS (backend)
- Authentification JWT
- API REST ou GraphQL
- Caching optimisé
- Responsive full mobile
- Pas de mode offline/PWA