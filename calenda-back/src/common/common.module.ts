import { Module } from '@nestjs/common';
import { CaptchaService } from './services/captcha.service';

@Module({
  providers: [CaptchaService],
  exports: [CaptchaService],
})
/** Module Common: services partagés (ex: captcha). */
export class CommonModule {}
