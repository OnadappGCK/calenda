import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Event } from '../events/event.entity';
import { User } from './user.entity';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
  ) {}

  async findById(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }
    return user;
  }

  async getMe(id: string) {
    const user = await this.findById(id);
    return {
      id: user.id,
      email: user.email,
      pseudo: user.pseudo,
      ville: user.ville,
      lieu: user.lieu,
      role: user.role,
    };
  }

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
