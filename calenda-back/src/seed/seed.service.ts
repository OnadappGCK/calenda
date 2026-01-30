import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { EventCategory } from '../common/enums/event-category.enum';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { Role } from '../common/enums/role.enum';
import { Event } from '../events/event.entity';
import { News } from '../news/news.entity';
import { User } from '../users/user.entity';

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
  ) {}

  /** Seed des comptes de dev (admin/organisateur) selon `SEED_ADMIN` / `SEED_ORGANISATEUR`. */
  async seedDevUsers() {
    const seedAdmin = (this.configService.get<string>('SEED_ADMIN') ?? 'false').toLowerCase();
    const seedOrganisateur = (
      this.configService.get<string>('SEED_ORGANISATEUR') ?? 'false'
    ).toLowerCase();

    if (seedAdmin === 'true') {
      const email = this.configService.get<string>('SEED_ADMIN_EMAIL') ?? 'admin@calenda.local';
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
          role: Role.ADMIN,
          emailVerified: true,
          emailVerificationToken: null,
        });
        await this.usersRepo.save(admin);
      }
    }

    if (seedOrganisateur === 'true') {
      const orgEmail =
        this.configService.get<string>('SEED_ORGANISATEUR_EMAIL') ?? 'orga@calenda.local';
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
          role: Role.ORGANISATEUR,
          emailVerified: true,
          emailVerificationToken: null,
        });
        await this.usersRepo.save(organisateur);
      }
    }
  }

  /** Seed des événements de dev (dont overlaps) selon `SEED_EVENTS`. */
  async seedDevEvents() {
    const enabled = (this.configService.get<string>('SEED_EVENTS') ?? 'false').toLowerCase();
    if (enabled !== 'true') {
      return;
    }

    const adminEmail = this.configService.get<string>('SEED_ADMIN_EMAIL') ?? 'admin@calenda.local';
    const orgEmail =
      this.configService.get<string>('SEED_ORGANISATEUR_EMAIL') ?? 'orga@calenda.local';

    const admin = await this.usersRepo.findOne({ where: { email: adminEmail } });
    const organisateur = await this.usersRepo.findOne({ where: { email: orgEmail } });
    if (!admin || !organisateur) {
      return;
    }

    const existing = await this.eventsRepo.find({ where: { ville: 'Dev' } });
    const existingTitles = new Set(existing.map((e) => e.titre));

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
      EventCategory.DANSE,
      EventCategory.CONCERT,
      EventCategory.SPECTACLE,
      EventCategory.FEUX_D_ARTIFICE,
      EventCategory.EXPOSITION,
      EventCategory.AUTRE,
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
        categorie: EventCategory.EXPOSITION,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Galerie du centre',
        theme: 'art',
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
        categorie: EventCategory.CONCERT,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Salle des fêtes',
        theme: 'musique',
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
        categorie: EventCategory.DANSE,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Maison des associations',
        theme: 'danse',
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
        categorie: EventCategory.SPECTACLE,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Théâtre municipal',
        theme: 'scene',
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
        categorie: EventCategory.AUTRE,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Médiathèque',
        theme: 'photo',
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
        categorie: EventCategory.AUTRE,
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
        categorie: EventCategory.FEUX_D_ARTIFICE,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Parc',
        theme: 'feu',
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
        categorie: EventCategory.EXPOSITION,
        origin: EventOrigin.MANUAL,
        ville: 'Dev',
        lieu: 'Musée',
        theme: 'art',
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
        categorie: EventCategory.AUTRE,
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
          dateDebut,
          dateFin,
          public: isPublic,
          enAvant: offsetDays === 0 && i === 0,
          couleur: null,
          organisateur: owner,
        });
      }
    }

    const toInsert = demo.filter((e) => !!e.titre && !existingTitles.has(e.titre));
    if (toInsert.length === 0) {
      return;
    }

    const entities = toInsert.map((e) => this.eventsRepo.create(e));
    await this.eventsRepo.save(entities);
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
}
