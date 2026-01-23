import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { EventCategory } from '../common/enums/event-category.enum';
import { Role } from '../common/enums/role.enum';
import { Event } from '../events/event.entity';
import { News } from '../news/news.entity';
import { User } from '../users/user.entity';

@Injectable()
export class SeedService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(News) private readonly newsRepo: Repository<News>,
  ) {}

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

    const desiredTitles = new Set([
      'DEMO - Exposition (journée) - Centre ville',
      'DEMO - Concert du soir',
      'DEMO - Danse (chevauchement)',
      'DEMO - Spectacle (même créneau)',
      'DEMO - Atelier photo (même créneau)',
      'DEMO - Rencontre auteurs (même créneau)',
      'DEMO - Feux d’artifice (passe minuit)',
      'DEMO - Expo multi-jours (3 jours)',
      'DEMO - Événement en attente (organisateur)',
    ]);

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

    const demo: Array<Partial<Event>> = [
      {
        titre: 'DEMO - Exposition (journée) - Centre ville',
        description:
          'Exposition accessible toute la journée. Cas utile: événement long dans la même journée.',
        categorie: EventCategory.EXPOSITION,
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

    const toInsert = demo.filter((e) => !!e.titre && desiredTitles.has(e.titre) && !existingTitles.has(e.titre));
    if (toInsert.length === 0) {
      return;
    }

    const entities = toInsert.map((e) => this.eventsRepo.create(e));
    await this.eventsRepo.save(entities);
  }

  async seedDevNews() {
    const enabled = (this.configService.get<string>('SEED_NEWS') ?? 'false').toLowerCase();
    if (enabled !== 'true') {
      return;
    }

    const existing = await this.newsRepo.findOne({ where: { titre: 'DEMO - Nouvelle version du calendrier' } });
    if (existing) {
      return;
    }

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
    ];

    await this.newsRepo.save(demo.map((n) => this.newsRepo.create(n)));
  }
}
