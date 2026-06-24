import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerificationCode } from './email-verification-code.entity';
import { AdminGuard } from './guards/admin.guard';
import { CaptchaService } from './services/captcha.service';
import { EmailVerificationService } from './services/email-verification.service';
import { MailService } from './services/mail.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailVerificationCode])],
  providers: [CaptchaService, AdminGuard, MailService, EmailVerificationService],
  exports: [CaptchaService, AdminGuard, MailService, EmailVerificationService],
})
/** Module Common: services partagés (ex: captcha). */
export class CommonModule {}
