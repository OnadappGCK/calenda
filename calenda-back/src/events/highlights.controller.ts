import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateHighlightDto } from './dto/create-highlight.dto';
import { UpdateHighlightDto } from './dto/update-highlight.dto';
import { HighlightsService } from './highlights.service';

@Controller()
/** Controller Highlights — mises en avant des événements (admin uniquement). */
export class HighlightsController {
  constructor(private readonly highlightsService: HighlightsService) {}

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
}
