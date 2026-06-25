import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

@Injectable()
/**
 * Service Captcha.
 * En mode `dev`, la vérification ne bloque pas; sinon, vérifie le token via Turnstile.
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

    const secret = this.configService.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) {
      throw new BadRequestException('captcha_not_configured');
    }

    const result = await this.verifyTurnstile(token, secret);
    if (!result.success) {
      throw new BadRequestException('captcha_invalid');
    }
  }

  private verifyTurnstile(token: string, secret: string): Promise<TurnstileResponse> {
    return new Promise((resolve, reject) => {
      const data = new URLSearchParams({ secret, response: token }).toString();
      const req = https.request(
        {
          hostname: 'challenges.cloudflare.com',
          path: '/turnstile/v0/siteverify',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body) as TurnstileResponse);
            } catch {
              reject(new Error('Invalid turnstile response'));
            }
          });
        },
      );
      req.on('error', (err) => reject(err));
      req.write(data);
      req.end();
    });
  }
}
