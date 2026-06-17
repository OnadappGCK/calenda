import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { EmailVerificationCode } from '../email-verification-code.entity';
import { MailService } from './mail.service';

export type VerificationPurpose = 'register' | 'email_change' | 'password_change' | 'email_verify';

@Injectable()
export class EmailVerificationService {
  constructor(
    @InjectRepository(EmailVerificationCode)
    private readonly codesRepo: Repository<EmailVerificationCode>,
    private readonly mailService: MailService,
  ) {}

  private normalizeEmail(email: string) {
    return (email ?? '').trim().toLowerCase();
  }

  private generateCode() {
    return `${Math.floor(100000 + Math.random() * 900000)}`;
  }

  async issueCode(params: { email: string; purpose: VerificationPurpose; userId?: string | null }) {
    const email = this.normalizeEmail(params.email);
    if (!email) {
      throw new BadRequestException('email_required');
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const userId = params.userId ?? null;

    const staleQb = this.codesRepo
      .createQueryBuilder()
      .update(EmailVerificationCode)
      .set({ consumedAt: new Date() })
      .where('email = :email', { email })
      .andWhere('purpose = :purpose', { purpose: params.purpose })
      .andWhere('consumedAt IS NULL');

    if (userId) {
      staleQb.andWhere('userId = :userId', { userId });
    } else {
      staleQb.andWhere('userId IS NULL');
    }

    await staleQb.execute();

    const row = this.codesRepo.create({
      email,
      purpose: params.purpose,
      userId,
      codeHash,
      expiresAt,
      consumedAt: null,
    });
    await this.codesRepo.save(row);

    await this.mailService.sendVerificationCode(email, code, params.purpose);
    return { ok: true };
  }

  async consumeCode(params: { email: string; purpose: VerificationPurpose; code: string; userId?: string | null }) {
    const email = this.normalizeEmail(params.email);
    const code = (params.code ?? '').trim();
    if (!email || !code) {
      throw new BadRequestException('verification_code_required');
    }

    const userId = params.userId ?? null;

    const qb = this.codesRepo
      .createQueryBuilder('c')
      .where('c.email = :email', { email })
      .andWhere('c.purpose = :purpose', { purpose: params.purpose })
      .andWhere('c.consumedAt IS NULL')
      .orderBy('c.createdAt', 'DESC');

    if (userId) {
      qb.andWhere('c.userId = :userId', { userId });
    } else {
      qb.andWhere('c.userId IS NULL');
    }

    const row = await qb.getOne();

    if (!row) {
      throw new BadRequestException('verification_code_invalid');
    }

    if (new Date(row.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException('verification_code_expired');
    }

    const ok = await bcrypt.compare(code, row.codeHash);
    if (!ok) {
      throw new BadRequestException('verification_code_invalid');
    }

    row.consumedAt = new Date();
    await this.codesRepo.save(row);
    return { ok: true };
  }
}
