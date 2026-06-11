import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { MailService } from '../common/services/mail.service';
import { Event } from './event.entity';
import { CreateHighlightDto } from './dto/create-highlight.dto';
import { UpdateHighlightDto } from './dto/update-highlight.dto';
import { HighlightsService } from './highlights.service';

@Controller()
/** Controller Highlights — mises en avant des événements (admin uniquement). */
export class HighlightsController {
  constructor(
    private readonly highlightsService: HighlightsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('events/:eventId/highlights')
  /** Liste les mises en avant d'un événement. */
  async list(@Param('eventId') eventId: string) {
    return this.highlightsService.listForEvent(eventId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('events/:eventId/highlights')
  /** Crée une mise en avant (admin). */
  async create(
    @Param('eventId') eventId: string,
    @Body() dto: CreateHighlightDto,
    @Req() req: any,
  ) {
    return this.highlightsService.create(eventId, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('highlights/:id')
  /** Met à jour une mise en avant (admin). */
  async update(@Param('id') id: string, @Body() dto: UpdateHighlightDto, @Req() req: any) {
    return this.highlightsService.update(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('highlights/:id')
  /** Supprime une mise en avant (admin). */
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.highlightsService.remove(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('events/:eventId/boost-request')
  /** Envoie une demande de mise en avant à l'administrateur par e-mail. */
  async boostRequest(
    @Param('eventId') eventId: string,
    @Body() body: { phone: string; message?: string },
    @Req() req: any,
  ) {
    const event = await this.eventsRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('event_not_found');

    const frontUrl = this.configService.get<string>('FRONT_BASE_URL') ?? 'http://localhost:4200';
    const eventUrl = `${frontUrl}/events/${eventId}`;
    const adminEmail = this.configService.get<string>('SMTP_FROM') ?? this.configService.get<string>('SMTP_USER') ?? '';

    const user = req.user as { pseudo?: string; email?: string };
    const pseudo = user.pseudo ?? '(inconnu)';
    const userEmail = user.email ?? '(inconnu)';
    const phone = body.phone ?? '';
    const userMessage = body.message ?? '';

    const html = `
      <h2>Demande de mise en avant — Calenda</h2>
      <p><strong>Événement :</strong> <a href="${eventUrl}">${event.titre}</a></p>
      <p><strong>Lien :</strong> <a href="${eventUrl}">${eventUrl}</a></p>
      <hr/>
      <p><strong>Utilisateur :</strong> ${pseudo} (${userEmail})</p>
      <p><strong>Téléphone :</strong> ${phone}</p>
      <p><strong>Message :</strong></p>
      <p>${userMessage || '(aucun message)'}</p>
    `;

    const text = `Demande de mise en avant — Calenda\n\nÉvénement : ${event.titre}\nLien : ${eventUrl}\n\nUtilisateur : ${pseudo} (${userEmail})\nTéléphone : ${phone}\nMessage : ${userMessage || '(aucun message)'}`;

    await this.mailService.sendAdminNotification(adminEmail, `[Calenda] Demande de mise en avant : ${event.titre}`, text, html);

    return { ok: true };
  }
}
