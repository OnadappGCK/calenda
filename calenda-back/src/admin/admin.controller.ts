import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { ListEventsQueryDto } from '../events/dto/list-events.query';
import { EventsService } from '../events/events.service';
import { MartiguesMergeService } from './martigues-merge.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
/**
 * Controller Admin.
 * Endpoints réservés à l'admin (modération/validation/suppression d'événements).
 */
export class AdminController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly martiguesMerge: MartiguesMergeService,
  ) {}

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

  @Post('merge/martigues')
  async mergeMartigues(@Query('pages') pages?: string, @Query('dryRun') dryRun?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    const dry = (dryRun ?? '').toLowerCase() === 'true';
    return this.martiguesMerge.merge({
      pages: pagesN,
      dryRun: dry,
    });
  }

  @Get('merge/martigues/preview')
  async previewMergeMartigues(@Query('pages') pages?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    return this.martiguesMerge.preview({ pages: pagesN });
  }

  @Post('merge/martigues/apply')
  async applyMergeMartigues(@Body() body: { urls?: string[] }) {
    return this.martiguesMerge.apply({ urls: body?.urls ?? [] });
  }
}
