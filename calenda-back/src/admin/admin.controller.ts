import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { ListEventsQueryDto } from '../events/dto/list-events.query';
import { EventsService } from '../events/events.service';
import { EtablissementsService } from '../etablissements/etablissements.service';
import { User } from '../users/user.entity';
import { MartiguesMergeService } from './martigues-merge.service';
import { SalsaOlivierMergeService } from './salsa-olivier-merge.service';
import { CarryLeRouetMergeService } from './carry-le-rouet-merge.service';
import { Repository } from 'typeorm';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
/**
 * Controller Admin.
 * Endpoints réservés à l'admin (modération/validation/suppression d'événements).
 */
export class AdminController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly etablissementsService: EtablissementsService,
    private readonly martiguesMerge: MartiguesMergeService,
    private readonly salsaMerge: SalsaOlivierMergeService,
    private readonly carryMerge: CarryLeRouetMergeService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

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

  private userDto(u: User) {
    return {
      id: u.id,
      email: u.email,
      pseudo: u.pseudo,
      ville: u.ville,
      lieu: u.lieu,
      isAdmin: u.isAdmin,
      emailVerified: u.emailVerified,
      profileImage: u.profileImage,
      numero: u.numero,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  @Get('pending-etablissements')
  async pendingEtablissements() {
    return this.etablissementsService.listPending();
  }

  @Patch('etablissements/:id/validate')
  async validateEtablissement(@Param('id') id: string) {
    return this.etablissementsService.validatePublic(id);
  }

  @Delete('etablissements/:id')
  async removeEtablissement(@Param('id') id: string) {
    return this.etablissementsService.remove(id);
  }

  @Get('pending-events')
  /** Liste les événements en attente (public=false). */
  async pending(@Query() query: ListEventsQueryDto) {
    // pending events are public=false
    const events = await this.eventsService.findAll(
      {
        ...query,
        includePending: true,
      },
      { id: 'admin', isAdmin: true, emailVerified: true },
    );
    return events.filter((e) => e.public === false);
  }

  @Get('organizers')
  /** Liste les profils organisateurs (pour ré-assigner un événement en admin). */
  async organizers() {
    const users = await this.usersRepo.find({ order: { pseudo: 'ASC' } });
    return users.map((u) => ({ id: u.id, pseudo: u.pseudo, email: u.email, isAdmin: u.isAdmin }));
  }

  @Get('users')
  /** Liste des comptes (admin). Filtres: q (email/pseudo), isAdmin. */
  async listUsers(@Query('q') q?: string, @Query('isAdmin') isAdmin?: string) {
    const qb = this.usersRepo.createQueryBuilder('u');
    const adminFlag = (isAdmin ?? '').trim().toLowerCase();
    if (adminFlag === 'true') qb.andWhere('u.isAdmin = :isAdmin', { isAdmin: true });
    if (adminFlag === 'false') qb.andWhere('u.isAdmin = :isAdmin', { isAdmin: false });
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

    const isAdmin = !!dto.isAdmin;
    const profileImage = (dto.profileImage ?? '').trim();
    if (profileImage) {
      this.validateProfileImageForRole(isAdmin, profileImage);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.usersRepo.create({
      email,
      pseudo,
      ville: dto.ville.trim(),
      lieu: dto.lieu.trim(),
      isAdmin,
      profileImage: profileImage || null,
      numero: (dto.numero ?? '').trim() || null,
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

    if (dto.isAdmin !== undefined) user.isAdmin = dto.isAdmin;

    if (dto.profileImage !== undefined) {
      const img = (dto.profileImage ?? '').trim();
      if (img) {
        this.validateProfileImageForRole(dto.isAdmin ?? user.isAdmin, img);
        user.profileImage = img;
      } else {
        user.profileImage = null;
      }
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
    return this.userDto(user);
  }

  @Patch('events/:id/validate')
  /** Valide un événement (le rend public). */
  async validate(@Param('id') id: string) {
    return this.eventsService.validateEvent(id);
  }

  @Patch('events/validate-bulk')
  async validateBulk(@Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    return this.eventsService.validateEvents(ids);
  }

  @Delete('events/:id')
  /** Supprime un événement. */
  async remove(@Param('id') id: string) {
    return this.eventsService.remove(id, 'admin', { isAdmin: true });
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
  async applyMergeMartigues(@Body() body: { urls?: string[]; toDeleteIds?: string[] }) {
    return this.martiguesMerge.apply({ urls: body?.urls ?? [], toDeleteIds: body?.toDeleteIds ?? [] });
  }

  @Post('merge/salsa-olivier')
  async mergeSalsaOlivier(@Query('pages') pages?: string, @Query('dryRun') dryRun?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    const dry = (dryRun ?? '').toLowerCase() === 'true';
    return this.salsaMerge.merge({
      pages: pagesN,
      dryRun: dry,
    });
  }

  @Get('merge/salsa-olivier/preview')
  async previewMergeSalsaOlivier(@Query('pages') pages?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    return this.salsaMerge.preview({ pages: pagesN });
  }

  @Post('merge/salsa-olivier/apply')
  async applyMergeSalsaOlivier(@Body() body: { urls?: string[]; toDeleteIds?: string[] }) {
    return this.salsaMerge.apply({ urls: body?.urls ?? [], toDeleteIds: body?.toDeleteIds ?? [] });
  }

  @Post('merge/carry-le-rouet')
  async mergeCarryLeRouet(@Query('pages') pages?: string, @Query('dryRun') dryRun?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    const dry = (dryRun ?? '').toLowerCase() === 'true';
    return this.carryMerge.merge({ pages: pagesN, dryRun: dry });
  }

  @Get('merge/carry-le-rouet/preview')
  async previewMergeCarryLeRouet(@Query('pages') pages?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    return this.carryMerge.preview({ pages: pagesN });
  }

  @Post('merge/carry-le-rouet/apply')
  async applyMergeCarryLeRouet(@Body() body: { urls?: string[]; toDeleteIds?: string[] }) {
    return this.carryMerge.apply({ urls: body?.urls ?? [], toDeleteIds: body?.toDeleteIds ?? [] });
  }
}
