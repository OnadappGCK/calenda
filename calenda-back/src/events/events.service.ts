import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { Event } from './event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events.query';
import { UpdateEventDto } from './dto/update-event.dto';

/** User minimal porté par `req.user` (ou null si route publique). */
type RequestUser = { id: string; role: Role } | null;

@Injectable()
/**
 * Service Events.
 * Contient la logique de recherche/listing, featured, similar, et CRUD avec contrôle d'accès.
 */
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  /** Indique si le user peut voir les événements non-public (admin/organisateur). */
  private canSeeNonPublic(user: RequestUser) {
    return user?.role === Role.ADMIN || user?.role === Role.ORGANISATEUR;
  }

  /** Liste les événements selon filtres et contexte utilisateur (favoris, non-public). */
  async findAll(query: ListEventsQueryDto, user: RequestUser) {
    const qb = this.eventsRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organisateur', 'organisateur');

    if (!this.canSeeNonPublic(user)) {
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

    if (query.lieu) {
      qb.andWhere('LOWER(event.lieu) LIKE LOWER(:lieu)', { lieu: `%${query.lieu}%` });
    }

    if (query.q) {
      qb.andWhere(
        '(LOWER(event.titre) LIKE LOWER(:q) OR LOWER(event.description) LIKE LOWER(:q))',
        { q: `%${query.q}%` },
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

  /** Liste les événements "en avant" (homepage). */
  async findFeatured(user: RequestUser) {
    const qb = this.eventsRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organisateur', 'organisateur')
      .where('event.enAvant = :enAvant', { enAvant: true });

    if (!this.canSeeNonPublic(user)) {
      qb.andWhere('event.public = :isPublic', { isPublic: true });
    }

    qb.orderBy('event.dateDebut', 'ASC');
    return qb.getMany();
  }

  /** Récupère un événement par id (masque les non-public si non autorisé). */
  async findOne(id: string, user: RequestUser) {
    const event = await this.eventsRepo.findOne({
      where: { id },
      relations: { favoritedBy: false },
    });

    if (!event) {
      throw new NotFoundException('event_not_found');
    }

    if (!event.public && !this.canSeeNonPublic(user)) {
      throw new NotFoundException('event_not_found');
    }

    return event;
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

  /** Crée un événement: organisateur lié au user, visibilité auto selon rôle (admin peut publier), origin forcée à `MANUAL`. */
  async create(dto: CreateEventDto, userId: string, role: Role) {
    const organisateur = await this.usersRepo.findOne({ where: { id: userId } });
    if (!organisateur) {
      throw new NotFoundException('user_not_found');
    }

    const event = this.eventsRepo.create({
      titre: dto.titre,
      description: dto.description,
      categorie: dto.categorie,
      origin: EventOrigin.MANUAL,
      ville: dto.ville,
      lieu: dto.lieu,
      theme: dto.theme ?? null,
      caracteristiques: dto.caracteristiques ? dto.caracteristiques.slice(0, 3) : null,
      dateDebut: new Date(dto.dateDebut),
      dateFin: new Date(dto.dateFin),
      couleur: dto.couleur ?? null,
      enAvant: dto.enAvant ?? false,
      public: role === Role.ADMIN ? (dto.public ?? true) : false,
      organisateur,
    });

    return this.eventsRepo.save(event);
  }

  /** Met à jour un événement (owner ou admin). Certains champs (public) réservés à l'admin. */
  async update(id: string, dto: UpdateEventDto, userId: string, role: Role) {
    const event = await this.eventsRepo.findOne({ where: { id }, relations: { organisateur: true } });
    if (!event) {
      throw new NotFoundException('event_not_found');
    }

    const isOwner = event.organisateur?.id === userId;
    if (!(role === Role.ADMIN || isOwner)) {
      throw new ForbiddenException('forbidden');
    }

    if (dto.titre !== undefined) event.titre = dto.titre;
    if (dto.description !== undefined) event.description = dto.description;
    if (dto.categorie !== undefined) event.categorie = dto.categorie;
    if (dto.ville !== undefined) event.ville = dto.ville;
    if (dto.lieu !== undefined) event.lieu = dto.lieu;
    if (dto.theme !== undefined) event.theme = dto.theme;
    if (dto.caracteristiques !== undefined) {
      event.caracteristiques = dto.caracteristiques ? dto.caracteristiques.slice(0, 3) : null;
    }
    if (dto.dateDebut !== undefined) event.dateDebut = new Date(dto.dateDebut);
    if (dto.dateFin !== undefined) event.dateFin = new Date(dto.dateFin);
    if (dto.couleur !== undefined) event.couleur = dto.couleur;
    if (dto.enAvant !== undefined) event.enAvant = dto.enAvant;

    if (dto.public !== undefined) {
      if (role !== Role.ADMIN) {
        throw new ForbiddenException('forbidden');
      }
      event.public = dto.public;
    }

    return this.eventsRepo.save(event);
  }

  /** Supprime un événement (owner ou admin). */
  async remove(id: string, userId: string, role: Role) {
    const event = await this.eventsRepo.findOne({ where: { id }, relations: { organisateur: true } });
    if (!event) {
      throw new NotFoundException('event_not_found');
    }

    const isOwner = event.organisateur?.id === userId;
    if (!(role === Role.ADMIN || isOwner)) {
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
}
