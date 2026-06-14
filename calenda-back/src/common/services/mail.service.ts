import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  private getTransportConfig() {
    const host = this.configService.get<string>('SMTP_HOST') ?? '';
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const user = this.configService.get<string>('SMTP_USER') ?? '';
    const pass = this.configService.get<string>('SMTP_PASS') ?? '';
    const from = this.configService.get<string>('SMTP_FROM') ?? user;
    return { host, port, user, pass, from };
  }

  async sendVerificationCode(to: string, code: string, context: 'register' | 'email_change' | 'password_change' | 'email_verify') {
    const { host, port, user, pass, from } = this.getTransportConfig();

    if (!host || !user || !pass || !from) {
      console.warn('[MailService] SMTP config manquante – e-mail non envoyé (contexte:', context, 'à:', to, ')');
      return;
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    });

    const labelByContext: Record<string, string> = {
      register: 'création de compte',
      email_change: 'changement d\'adresse e-mail',
      password_change: 'changement de mot de passe',
      email_verify: 'vérification d\'adresse e-mail',
    };

    const label = labelByContext[context] ?? 'vérification';

    await transport.sendMail({
      from,
      to,
      subject: `Code de vérification Calenda`,
      text: `Votre code de vérification pour ${label} est : ${code}\n\nCe code expire dans 15 minutes.`,
      html: `<p>Votre code de vérification pour ${label} est :</p><p><strong style="font-size:20px;letter-spacing:2px;">${code}</strong></p><p>Ce code expire dans 15 minutes.</p>`,
    });
  }

  async sendAdminNotification(to: string, subject: string, text: string, html: string) {
    const { host, port, user, pass, from } = this.getTransportConfig();

    if (!host || !user || !pass || !from) {
      console.warn('[MailService] SMTP config manquante – notification admin non envoyée à:', to);
      console.warn('[MailService] Sujet:', subject);
      return;
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    });

    await transport.sendMail({ from, to, subject, text, html });
  }

  async sendVerificationLink(to: string, verifyUrl: string) {
    const { host, port, user, pass, from } = this.getTransportConfig();

    if (!host || !user || !pass || !from) {
      console.warn('[MailService] SMTP config manquante – lien de vérification non envoyé à:', to);
      console.warn('[MailService] URL qui aurait dû être envoyée:', verifyUrl);
      return;
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    });

    await transport.sendMail({
      from,
      to,
      subject: 'Vérifiez votre compte Calenda',
      text: `Bienvenue sur Calenda. Cliquez sur ce lien pour vérifier votre compte : ${verifyUrl}`,
      html: `<p>Bienvenue sur Calenda.</p><p><a href="${verifyUrl}">Cliquez ici pour vérifier votre compte</a></p>`,
    });
  }
}
