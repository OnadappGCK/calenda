import { Body, Controller, HttpException, HttpStatus, Ip, Post } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { MailService } from '../common/services/mail.service';

class ContactDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  sujet!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}

@Controller('contact')
export class ContactController {
  private readonly COOLDOWN_MS = 20_000;
  private readonly lastSent = new Map<string, number>();

  constructor(private readonly mailService: MailService) {}

  @Post()
  async send(@Body() body: ContactDto, @Ip() ip: string) {
    const { email, sujet, message } = body;

    if (!email || !sujet || !message) {
      throw new HttpException('Tous les champs sont requis.', HttpStatus.BAD_REQUEST);
    }

    // Rate limit: 20s per IP
    const now = Date.now();
    const last = this.lastSent.get(ip) ?? 0;
    if (now - last < this.COOLDOWN_MS) {
      const remaining = Math.ceil((this.COOLDOWN_MS - (now - last)) / 1000);
      throw new HttpException(
        `Veuillez patienter ${remaining} secondes avant de renvoyer un message.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const to = 'onadapp0@gmail.com';
    const subject = `[Contact Calenda] ${sujet}`;
    const text = `Email: ${email}\nSujet: ${sujet}\n\nMessage:\n${message}`;
    const html = `<p><strong>Email:</strong> ${email}</p><p><strong>Sujet:</strong> ${sujet}</p><hr/><p>${message.replace(/\n/g, '<br/>')}</p>`;

    await this.mailService.sendAdminNotification(to, subject, text, html);

    this.lastSent.set(ip, now);

    return { ok: true };
  }
}
