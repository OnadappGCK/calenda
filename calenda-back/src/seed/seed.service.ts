import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { EventCategory } from '../common/enums/event-category.enum';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { EventTag } from '../common/enums/event-tag.enum';
import { Event } from '../events/event.entity';
import { News } from '../news/news.entity';
import { User } from '../users/user.entity';
import { Etablissement } from '../etablissements/etablissement.entity';
import { EtablissementType } from '../common/enums/etablissement-type.enum';

@Injectable()
/**
 * Service Seed.
 * Insère des données de démonstration en environnement de dev (comptes, events, news).
 */
export class SeedService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(News) private readonly newsRepo: Repository<News>,
    @InjectRepository(Etablissement) private readonly etablissementsRepo: Repository<Etablissement>,
  ) {}

  /** Seed des comptes de dev (admin/organisateur) selon `SEED_ADMIN` / `SEED_ORGANISATEUR`. */
  async seedDevUsers() {
    const nodeEnv = (this.configService.get<string>('NODE_ENV') ?? 'dev').toLowerCase();
    if (nodeEnv !== 'production') {
      const email = this.configService.get<string>('SEED_ADMIN_EMAIL') ?? 'admin@calendago.fr';
      const pseudo = this.configService.get<string>('SEED_ADMIN_PSEUDO') ?? 'admin';
      const existingAdmin = await this.usersRepo.findOne({ where: [{ email }, { pseudo }] });
      if (existingAdmin) {
        let changed = false;
        if (!existingAdmin.isAdmin) {
          existingAdmin.isAdmin = true;
          changed = true;
        }
        if (!existingAdmin.emailVerified) {
          existingAdmin.emailVerified = true;
          existingAdmin.emailVerificationToken = null;
          changed = true;
        }
        if (changed) {
          await this.usersRepo.save(existingAdmin);
        }
      }
    }

    const bootstrapAdminEmail = (this.configService.get<string>('BOOTSTRAP_ADMIN_EMAIL') ?? '').trim();
    if (bootstrapAdminEmail) {
      const u = await this.usersRepo.findOne({ where: { email: bootstrapAdminEmail } });
      if (u) {
        let changed = false;
        if (!u.isAdmin) {
          u.isAdmin = true;
          changed = true;
        }
        if (!u.emailVerified) {
          u.emailVerified = true;
          u.emailVerificationToken = null;
          changed = true;
        }
        if (changed) {
          await this.usersRepo.save(u);
        }
      }
    }

    const seedAdmin = (this.configService.get<string>('SEED_ADMIN') ?? 'false').toLowerCase();
    const seedOrganisateur = (
      this.configService.get<string>('SEED_ORGANISATEUR') ?? 'false'
    ).toLowerCase();

    if (seedAdmin === 'true') {
      const email = this.configService.get<string>('SEED_ADMIN_EMAIL') ?? 'admin@calendago.fr';
      const pseudo = this.configService.get<string>('SEED_ADMIN_PSEUDO') ?? 'admin';
      const password = this.configService.get<string>('SEED_ADMIN_PASSWORD') ?? 'Admin123!';

      const existing = await this.usersRepo.findOne({ where: { email } });
      if (!existing) {
        const passwordHash = await bcrypt.hash(password, 10);
        const admin = this.usersRepo.create({
          email,
          pseudo,
          ville: 'Dev',
          lieu: 'Dev',
          passwordHash,
          isAdmin: true,
          profileImage: 'img/profil/picture/cat-pp.png',
          emailVerified: true,
          emailVerificationToken: null,
        });
        await this.usersRepo.save(admin);
      } else {
        let changed = false;
        if (!existing.isAdmin) {
          existing.isAdmin = true;
          changed = true;
        }
        if (!existing.emailVerified) {
          existing.emailVerified = true;
          existing.emailVerificationToken = null;
          changed = true;
        }
        if ((pseudo ?? '').trim() && existing.pseudo !== pseudo) {
          existing.pseudo = pseudo;
          changed = true;
        }
        if (changed) {
          await this.usersRepo.save(existing);
        }
      }
    }

    if (seedOrganisateur === 'true') {
      const orgEmail =
        this.configService.get<string>('SEED_ORGANISATEUR_EMAIL') ?? 'orga@calendago.fr';
      const orgPseudo =
        this.configService.get<string>('SEED_ORGANISATEUR_PSEUDO') ?? 'organisateur';
      const orgPassword =
        this.configService.get<string>('SEED_ORGANISATEUR_PASSWORD') ?? 'Orga123!';

      const existingOrg = await this.usersRepo.findOne({ where: { email: orgEmail } });
      if (!existingOrg) {
        const orgPasswordHash = await bcrypt.hash(orgPassword, 10);
        const organisateur = this.usersRepo.create({
          email: orgEmail,
          pseudo: orgPseudo,
          ville: 'Dev',
          lieu: 'Dev',
          passwordHash: orgPasswordHash,
          isAdmin: false,
          profileImage: 'img/profil/picture/dog-pp.png',
          emailVerified: true,
          emailVerificationToken: null,
        });
        await this.usersRepo.save(organisateur);
      } else {
        let changed = false;
        if (existingOrg.isAdmin) {
          existingOrg.isAdmin = false;
          changed = true;
        }
        if (!existingOrg.emailVerified) {
          existingOrg.emailVerified = true;
          existingOrg.emailVerificationToken = null;
          changed = true;
        }
        if ((orgPseudo ?? '').trim() && existingOrg.pseudo !== orgPseudo) {
          existingOrg.pseudo = orgPseudo;
          changed = true;
        }
        if (changed) {
          await this.usersRepo.save(existingOrg);
        }
      }
    }
  }

  /** Seed des événements de dev (dont overlaps) selon `SEED_EVENTS`. */
  async seedDevEvents() {
    const enabled = (this.configService.get<string>('SEED_EVENTS') ?? 'false').toLowerCase();
    if (enabled !== 'true') {
      return;
    }

    const adminEmail = this.configService.get<string>('SEED_ADMIN_EMAIL') ?? 'admin@calendago.fr';
    const orgEmail =
      this.configService.get<string>('SEED_ORGANISATEUR_EMAIL') ?? 'orga@calendago.fr';

    const admin = await this.usersRepo.findOne({ where: { email: adminEmail } });
    const organisateur = await this.usersRepo.findOne({ where: { email: orgEmail } });
    if (!admin || !organisateur) {
      return;
    }

    const existing = await this.eventsRepo.find({ where: { ville: 'Dev' } });
    const existingByTitle = new Map(existing.map((e) => [e.titre, e] as const));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const at = (offsetDays: number, hh: number, mm: number) => {
      const d = new Date(today);
      d.setDate(today.getDate() + offsetDays);
      d.setHours(hh, mm, 0, 0);
      return d;
    };

    /** Liste des catégories utilisées pour générer des événements de démo. */
    const categories: EventCategory[] = [
      EventCategory.CULTURE_SPECTACLE,
      EventCategory.ARTS_EXPOS,
      EventCategory.SORTIE,
      EventCategory.ACTIVITES,
      EventCategory.VIE_LOCALE,
      EventCategory.SPECIAL,
    ];

    /** Origines utilisées pour simuler des imports externes (utile pour la page admin). */
    const origins: EventOrigin[] = [
      EventOrigin.MANUAL,
      EventOrigin.MARTIGUES_SITE,
      EventOrigin.SALSA_OLIVIER,
    ];

    /** Créneaux horaires variés, dont overlaps (pour tester l'affichage calendrier). */
    const slots: Array<{ start: [number, number]; end: [number, number]; crossesMidnight?: boolean }> = [
      { start: [7, 0], end: [9, 0] },
      { start: [10, 0], end: [12, 0] },
      { start: [11, 0], end: [13, 0] },
      { start: [14, 0], end: [16, 0] },
      { start: [18, 0], end: [20, 0] },
      { start: [19, 0], end: [21, 0] },
      { start: [1, 0], end: [5, 30] },
      { start: [22, 30], end: [0, 15], crossesMidnight: true },
    ];

    /**
     * Génère un titre stable (idempotent) pour éviter de créer des doublons entre redémarrages.
     */
    const makeTitle = (offsetDays: number, idx: number, categorie: EventCategory, origin: EventOrigin) => {
      return `DEMOAUTO - J+${offsetDays} - ${idx} - ${categorie} - ${origin}`;
    };

    const demo: Array<Partial<Event>> = [
      {
        titre: 'DEMO - Exposition (journée) - Centre ville',
        description:
          'Exposition accessible toute la journée. Cas utile: événement long dans la même journée.',
        categorie: EventCategory.ARTS_EXPOS,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Galerie du centre',
        theme: 'art',
        caracteristiques: [EventTag.PLEIN_AIR, EventTag.CULTUREL],
        dateDebut: at(0, 9, 0),
        dateFin: at(0, 18, 0),
        public: true,
        enAvant: true,
        couleur: null,
        organisateur,
      },
      {
        titre: 'DEMO - Concert du soir',
        description: 'Concert du soir. Sert de base pour tester les événements qui se chevauchent.',
        categorie: EventCategory.CULTURE_SPECTACLE,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Salle des fêtes',
        theme: 'musique',
        caracteristiques: [EventTag.MUSIQUE, EventTag.LIVE, EventTag.FESTIF],
        dateDebut: at(0, 18, 0),
        dateFin: at(0, 20, 0),
        public: true,
        enAvant: true,
        couleur: null,
        organisateur: admin,
      },
      {
        titre: 'DEMO - Danse (chevauchement)',
        description: 'Atelier danse. Chevauchement partiel avec le concert.',
        categorie: EventCategory.SORTIE,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Maison des associations',
        theme: 'danse',
        caracteristiques: [EventTag.DANSE, EventTag.FESTIF],
        dateDebut: at(0, 19, 0),
        dateFin: at(0, 21, 0),
        public: true,
        enAvant: false,
        couleur: null,
        organisateur,
      },
      {
        titre: 'DEMO - Spectacle (même créneau)',
        description: 'Spectacle exactement sur le même créneau que le concert (test collisions).',
        categorie: EventCategory.CULTURE_SPECTACLE,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Théâtre municipal',
        theme: 'scene',
        caracteristiques: [EventTag.CULTUREL, EventTag.TOUT_PUBLIC],
        dateDebut: at(0, 18, 0),
        dateFin: at(0, 20, 0),
        public: true,
        enAvant: false,
        couleur: null,
        organisateur: admin,
      },
      {
        titre: 'DEMO - Atelier photo (même créneau)',
        description: 'Atelier photo. Même créneau que le concert (objectif: 4+ overlaps).',
        categorie: EventCategory.ACTIVITES,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Médiathèque',
        theme: 'photo',
        caracteristiques: [EventTag.CULTUREL],
        dateDebut: at(0, 18, 0),
        dateFin: at(0, 20, 0),
        public: true,
        enAvant: false,
        couleur: null,
        organisateur,
      },
      {
        titre: 'DEMO - Rencontre auteurs (même créneau)',
        description: 'Rencontre avec auteurs. Même créneau que le concert (objectif: 4+ overlaps).',
        categorie: EventCategory.ACTIVITES,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Librairie',
        theme: 'livre',
        dateDebut: at(0, 18, 0),
        dateFin: at(0, 20, 0),
        public: true,
        enAvant: false,
        couleur: null,
        organisateur: admin,
      },
      {
        titre: 'DEMO - Feux d’artifice (passe minuit)',
        description: 'Événement qui démarre tard et termine après minuit.',
        categorie: EventCategory.SPECIAL,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Parc',
        theme: 'feu',
        caracteristiques: [EventTag.FEU_DARTIFICE, EventTag.PLEIN_AIR],
        dateDebut: at(0, 23, 0),
        dateFin: at(1, 0, 30),
        public: true,
        enAvant: false,
        couleur: null,
        organisateur: admin,
      },
      {
        titre: 'DEMO - Expo multi-jours (3 jours)',
        description: 'Événement multi-jours pour tester le filtrage de période.',
        categorie: EventCategory.ARTS_EXPOS,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Musée',
        theme: 'art',
        caracteristiques: [EventTag.CULTUREL, EventTag.CALME],
        dateDebut: at(2, 10, 0),
        dateFin: at(4, 17, 0),
        public: true,
        enAvant: false,
        couleur: null,
        organisateur,
      },
      {
        titre: 'DEMO - Événement en attente (organisateur)',
        description:
          'Cas admin: événement non public (en attente de validation). Doit apparaître dans Admin pending.',
        categorie: EventCategory.SPECIAL,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Lieu secret',
        theme: null,
        dateDebut: at(3, 14, 0),
        dateFin: at(3, 16, 0),
        public: false,
        enAvant: false,
        couleur: null,
        organisateur,
      },
    ];

    /** Génère un lot d'événements supplémentaires (semaine courante + jours à venir). */
    for (let offsetDays = 0; offsetDays < 14; offsetDays += 1) {
      for (let i = 0; i < slots.length; i += 1) {
        const categorie = categories[(offsetDays + i) % categories.length];
        const origin = origins[(offsetDays + i) % origins.length];
        const slot = slots[i];

        /** Organisateur alterné pour simuler des créations par différents rôles. */
        const owner = (offsetDays + i) % 2 === 0 ? admin : organisateur;

        /** Certaines entrées sont volontairement non publiques (tests admin pending). */
        const isPublic = (offsetDays + i) % 7 !== 0;

        const dateDebut = at(offsetDays, slot.start[0], slot.start[1]);
        const dateFin = slot.crossesMidnight
          ? at(offsetDays + 1, slot.end[0], slot.end[1])
          : at(offsetDays, slot.end[0], slot.end[1]);

        demo.push({
          titre: makeTitle(offsetDays, i, categorie, origin),
          description:
            "Événement généré automatiquement pour tests (catégories variées, overlaps, origines variées).",
          categorie,
          origin,
          ville: 'Dev',
          lieu: `Lieu démo ${((offsetDays + i) % 5) + 1}`,
          theme: null,
          caracteristiques: [
            Object.values(EventTag)[(offsetDays + i) % Object.values(EventTag).length] as EventTag,
            Object.values(EventTag)[(offsetDays + i + 2) % Object.values(EventTag).length] as EventTag,
            Object.values(EventTag)[(offsetDays + i + 4) % Object.values(EventTag).length] as EventTag,
          ],
          dateDebut,
          dateFin,
          public: isPublic,
          enAvant: offsetDays === 0 && i === 0,
          couleur: null,
          organisateur: owner,
        });
      }
    }

    const toSave: Event[] = [];
    for (const e of demo) {
      const title = (e.titre ?? '').trim();
      if (!title) continue;

      const existingEvent = existingByTitle.get(title);
      if (existingEvent) {
        existingEvent.description = (e.description ?? existingEvent.description) as string;
        existingEvent.categorie = (e.categorie ?? existingEvent.categorie) as EventCategory;
        existingEvent.origin = (e.origin ?? existingEvent.origin) as EventOrigin;
        existingEvent.ville = (e.ville ?? existingEvent.ville) as string;
        existingEvent.lieu = (e.lieu ?? existingEvent.lieu) as string;
        existingEvent.theme = (e.theme ?? existingEvent.theme) as string | null;
        existingEvent.caracteristiques = (e.caracteristiques ?? existingEvent.caracteristiques) as EventTag[] | null;
        existingEvent.dateDebut = (e.dateDebut ?? existingEvent.dateDebut) as Date;
        existingEvent.dateFin = (e.dateFin ?? existingEvent.dateFin) as Date;
        existingEvent.public = (e.public ?? existingEvent.public) as boolean;
        existingEvent.enAvant = (e.enAvant ?? existingEvent.enAvant) as boolean;
        existingEvent.couleur = (e.couleur ?? existingEvent.couleur) as string | null;
        existingEvent.organisateur = (e.organisateur ?? existingEvent.organisateur) as User;
        toSave.push(existingEvent);
      } else {
        toSave.push(this.eventsRepo.create({ ...e, titre: title }));
      }
    }

    if (toSave.length === 0) {
      return;
    }

    await this.eventsRepo.save(toSave);
  }

  /** Seed des news de dev selon `SEED_NEWS`. */
  async seedDevNews() {
    const enabled = (this.configService.get<string>('SEED_NEWS') ?? 'false').toLowerCase();
    if (enabled !== 'true') {
      return;
    }

    /** Liste les titres déjà présents (préfixe `DEMO -`) pour éviter les doublons. */
    const existing = await this.newsRepo
      .createQueryBuilder('news')
      .select(['news.titre'])
      .where('news.titre LIKE :prefix', { prefix: 'DEMO - %' })
      .getMany();
    const existingTitles = new Set(existing.map((n) => n.titre));

    const today = new Date();
    const isoDate = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const d0 = new Date(today);
    const d1 = new Date(today);
    d1.setDate(d1.getDate() - 2);
    const d2 = new Date(today);
    d2.setDate(d2.getDate() - 7);

    /** News datée à J+1 (future fonctionnalité d'import). */
    const d3 = new Date(today);
    d3.setDate(d3.getDate() + 1);

    /** News datée à J+3 (statut des améliorations UI). */
    const d4 = new Date(today);
    d4.setDate(d4.getDate() + 3);

    /** News datée à J+10 (rappel des données de démo). */
    const d5 = new Date(today);
    d5.setDate(d5.getDate() + 10);

    const demo: Array<Partial<News>> = [
      {
        titre: 'DEMO - Nouvelle version du calendrier',
        datePublication: isoDate(d0),
        texte:
          'Le calendrier affiche désormais une grille horaire (6h→23h), les événements nocturnes sont accessibles via un bouton dédié, et le menu latéral présente les détails.',
        image: null,
      },
      {
        titre: 'DEMO - Sélection de la semaine',
        datePublication: isoDate(d1),
        texte:
          'Navigue entre les semaines, filtre par ville/lieu/catégorie et retrouve rapidement les événements grâce aux chips de filtres actifs.',
        image: null,
      },
      {
        titre: 'DEMO - À l’affiche : événements mis en avant',
        datePublication: isoDate(d2),
        texte:
          'Découvre les événements mis en avant sur la page d’accueil et consulte les actualités pour suivre les nouveautés de la plateforme.',
        image: null,
      },
      {
        titre: 'DEMO - Import d’événements (bientôt)',
        datePublication: isoDate(d3),
        texte:
          'Une interface admin permettra d’importer des événements depuis des sites externes. Chaque événement conservera son origine pour audit.',
        image: null,
      },
      {
        titre: 'DEMO - Améliorations mobiles',
        datePublication: isoDate(d4),
        texte:
          'Améliorations en cours sur l’affichage mobile du calendrier (lisibilité, entêtes, navigation).',
        image: null,
      },
      {
        titre: 'DEMO - Semaine à venir : plein d’événements',
        datePublication: isoDate(d5),
        texte:
          'De nouveaux événements de démonstration ont été ajoutés sur la semaine et les jours à venir pour tester les chevauchements.',
        image: null,
      },
    ];

    const toInsert = demo.filter((n) => !!n.titre && !existingTitles.has(n.titre));
    if (toInsert.length === 0) {
      return;
    }

    await this.newsRepo.save(toInsert.map((n) => this.newsRepo.create(n)));
  }

  async seedDevEtablissements() {
    const count = await this.etablissementsRepo.count();
    if (count > 0) return;

    const demo: Partial<Etablissement>[] = [
      {
        nom: 'La Table de la Mer',
        type: EtablissementType.RESTAURANT,
        description: 'Restaurant de poissons et fruits de mer frais, face au port de Carry-le-Rouet. Terrasse ensoleillée avec vue sur la mer.',
        adresse: '3 Quai du Port, Carry-le-Rouet',
        ville: 'Carry-le-Rouet',
        tags: ['🐟 Poissons', '🦞 Fruits de mer', '🌅 Vue mer', '🍷 Cave à vins', '☀️ Terrasse'],
        imageUrl: null,
        latitude: 43.332,
        longitude: 5.152,
        featured: true,
        public: true,
      },
      {
        nom: 'Chez Mémé Michèle',
        type: EtablissementType.RESTAURANT,
        description: 'Cuisine provençale authentique dans un cadre chaleureux. Daube, tian, pieds paquets… tout est fait maison.',
        adresse: '12 Rue de la République, Martigues',
        ville: 'Martigues',
        tags: ['🥘 Provençal', '🏠 Fait maison', '🫒 Huile d\'olive', '👵 Cuisine du terroir'],
        imageUrl: null,
        latitude: 43.4,
        longitude: 5.05,
        public: true,
      },
      {
        nom: 'Le Bouchon d\'Istres',
        type: EtablissementType.RESTAURANT,
        description: 'Bistrot convivial proposant tapas, planches et spécialités du marché. Brunch le dimanche.',
        adresse: '7 Place Voltaire, Istres',
        ville: 'Istres',
        tags: ['🍢 Tapas', '🧀 Planches', '☕ Brunch', '🍺 Bières artisanales'],
        imageUrl: null,
        public: true,
      },
      {
        nom: 'Le Caveau du Frioul',
        type: EtablissementType.BAR,
        description: 'Bar à vins et cocktails dans une cave voûtée. Sélection de vins naturels, bières artisanales et spiritueux locaux.',
        adresse: '5 Rue des Pêcheurs, Sausset-les-Pins',
        ville: 'Sausset-les-Pins',
        tags: ['🍷 Vins naturels', '🍸 Cocktails', '🎵 Musique live', '🕯️ Ambiance'],
        imageUrl: null,
        latitude: 43.33,
        longitude: 5.11,
        featured: true,
        public: true,
      },
      {
        nom: 'Le Mojito Bleu',
        type: EtablissementType.BAR,
        description: 'Bar de plage avec terrasse face à la mer. Cocktails tropicaux, tapas et soirées DJ en été.',
        adresse: 'Plage de la Couronne, Martigues',
        ville: 'Martigues',
        tags: ['🍹 Cocktails', '🏖️ Plage', '🎧 DJ', '🌴 Tropical', '☀️ Terrasse'],
        imageUrl: null,
        public: true,
      },
      {
        nom: 'La Brasserie du Port',
        type: EtablissementType.BAR,
        description: 'Brasserie traditionnelle au cœur du port. Pression locale, planches charcuterie, matchs diffusés.',
        adresse: '1 Quai du Vieux Port, Carry-le-Rouet',
        ville: 'Carry-le-Rouet',
        tags: ['🍺 Pression', '⚽ Sport', '🧀 Planches', '🎲 Jeux de société'],
        imageUrl: null,
        public: true,
      },
      {
        nom: 'Cinéma L\'Étoile',
        type: EtablissementType.SORTIE,
        description: 'Cinéma indépendant proposant des films d\'art et essai, des avant-premières et des ciné-débats chaque mois.',
        adresse: '22 Avenue Général de Gaulle, Martigues',
        ville: 'Martigues',
        tags: ['🎬 Cinéma', '🎞️ Art & Essai', '🗣️ Ciné-débat', '🌍 Films du monde'],
        imageUrl: null,
        featured: true,
        public: true,
      },
      {
        nom: 'Escape Game Azur',
        type: EtablissementType.SORTIE,
        description: 'Escape game thématique avec 4 salles disponibles. Idéal pour les groupes, familles et team-building.',
        adresse: '14 Rue de la Jetée, Carry-le-Rouet',
        ville: 'Carry-le-Rouet',
        tags: ['🔐 Escape game', '👨‍👩‍👧 Famille', '🧩 Enigmes', '🏆 Team building'],
        imageUrl: null,
        public: true,
      },
      {
        nom: 'Club de Voile Mistral',
        type: EtablissementType.ACTIVITE,
        description: 'École de voile proposant cours débutants et perfectionnement, location de catamarans et sorties en mer.',
        adresse: 'Port de Plaisance, Sausset-les-Pins',
        ville: 'Sausset-les-Pins',
        tags: ['⛵ Voile', '🌊 Mer', '🏄 Nautique', '👶 Débutants', '📚 Formation'],
        imageUrl: null,
        latitude: 43.329,
        longitude: 5.1,
        featured: true,
        public: true,
      },
      {
        nom: 'Yoga sur la Plage',
        type: EtablissementType.ACTIVITE,
        description: 'Séances de yoga et méditation sur la plage tous les matins en saison. Tous niveaux bienvenus.',
        adresse: 'Plage des Tamaris, Carry-le-Rouet',
        ville: 'Carry-le-Rouet',
        tags: ['🧘 Yoga', '🌅 Plein air', '🧠 Méditation', '🌿 Bien-être', '☀️ Matinal'],
        imageUrl: null,
        public: true,
      },
      {
        nom: 'VTT Calanques Tour',
        type: EtablissementType.ACTIVITE,
        description: 'Randonnées VTT guidées dans les calanques et massifs environnants. Location de VTT électriques disponible.',
        adresse: 'Place du Marché, Carry-le-Rouet',
        ville: 'Carry-le-Rouet',
        tags: ['🚵 VTT', '🏔️ Randonnée', '⚡ Électrique', '🌿 Nature', '📸 Panorama'],
        imageUrl: null,
        public: true,
      },
    ];

    await this.etablissementsRepo.save(
      demo.map((d) => this.etablissementsRepo.create(d)),
    );
  }
}
