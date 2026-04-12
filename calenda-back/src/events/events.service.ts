import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { User } from '../users/user.entity';
import { Event } from './event.entity';
import { Highlight } from './highlight.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events.query';
import { UpdateEventDto } from './dto/update-event.dto';

/** User minimal porté par `req.user` (ou null si route publique). */
type RequestUser = { id: string; isAdmin: boolean; emailVerified: boolean } | null;

@Injectable()
/**
 * Service Events.
 * Contient la logique de recherche/listing, featured, similar, et CRUD avec contrôle d'accès.
 */
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Highlight) private readonly highlightsRepo: Repository<Highlight>,
  ) {}

  private defaultContactForUser(u: User) {
    const phone = (u.numero ?? '').trim();
    return `email : ${u.email} Téléphone : ${phone || 'non mentionné'}`;
  }

  /** Indique si le user peut voir les événements non-public (admin/organisateur). */
  private canSeeNonPublic(user: RequestUser) {
    return !!user?.isAdmin;
  }

  private dailyProposalLimit() {
    return 3;
  }

  /** Liste des villes distinctes présentes dans les événements (pour UI calendrier). */
  async listCities(user: RequestUser) {
    const qb = this.eventsRepo
      .createQueryBuilder('event')
      .select('event.ville', 'ville')
      .distinct(true)
      .where('event.ville IS NOT NULL')
      .andWhere("TRIM(event.ville) != ''");

    if (!this.canSeeNonPublic(user)) {
      qb.andWhere('event.public = :isPublic', { isPublic: true });
    }

    qb.orderBy('LOWER(event.ville)', 'ASC');

    const rows = await qb.getRawMany<{ ville: string }>();
    return rows.map((r) => r.ville).filter(Boolean);
  }

  /** Liste les événements selon filtres et contexte utilisateur (favoris, non-public). */
  async findAll(query: ListEventsQueryDto, user: RequestUser) {
    const qb = this.eventsRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organisateur', 'organisateur');

    const includePending = !!(query.includePending && this.canSeeNonPublic(user));

    if (!includePending) {
      qb.andWhere('event.public = :isPublic', { isPublic: true });
    }

    if (query.from) {
      qb.andWhere('event.dateDebut >= :from', { from: query.from });
    }

    if (query.to) {
      qb.andWhere('event.dateDebut <= :to', { to: query.to });
    }

    if (query.categorie) {
      qb.andWhere('event.categorie = :categorie', { categorie: query.categorie });
    }

    if (query.ville) {
      qb.andWhere('LOWER(event.ville) = LOWER(:ville)', { ville: query.ville });
    }

    const addr = (query.adresse ?? query.lieu ?? '').trim();
    if (addr) {
      qb.andWhere(
        new Brackets((sub) => {
          sub.orWhere('LOWER(event.adresse) LIKE LOWER(:addr)', { addr: `%${addr}%` });
          sub.orWhere('LOWER(event.lieu) LIKE LOWER(:addr)', { addr: `%${addr}%` });
          sub.orWhere('LOWER(event.ville) = LOWER(:addrExact)', { addrExact: addr });
        }),
      );
    }

    if (query.q) {
      qb.andWhere(
        '(LOWER(event.titre) LIKE LOWER(:q) OR LOWER(event.description) LIKE LOWER(:q))',
        { q: `%${query.q}%` },
      );
    }

    if (query.caracteristiques?.length) {
      qb.andWhere(
        new Brackets((sub) => {
          query.caracteristiques!.forEach((t, idx) => {
            sub.orWhere(`event.caracteristiques LIKE :tag${idx}`, {
              [`tag${idx}`]: `%"${t}"%`,
            });
          });
        }),
      );
    }

    if (query.favoris) {
      if (!user?.id) {
        return [];
      }

      qb.innerJoin('event.favoritedBy', 'favUser', 'favUser.id = :userId', {
        userId: user.id,
      });
    }

    qb.orderBy('event.dateDebut', 'ASC').addOrderBy('event.titre', 'ASC').addOrderBy('event.id', 'ASC');

    /** Applique la pagination (si fournie) pour limiter le volume renvoyé. */
    if (query.offset !== undefined) {
      qb.skip(query.offset);
    }
    if (query.limit !== undefined) {
      qb.take(query.limit);
    }

    return qb.getMany();
  }

  /** Liste les événements mis en avant via une Highlight active (homepage). */
  async findFeatured(user: RequestUser) {
    const now = new Date();

    const active = await this.highlightsRepo
      .createQueryBuilder('h')
      .select('h.eventId', 'eventId')
      .addSelect('MAX(h.priority)', 'maxPriority')
      .where('h.startAt <= :now', { now })
      .andWhere('h.endAt >= :now', { now })
      .groupBy('h.eventId')
      .getRawMany<{ eventId: string; maxPriority: string }>();

    if (active.length === 0) return [];

    active.sort((a, b) => Number(b.maxPriority) - Number(a.maxPriority));
    const ids = active.map((a) => a.eventId);

    const qb = this.eventsRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organisateur', 'organisateur')
      .where('event.id IN (:...ids)', { ids });

    if (!this.canSeeNonPublic(user)) {
      qb.andWhere('event.public = :isPublic', { isPublic: true });
    }

    const events = await qb.getMany();
    const eventMap = new Map(events.map((e) => [e.id, e]));
    return ids.map((id) => eventMap.get(id)).filter((e): e is Event => !!e);
  }

  /** Récupère un événement par id (masque les non-public si non autorisé). */
  async findOne(id: string, user: RequestUser) {
    const event = await this.eventsRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organisateur', 'organisateur')
      .where('event.id = :id', { id })
      .getOne();

    if (!event) {
      throw new NotFoundException('event_not_found');
    }

    const isOwner = !!(user?.id && event.organisateur?.id && user.id === event.organisateur.id);

    if (!event.public && !this.canSeeNonPublic(user) && !isOwner) {
      throw new NotFoundException('event_not_found');
    }

    const highlights = await this.highlightsRepo.find({
      where: { eventId: id },
      order: { priority: 'DESC', startAt: 'ASC' },
    });

    return Object.assign(event, { highlights });
  }

  /** Retourne une liste d'événements similaires (même catégorie ou même date). */
  async findSimilar(id: string, user: RequestUser) {
    const current = await this.findOne(id, user);

    const qb = this.eventsRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organisateur', 'organisateur')
      .where('event.id != :id', { id })
      .andWhere('(event.categorie = :categorie OR date(event.dateDebut) = date(:dateDebut))', {
        categorie: current.categorie,
        dateDebut: current.dateDebut.toISOString(),
      });

    if (!this.canSeeNonPublic(user)) {
      qb.andWhere('event.public = :isPublic', { isPublic: true });
    }

    qb.orderBy('event.dateDebut', 'ASC').limit(10);
    return qb.getMany();
  }

  /** Crée un événement: organisateur lié au user, visibilité auto selon admin, origin forcée à `MANUAL`. */
  async create(dto: CreateEventDto, userId: string, user: { isAdmin: boolean; emailVerified: boolean }) {
    const honeypot = (dto.honeypot ?? '').trim();
    if (honeypot) {
      throw new BadRequestException('bot_detected');
    }

    const organisateur = await this.usersRepo.findOne({ where: { id: userId } });
    if (!organisateur) {
      throw new NotFoundException('user_not_found');
    }

    const isAdmin = !!(user?.isAdmin || organisateur.isAdmin);

    const limit = this.dailyProposalLimit();
    if (!isAdmin && limit > 0) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const count = await this.eventsRepo
        .createQueryBuilder('event')
        .where('event.organisateurId = :userId', { userId })
        .andWhere('event.origin = :origin', { origin: EventOrigin.MANUAL })
        .andWhere('event.createdAt >= :start AND event.createdAt < :end', { start, end })
        .getCount();

      if (count >= limit) {
        throw new ForbiddenException('daily_limit_reached');
      }
    }

    if (dto.enAvant !== undefined && !isAdmin) {
      throw new ForbiddenException('forbidden');
    }

    const adresse = (dto.adresse ?? '').trim() || (dto.lieu ?? '').trim();

    const rawEnd = (dto.dateFin ?? '').trim();

    const contact =
      dto.contact === undefined
        ? this.defaultContactForUser(organisateur)
        : ((dto.contact ?? '').trim() ? (dto.contact ?? '').trim() : null);

    const event = this.eventsRepo.create({
      titre: dto.titre,
      description: dto.description,
      categorie: dto.categorie,
      origin: EventOrigin.MANUAL,
      ville: dto.ville,
      lieu: adresse,
      adresse: adresse || null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      theme: dto.theme ?? null,
      caracteristiques: dto.caracteristiques ? dto.caracteristiques.slice(0, 3) : null,
      imageUrl: dto.imageUrl ?? null,
      tarif: dto.tarif ?? 'Non renseigné',
      contact,
      dateDebut: new Date(dto.dateDebut),
      dateFin: rawEnd ? new Date(rawEnd) : null,
      couleur: dto.couleur ?? null,
      enAvant: isAdmin ? (dto.enAvant ?? false) : false,
      public: isAdmin ? (dto.public ?? true) : false,
      organisateur,
    });

    return this.eventsRepo.save(event);
  }

  /** Met à jour un événement (owner ou admin). Certains champs (public) réservés à l'admin. */
  async update(id: string, dto: UpdateEventDto, userId: string, user: { isAdmin: boolean }) {
    const event = await this.eventsRepo.findOne({ where: { id }, relations: { organisateur: true } });
    if (!event) {
      throw new NotFoundException('event_not_found');
    }

    const isOwner = event.organisateur?.id === userId;
    if (!(user.isAdmin || isOwner)) {
      throw new ForbiddenException('forbidden');
    }

    if (dto.titre !== undefined) event.titre = dto.titre;
    if (dto.description !== undefined) event.description = dto.description;
    if (dto.categorie !== undefined) event.categorie = dto.categorie;
    if (dto.ville !== undefined) event.ville = dto.ville;
    if (dto.adresse !== undefined) {
      const adresse = (dto.adresse ?? '').trim();
      event.adresse = adresse || null;
      if (adresse) {
        event.lieu = adresse;
      }
    } else if (dto.lieu !== undefined) {
      const adresse = (dto.lieu ?? '').trim();
      event.adresse = adresse || null;
      event.lieu = adresse;
    }

    if (dto.latitude !== undefined) {
      event.latitude = dto.latitude;
    }
    if (dto.longitude !== undefined) {
      event.longitude = dto.longitude;
    }
    if (dto.theme !== undefined) event.theme = dto.theme;
    if (dto.caracteristiques !== undefined) {
      event.caracteristiques = dto.caracteristiques ? dto.caracteristiques.slice(0, 3) : null;
    }
    if (dto.imageUrl !== undefined) {
      event.imageUrl = dto.imageUrl;
    }
    if (dto.tarif !== undefined) {
      event.tarif = dto.tarif;
    }

    if (dto.contact !== undefined) {
      const raw = (dto.contact ?? '').trim();
      event.contact = raw ? raw : null;
    }

    if (dto.organisateurId !== undefined) {
      if (!user.isAdmin) {
        throw new ForbiddenException('forbidden');
      }
      const newOrg = await this.usersRepo.findOne({ where: { id: dto.organisateurId } });
      if (!newOrg) {
        throw new NotFoundException('user_not_found');
      }
      event.organisateur = newOrg;
    }

    if (dto.dateDebut !== undefined) event.dateDebut = new Date(dto.dateDebut);
    if (dto.dateFin !== undefined) {
      const raw = (dto.dateFin ?? '').trim();
      event.dateFin = raw ? new Date(raw) : null;
    }
    if (dto.couleur !== undefined) event.couleur = dto.couleur;

    if (dto.enAvant !== undefined) {
      if (!user.isAdmin) {
        throw new ForbiddenException('forbidden');
      }
      event.enAvant = dto.enAvant;
    }

    if (dto.public !== undefined) {
      if (!user.isAdmin) {
        throw new ForbiddenException('forbidden');
      }
      event.public = dto.public;
    }

    return this.eventsRepo.save(event);
  }

  /** Supprime un événement (owner ou admin). */
  async remove(id: string, userId: string, user: { isAdmin: boolean }) {
    const event = await this.eventsRepo.findOne({ where: { id }, relations: { organisateur: true } });
    if (!event) {
      throw new NotFoundException('event_not_found');
    }

    const isOwner = event.organisateur?.id === userId;
    if (!(user.isAdmin || isOwner)) {
      throw new ForbiddenException('forbidden');
    }

    await this.eventsRepo.remove(event);
    return { ok: true };
  }

  /** Publie un événement (validation admin). */
  async validateEvent(id: string) {
    const event = await this.eventsRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('event_not_found');
    }

    event.public = true;
    return this.eventsRepo.save(event);
  }

  async validateEvents(ids: string[]) {
    const clean = (ids ?? []).map((x) => (x ?? '').trim()).filter(Boolean);
    if (clean.length === 0) {
      throw new BadRequestException('invalid_payload');
    }

    const res = await this.eventsRepo.update({ id: In(clean), public: false }, { public: true });
    return { updated: res.affected ?? 0 };
  }
}
