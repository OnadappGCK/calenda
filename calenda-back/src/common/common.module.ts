import { Module } from '@nestjs/common';
import { CaptchaService } from './services/captcha.service';

@Module({
  providers: [CaptchaService],
  exports: [CaptchaService],
})
export class CommonModule {}
