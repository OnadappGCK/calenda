import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Event } from '../events/event.entity';
import { User } from './user.entity';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
/**
 * Service Users.
 * Gère le profil utilisateur courant et la relation favoris (user <-> events).
 */
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
  ) {}

  /** Récupère un user par id ou lève `user_not_found`. */
  async findById(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }
    return user;
  }

  /** Retourne un DTO du profil courant (sans passwordHash). */
  async getMe(id: string) {
    const user = await this.findById(id);
    return {
      id: user.id,
      email: user.email,
      pseudo: user.pseudo,
      ville: user.ville,
      lieu: user.lieu,
      isAdmin: user.isAdmin,
      emailVerified: user.emailVerified,
      profileImage: user.profileImage,
      numero: user.numero,
    };
  }

  async requestEmailVerification(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    if (user.emailVerified) {
      return { ok: true };
    }

    const token = randomUUID();
    user.emailVerificationToken = token;
    await this.usersRepo.save(user);
    return { ok: true, token };
  }

  async verifyEmail(token: string) {
    const t = (token ?? '').trim();
    if (!t) {
      throw new BadRequestException('invalid_token');
    }

    const user = await this.usersRepo.findOne({ where: { emailVerificationToken: t } });
    if (!user) {
      throw new BadRequestException('invalid_token');
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    await this.usersRepo.save(user);
    return { ok: true };
  }

  private validateProfileImageForRole(isAdmin: boolean, profileImage: string) {
    const img = (profileImage ?? '').trim();
    if (!img) {
      throw new BadRequestException('profile_image_invalid');
    }

    if (!/^img\/profil\/.+\.png$/i.test(img)) {
      throw new BadRequestException('profile_image_invalid');
    }

    if (!isAdmin) {
      if (!/\-pp\.png$/i.test(img)) {
        throw new BadRequestException('profile_image_forbidden');
      }
    }
  }

  /** Liste les favoris du user (relation many-to-many). */
  async listFavorites(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: { favorites: true },
    });

    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    return user.favorites;
  }

  /** Ajoute un événement aux favoris (idempotent). */
  async addFavorite(userId: string, eventId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: { favorites: true },
    });

    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    const event = await this.eventsRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('event_not_found');
    }

    const already = user.favorites.some((e) => e.id === event.id);
    if (!already) {
      user.favorites.push(event);
      await this.usersRepo.save(user);
    }

    return { ok: true };
  }

  /** Retire un événement des favoris (idempotent). */
  async removeFavorite(userId: string, eventId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: { favorites: true },
    });

    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    user.favorites = user.favorites.filter((e) => e.id !== eventId);
    await this.usersRepo.save(user);

    return { ok: true };
  }

  /**
   * Met à jour le profil courant.
   * Gère l'unicité du pseudo et le changement de mot de passe si demandé.
   */
  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    if (dto.pseudo !== undefined) {
      const exists = await this.usersRepo.findOne({ where: { pseudo: dto.pseudo } });
      if (exists && exists.id !== user.id) {
        throw new BadRequestException('pseudo_already_used');
      }
      user.pseudo = dto.pseudo;
    }

    if (dto.ville !== undefined) user.ville = dto.ville;
    if (dto.lieu !== undefined) user.lieu = dto.lieu;

    if (dto.profileImage !== undefined) {
      this.validateProfileImageForRole(user.isAdmin, dto.profileImage);
      user.profileImage = dto.profileImage.trim();
    }

    if (dto.numero !== undefined) {
      const raw = (dto.numero ?? '').trim();
      user.numero = raw ? raw : null;
    }

    if (dto.password !== undefined || dto.passwordConfirmation !== undefined) {
      if (!dto.password || !dto.passwordConfirmation) {
        throw new BadRequestException('password_required');
      }

      if (dto.password !== dto.passwordConfirmation) {
        throw new BadRequestException('password_mismatch');
      }

      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    await this.usersRepo.save(user);
    return this.getMe(user.id);
  }
}
