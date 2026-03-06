import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';

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
