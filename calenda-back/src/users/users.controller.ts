import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    return this.usersService.getMe(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/favorites')
  async listFavorites(@Req() req: any) {
    return this.usersService.listFavorites(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/favorites/:eventId')
  async addFavorite(@Req() req: any, @Param('eventId') eventId: string) {
    return this.usersService.addFavorite(req.user.id, eventId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/favorites/:eventId')
  async removeFavorite(@Req() req: any, @Param('eventId') eventId: string) {
    return this.usersService.removeFavorite(req.user.id, eventId);
  }
}
