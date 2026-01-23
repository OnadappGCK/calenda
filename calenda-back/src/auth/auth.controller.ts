import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
/**
 * Controller Auth.
 * Expose les endpoints d'inscription et de connexion (JWT).
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  /** Inscription: crée un utilisateur et retourne le profil minimal. */
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  /** Connexion: vérifie les identifiants et retourne un `accessToken` + user. */
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
