import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { CaptchaService } from '../common/services/captcha.service';
import { User } from '../users/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
/**
 * Service Auth.
 * Contient la logique d'inscription/connexion et la génération de JWT.
 */
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly captchaService: CaptchaService,
  ) {}

  /**
   * Inscription: vérifie captcha, valide unicité email/pseudo, hash le mot de passe et crée un user.
   */
  async register(dto: RegisterDto) {
    await this.captchaService.verify(dto.captchaToken);

    const adresse = (dto.adresse ?? '').trim();
    const ville = (dto.ville ?? '').trim();
    const lieu = (dto.lieu ?? '').trim();

    if (!adresse) {
      throw new BadRequestException('adresse_required');
    }

    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException('password_mismatch');
    }

    const existingEmail = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existingEmail) {
      throw new BadRequestException('email_already_used');
    }

    const existingPseudo = await this.usersRepo.findOne({ where: { pseudo: dto.pseudo } });
    if (existingPseudo) {
      throw new BadRequestException('pseudo_already_used');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const profileImage = (dto.profileImage ?? '').trim();
    if (profileImage && (!/^img\/profil\/.+\.png$/i.test(profileImage) || !/\-pp\.png$/i.test(profileImage))) {
      throw new BadRequestException('profile_image_forbidden');
    }

    const user = this.usersRepo.create({
      email: dto.email,
      pseudo: dto.pseudo,
      ville: ville || adresse,
      lieu: lieu || adresse,
      passwordHash,
      isAdmin: false,
      profileImage: profileImage || null,
      numero: (dto.numero ?? '').trim() || null,
      emailVerified: false,
      emailVerificationToken: randomUUID(),
    });

    await this.usersRepo.save(user);

    return {
      id: user.id,
      email: user.email,
      pseudo: user.pseudo,
      isAdmin: user.isAdmin,
      emailVerified: user.emailVerified,
      profileImage: user.profileImage,
      numero: user.numero,
    };
  }

  /**
   * Connexion: vérifie captcha + credentials, puis signe un JWT et retourne token + user.
   */
  async login(dto: LoginDto) {
    await this.captchaService.verify(dto.captchaToken);

    const user = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('invalid_credentials');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      emailVerified: user.emailVerified,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        pseudo: user.pseudo,
        isAdmin: user.isAdmin,
        emailVerified: user.emailVerified,
        profileImage: user.profileImage,
        numero: user.numero,
      },
    };
  }

  /** Crée un token de vérification email (non utilisé si `emailVerified=true` en dev). */
  async createEmailVerificationToken(userId: string) {
    const token = randomUUID();
    await this.usersRepo.update(userId, { emailVerificationToken: token, emailVerified: false });
    return token;
  }
}
