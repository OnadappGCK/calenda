import { Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { ListEventsQueryDto } from '../events/dto/list-events.query';
import { EventsService } from '../events/events.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
/**
 * Controller Admin.
 * Endpoints réservés à l'admin (modération/validation/suppression d'événements).
 */
export class AdminController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('pending-events')
  /** Liste les événements en attente (public=false). */
  async pending(@Query() query: ListEventsQueryDto) {
    // pending events are public=false
    const events = await this.eventsService.findAll(query, { id: 'admin', role: Role.ADMIN });
    return events.filter((e) => e.public === false);
  }

  @Patch('events/:id/validate')
  /** Valide un événement (le rend public). */
  async validate(@Param('id') id: string) {
    return this.eventsService.validateEvent(id);
  }

  @Delete('events/:id')
  /** Supprime un événement. */
  async remove(@Param('id') id: string) {
    return this.eventsService.remove(id, 'admin', Role.ADMIN);
  }
}
