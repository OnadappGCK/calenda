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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANISATEUR)
  @Post()
  /** Crée un événement (JWT + rôle ADMIN/ORGANISATEUR requis). */
  async create(@Body() dto: CreateEventDto, @Req() req: any) {
    return this.eventsService.create(dto, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANISATEUR)
  @Patch(':id')
  /** Met à jour un événement (owner ou admin). */
  async update(@Param('id') id: string, @Body() dto: UpdateEventDto, @Req() req: any) {
    return this.eventsService.update(id, dto, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANISATEUR)
  @Delete(':id')
  /** Supprime un événement (owner ou admin). */
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.eventsService.remove(id, req.user.id, req.user.role);
  }
}
