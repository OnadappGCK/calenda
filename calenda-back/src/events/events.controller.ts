import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events.query';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
/**
 * Controller Events.
 * Expose les endpoints de listing, détail, suggestions et CRUD (création/édition/suppression).
 */
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  /** Liste les événements (filtres via query + user optionnel pour favoris/non-public). */
  async list(@Query() query: ListEventsQueryDto, @Req() req: any) {
    return this.eventsService.findAll(query, req.user ?? null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('featured')
  /** Liste les événements "mis en avant". */
  async featured(@Req() req: any) {
    return this.eventsService.findFeatured(req.user ?? null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('cities')
  /** Liste des villes distinctes présentes dans les événements. */
  async cities(@Req() req: any) {
    return this.eventsService.listCities(req.user ?? null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  /** Retourne le détail d'un événement (non-public masqué si non autorisé). */
  async getOne(@Param('id') id: string, @Req() req: any) {
    return this.eventsService.findOne(id, req.user ?? null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/similar')
  /** Retourne des événements "similaires" à un événement donné. */
  async similar(@Param('id') id: string, @Req() req: any) {
    return this.eventsService.findSimilar(id, req.user ?? null);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post()
  /** Crée un événement (JWT requis). */
  async create(@Body() dto: CreateEventDto, @Req() req: any) {
    return this.eventsService.create(dto, req.user.id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  /** Met à jour un événement (owner ou admin). */
  async update(@Param('id') id: string, @Body() dto: UpdateEventDto, @Req() req: any) {
    return this.eventsService.update(id, dto, req.user.id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  /** Supprime un événement (owner ou admin). */
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.eventsService.remove(id, req.user.id, req.user);
  }
}
