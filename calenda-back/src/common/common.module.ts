import { Module } from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard';
import { CaptchaService } from './services/captcha.service';

@Module({
  providers: [CaptchaService, AdminGuard],
  exports: [CaptchaService, AdminGuard],
})
/** Module Common: services partagés (ex: captcha). */
export class CommonModule {}
