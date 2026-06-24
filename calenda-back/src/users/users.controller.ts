import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { ReportProfileDto } from './dto/report-profile.dto';
import { RequestEmailChangeVerificationDto } from './dto/request-email-change-verification.dto';

@Controller('users')
/**
 * Controller Users.
 * Expose les endpoints liés à l'utilisateur courant (`/me`) et aux favoris.
 */
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  /** Retourne le profil de l'utilisateur courant (JWT requis). */
  async me(@Req() req: any) {
    return this.usersService.getMe(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  /** Met à jour le profil courant (pseudo/ville/lieu/password). */
  async updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/request-email-verification')
  async requestEmailVerification(@Req() req: any) {
    return this.usersService.requestEmailVerification(req.user.id);
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.usersService.verifyEmail(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/request-email-change-verification')
  async requestEmailChangeVerification(@Req() req: any, @Body() dto: RequestEmailChangeVerificationDto) {
    return this.usersService.requestEmailChangeVerification(req.user.id, dto.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/request-password-change-verification')
  async requestPasswordChangeVerification(@Req() req: any) {
    return this.usersService.requestPasswordChangeVerification(req.user.id);
  }

  @Get(':id/profile')
  async publicProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/report')
  async reportProfile(@Req() req: any, @Param('id') id: string, @Body() dto: ReportProfileDto) {
    return this.usersService.reportProfile(req.user.id, id, dto);
  }

  @Get(':id/events')
  async publicOrganizedEvents(
    @Param('id') id: string,
    @Query('upcoming') upcoming?: string,
    @Query('q') q?: string,
    @Query('categorie') categorie?: string,
    @Query('ville') ville?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.usersService.listPublicOrganizedEvents(id, {
      upcoming: upcoming === 'true' || upcoming === '1',
      q,
      categorie,
      ville,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/favorites')
  /** Liste les événements favoris de l'utilisateur courant. */
  async listFavorites(@Req() req: any) {
    return this.usersService.listFavorites(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/favorites/:eventId')
  /** Ajoute un événement aux favoris. */
  async addFavorite(@Req() req: any, @Param('eventId') eventId: string) {
    return this.usersService.addFavorite(req.user.id, eventId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/favorites/:eventId')
  /** Retire un événement des favoris. */
  async removeFavorite(@Req() req: any, @Param('eventId') eventId: string) {
    return this.usersService.removeFavorite(req.user.id, eventId);
  }
}
