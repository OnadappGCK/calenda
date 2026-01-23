import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
/**
 * Service Captcha.
 * En mode `dev`, la vérification ne bloque pas; sinon, exige un token (implémentation à compléter).
 */
export class CaptchaService {
  constructor(private readonly configService: ConfigService) {}

  /** Vérifie le token captcha (no-op en mode dev). */
  async verify(token: string | undefined) {
    const mode = (this.configService.get<string>('CAPTCHA_MODE') ?? 'dev').toLowerCase();

    if (mode === 'dev') {
      return;
    }

    if (!token) {
      throw new BadRequestException('captcha_required');
    }

    throw new BadRequestException('captcha_not_configured');
  }
}
