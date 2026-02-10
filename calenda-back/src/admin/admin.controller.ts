import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { ListEventsQueryDto } from '../events/dto/list-events.query';
import { EventsService } from '../events/events.service';
import { User } from '../users/user.entity';
import { MartiguesMergeService } from './martigues-merge.service';
import { Repository } from 'typeorm';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
/**
 * Controller Admin.
 * Endpoints réservés à l'admin (modération/validation/suppression d'événements).
 */
export class AdminController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly martiguesMerge: MartiguesMergeService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  private validateProfileImageForRole(role: Role, profileImage: string) {
    const img = (profileImage ?? '').trim();
    if (!img) {
      throw new BadRequestException('profile_image_invalid');
    }

    if (!/^img\/profil\/.+\.png$/i.test(img)) {
      throw new BadRequestException('profile_image_invalid');
    }

    if (role === Role.UTILISATEUR) {
      if (!/\-pp\.png$/i.test(img)) {
        throw new BadRequestException('profile_image_forbidden');
      }
    } else if (role === Role.ORGANISATEUR) {
      if (!/(\-pp|\-ppa)\.png$/i.test(img)) {
        throw new BadRequestException('profile_image_forbidden');
      }
    }
  }

  private userDto(u: User) {
    return {
      id: u.id,
      email: u.email,
      pseudo: u.pseudo,
      ville: u.ville,
      lieu: u.lieu,
      role: u.role,
      profileImage: u.profileImage,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  @Get('pending-events')
  /** Liste les événements en attente (public=false). */
  async pending(@Query() query: ListEventsQueryDto) {
    // pending events are public=false
    const events = await this.eventsService.findAll(query, { id: 'admin', role: Role.ADMIN });
    return events.filter((e) => e.public === false);
  }

  @Get('organizers')
  /** Liste les profils organisateurs (pour ré-assigner un événement en admin). */
  async organizers() {
    const users = await this.usersRepo.find({ where: { role: Role.ORGANISATEUR }, order: { pseudo: 'ASC' } });
    return users.map((u) => ({ id: u.id, pseudo: u.pseudo, email: u.email, role: u.role }));
  }

  @Get('users')
  /** Liste des comptes (admin). Filtres: q (email/pseudo), role. */
  async listUsers(@Query('q') q?: string, @Query('role') role?: Role) {
    const qb = this.usersRepo.createQueryBuilder('u');
    if (role) {
      qb.andWhere('u.role = :role', { role });
    }
    const qq = (q ?? '').trim();
    if (qq) {
      qb.andWhere('(LOWER(u.email) LIKE LOWER(:q) OR LOWER(u.pseudo) LIKE LOWER(:q))', { q: `%${qq}%` });
    }
    qb.orderBy('u.pseudo', 'ASC');
    const users = await qb.getMany();
    return users.map((u) => this.userDto(u));
  }

  @Post('users')
  /** Crée un compte (admin). */
  async createUser(@Body() dto: AdminCreateUserDto) {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException('password_mismatch');
    }

    const email = dto.email.trim();
    const pseudo = dto.pseudo.trim();
    if (!email || !pseudo) {
      throw new BadRequestException('invalid_payload');
    }

    const existingEmail = await this.usersRepo.findOne({ where: { email } });
    if (existingEmail) {
      throw new BadRequestException('email_already_used');
    }
    const existingPseudo = await this.usersRepo.findOne({ where: { pseudo } });
    if (existingPseudo) {
      throw new BadRequestException('pseudo_already_used');
    }

    const role = dto.role ?? Role.ORGANISATEUR;
    const profileImage = (dto.profileImage ?? '').trim();
    if (profileImage) {
      this.validateProfileImageForRole(role, profileImage);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.usersRepo.create({
      email,
      pseudo,
      ville: dto.ville.trim(),
      lieu: dto.lieu.trim(),
      role,
      profileImage: profileImage || null,
      passwordHash,
      emailVerified: true,
      emailVerificationToken: null,
    });

    await this.usersRepo.save(user);
    return this.userDto(user);
  }

  @Patch('users/:id')
  /** Met à jour un compte (admin). */
  async updateUser(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim();
      const existingEmail = await this.usersRepo.findOne({ where: { email } });
      if (existingEmail && existingEmail.id !== user.id) {
        throw new BadRequestException('email_already_used');
      }
      user.email = email;
    }

    if (dto.pseudo !== undefined) {
      const pseudo = dto.pseudo.trim();
      const existingPseudo = await this.usersRepo.findOne({ where: { pseudo } });
      if (existingPseudo && existingPseudo.id !== user.id) {
        throw new BadRequestException('pseudo_already_used');
      }
      user.pseudo = pseudo;
    }

    if (dto.ville !== undefined) user.ville = dto.ville.trim();
    if (dto.lieu !== undefined) user.lieu = dto.lieu.trim();

    if (dto.role !== undefined) {
      user.role = dto.role;
    }

    if (dto.profileImage !== undefined) {
      const img = (dto.profileImage ?? '').trim();
      if (img) {
        this.validateProfileImageForRole(dto.role ?? user.role, img);
        user.profileImage = img;
      } else {
        user.profileImage = null;
      }
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
    return this.userDto(user);
  }

  @Patch('events/:id/validate')
  /** Valide un événement (le rend public). */
  async validate(@Param('id') id: string) {
    return this.eventsService.validateEvent(id);
  }

  @Delete('events/:id')
  /** Supprime un événement. */
  async remove(@Param('id') id: string) {
    return this.eventsService.remove(id, 'admin', Role.ADMIN);
  }

  @Post('merge/martigues')
  async mergeMartigues(@Query('pages') pages?: string, @Query('dryRun') dryRun?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    const dry = (dryRun ?? '').toLowerCase() === 'true';
    return this.martiguesMerge.merge({
      pages: pagesN,
      dryRun: dry,
    });
  }

  @Get('merge/martigues/preview')
  async previewMergeMartigues(@Query('pages') pages?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    return this.martiguesMerge.preview({ pages: pagesN });
  }

  @Post('merge/martigues/apply')
  async applyMergeMartigues(@Body() body: { urls?: string[] }) {
    return this.martiguesMerge.apply({ urls: body?.urls ?? [] });
  }
}
