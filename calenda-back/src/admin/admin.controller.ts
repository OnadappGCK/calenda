import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { ListEventsQueryDto } from '../events/dto/list-events.query';
import { EventsService } from '../events/events.service';
import { EtablissementsService } from '../etablissements/etablissements.service';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';
import { UserProfileReport } from '../users/user-profile-report.entity';
import { ConversationGroup } from '../conversations/conversation-group.entity';
import { ConversationMessage } from '../conversations/conversation-message.entity';
import { ConversationParticipant } from '../conversations/conversation-participant.entity';
import { ConversationBlock } from '../conversations/conversation-block.entity';
import { ConversationMessageLike } from '../conversations/conversation-message-like.entity';
import { UserNotification } from '../notifications/user-notification.entity';
import { MartiguesMergeService } from './martigues-merge.service';
import { SalsaOlivierMergeService } from './salsa-olivier-merge.service';
import { CarryLeRouetMergeService } from './carry-le-rouet-merge.service';
import { SaussetMergeService } from './sausset-merge.service';
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
    private readonly saussetMerge: SaussetMergeService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(UserProfileReport) private readonly userProfileReportsRepo: Repository<UserProfileReport>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(ConversationGroup) private readonly groupsRepo: Repository<ConversationGroup>,
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
      isBanned: u.isBanned,
      emailVerified: u.emailVerified,
      profileImage: u.profileImage,
      numero: u.numero,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  @Get('etablissements')
  async allEtablissements() {
    return this.etablissementsService.listAll();
  }

  @Get('pending-etablissements')
  async pendingEtablissements() {
    return this.etablissementsService.listPending();
  }

  @Patch('etablissements/:id')
  async updateEtablissement(@Param('id') id: string, @Body() dto: any) {
    return this.etablissementsService.update(id, dto);
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

  @Get('user-reports')
  async listUserReports() {
    const reports = await this.userProfileReportsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.reporter', 'reporter')
      .leftJoinAndSelect('r.reported', 'reported')
      .orderBy('r.createdAt', 'DESC')
      .getMany();

    return reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.createdAt,
      reporter: {
        id: r.reporter.id,
        pseudo: r.reporter.pseudo,
        email: r.reporter.email,
      },
      reported: {
        id: r.reported.id,
        pseudo: r.reported.pseudo,
        email: r.reported.email,
        isBanned: r.reported.isBanned,
      },
    }));
  }

  @Patch('users/:id/ban')
  async setUserBan(@Param('id') id: string, @Body() body: { isBanned?: boolean }) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    user.isBanned = !!body?.isBanned;
    await this.usersRepo.save(user);
    return this.userDto(user);
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

    if (dto.emailVerified !== undefined) {
      user.emailVerified = !!dto.emailVerified;
      if (user.emailVerified) {
        user.emailVerificationToken = null;
      }
    }

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

  private async getDeletedUser() {
    const email = 'deleted@calendago.fr';
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user) {
      throw new BadRequestException('deleted_user_not_found');
    }
    return user;
  }

  @Delete('users/:id')
  /** Supprime un compte (admin). Les événements, groupes et messages sont transférés au profil "Profil supprimé". */
  async deleteUser(@Param('id') id: string, @Req() req: { user?: { id: string } }) {
    const currentUserId = req.user?.id;
    if (id === currentUserId) {
      throw new BadRequestException('cannot_delete_self');
    }

    const deletedUser = await this.getDeletedUser();
    if (id === deletedUser.id) {
      throw new BadRequestException('cannot_delete_deleted_user');
    }

    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    // Transfère les événements, groupes et messages au profil supprimé
    await this.eventsRepo
      .createQueryBuilder()
      .update(Event)
      .set({ organisateur: deletedUser })
      .where('organisateurId = :id', { id })
      .execute();

    await this.groupsRepo
      .createQueryBuilder()
      .update(ConversationGroup)
      .set({ creator: deletedUser })
      .where('creatorId = :id', { id })
      .execute();

    await this.usersRepo.manager
      .createQueryBuilder()
      .update(ConversationMessage)
      .set({ user: deletedUser })
      .where('userId = :id', { id })
      .execute();

    // Supprime les liens directs (favoris, participations, blocks, likes, reports, notifications)
    const fullUser = await this.usersRepo.findOne({ where: { id }, relations: { favorites: true } });
    if (fullUser) {
      fullUser.favorites = [];
      await this.usersRepo.save(fullUser);
    }

    await this.usersRepo.manager
      .createQueryBuilder()
      .delete()
      .from(ConversationParticipant)
      .where('userId = :id', { id })
      .execute();

    await this.usersRepo.manager
      .createQueryBuilder()
      .delete()
      .from(ConversationBlock)
      .where('blockerId = :id OR blockedId = :id', { id })
      .execute();

    await this.usersRepo.manager
      .createQueryBuilder()
      .delete()
      .from(ConversationMessageLike)
      .where('userId = :id', { id })
      .execute();

    await this.userProfileReportsRepo
      .createQueryBuilder()
      .delete()
      .from(UserProfileReport)
      .where('reporterId = :id OR reportedId = :id', { id })
      .execute();

    await this.usersRepo.manager
      .createQueryBuilder()
      .delete()
      .from(UserNotification)
      .where('userId = :id', { id })
      .execute();

    await this.usersRepo.remove(user);
    return { ok: true };
  }

  @Get('deleted-profile')
  /** Liste les événements et groupes rattachés au profil "Profil supprimé". */
  async deletedProfile() {
    const deletedUser = await this.getDeletedUser();

    const [events, groups] = await Promise.all([
      this.eventsRepo.find({
        where: { organisateur: { id: deletedUser.id } },
        relations: { slots: true },
        order: { createdAt: 'DESC' },
      }),
      this.groupsRepo.find({
        where: { creator: { id: deletedUser.id } },
        relations: { event: true },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      user: this.userDto(deletedUser),
      events: events.map((e) => ({
        id: e.id,
        titre: e.titre,
        ville: e.ville,
        lieu: e.lieu,
        dateDebut: e.dateDebut.toISOString(),
        public: e.public,
        createdAt: e.createdAt.toISOString(),
      })),
      groups: groups.map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        createdAt: g.createdAt.toISOString(),
        event: g.event ? { id: g.event.id, titre: g.event.titre } : null,
      })),
    };
  }

  @Delete('conversation-groups/:id')
  /** Supprime logiquement un groupe de conversation (admin). */
  async deleteConversationGroup(@Param('id') id: string) {
    const group = await this.groupsRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('group_not_found');
    }

    group.status = 'DELETED';
    await this.groupsRepo.save(group);
    return { ok: true };
  }

  @Patch('users/:id/verify-email')
  /** Valide manuellement l'email d'un compte. */
  async verifyUserEmail(@Param('id') id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
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

  @Post('merge/sausset')
  async mergeSausset(@Query('pages') pages?: string, @Query('dryRun') dryRun?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    const dry = (dryRun ?? '').toLowerCase() === 'true';
    return this.saussetMerge.merge({ pages: pagesN, dryRun: dry });
  }

  @Get('merge/sausset/preview')
  async previewMergeSausset(@Query('pages') pages?: string) {
    const pagesN = pages ? Number(pages) : undefined;
    return this.saussetMerge.preview({ pages: pagesN });
  }

  @Post('merge/sausset/apply')
  async applyMergeSausset(@Body() body: { urls?: string[]; toDeleteIds?: string[] }) {
    return this.saussetMerge.apply({ urls: body?.urls ?? [], toDeleteIds: body?.toDeleteIds ?? [] });
  }

  @Post('merge/backfill-organizers')
  async backfillMergeOrganizers() {
    const [martigues, salsaOlivier, carryLeRouet, sausset] = await Promise.all([
      this.martiguesMerge.backfillOrganizer(),
      this.salsaMerge.backfillOrganizer(),
      this.carryMerge.backfillOrganizer(),
      this.saussetMerge.backfillOrganizer(),
    ]);

    return {
      martigues,
      salsaOlivier,
      carryLeRouet,
      sausset,
      total: martigues + salsaOlivier + carryLeRouet + sausset,
    };
  }
}
