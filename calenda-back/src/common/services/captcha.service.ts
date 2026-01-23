import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CaptchaService {
  constructor(private readonly configService: ConfigService) {}

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
