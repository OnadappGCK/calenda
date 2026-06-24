import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { Highlight } from './highlight.entity';
import { CreateHighlightDto } from './dto/create-highlight.dto';
import { UpdateHighlightDto } from './dto/update-highlight.dto';

@Injectable()
/** Service de gestion des mises en avant (Highlight). Réservé aux admins. */
export class HighlightsService {
  constructor(
    @InjectRepository(Highlight) private readonly highlightsRepo: Repository<Highlight>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
  ) {}

  /** Liste toutes les mises en avant d'un événement. */
  async listForEvent(eventId: string) {
    const event = await this.eventsRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('event_not_found');
    return this.highlightsRepo.find({
      where: { eventId },
      order: { priority: 'DESC', startAt: 'ASC' },
    });
  }

  /** Crée une mise en avant pour un événement (admin uniquement). */
  async create(eventId: string, dto: CreateHighlightDto, user: { isAdmin: boolean }) {
    if (!user.isAdmin) throw new ForbiddenException('forbidden');
    const event = await this.eventsRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('event_not_found');
    const h = this.highlightsRepo.create({
      eventId,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      priority: dto.priority ?? 0,
    });
    return this.highlightsRepo.save(h);
  }

  /** Met à jour une mise en avant (admin uniquement). */
  async update(id: string, dto: UpdateHighlightDto, user: { isAdmin: boolean }) {
    if (!user.isAdmin) throw new ForbiddenException('forbidden');
    const h = await this.highlightsRepo.findOne({ where: { id } });
    if (!h) throw new NotFoundException('highlight_not_found');
    if (dto.startAt !== undefined) h.startAt = new Date(dto.startAt);
    if (dto.endAt !== undefined) h.endAt = new Date(dto.endAt);
    if (dto.priority !== undefined) h.priority = dto.priority;
    return this.highlightsRepo.save(h);
  }

  /** Supprime une mise en avant (admin uniquement). */
  async remove(id: string, user: { isAdmin: boolean }) {
    if (!user.isAdmin) throw new ForbiddenException('forbidden');
    const h = await this.highlightsRepo.findOne({ where: { id } });
    if (!h) throw new NotFoundException('highlight_not_found');
    await this.highlightsRepo.remove(h);
    return { ok: true };
  }
}
