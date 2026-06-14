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

    if (mode === 'turnstile') {
      const secret = (this.configService.get<string>('TURNSTILE_SECRET_KEY') ?? '').trim();
      if (!secret) {
        throw new BadRequestException('captcha_not_configured');
      }

      const body = new URLSearchParams({
        secret,
        response: token,
      });

      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (!response.ok) {
        throw new BadRequestException('captcha_unavailable');
      }

      const result = (await response.json()) as {
        success?: boolean;
      };

      if (!result.success) {
        throw new BadRequestException('captcha_invalid');
      }

      return;
    }

    throw new BadRequestException('captcha_not_configured');
  }
}
