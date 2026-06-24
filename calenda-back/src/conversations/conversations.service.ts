import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';
import { ConversationBlock } from './conversation-block.entity';
import { ConversationGroup } from './conversation-group.entity';
import { ConversationMessageLike } from './conversation-message-like.entity';
import { ConversationMessage } from './conversation-message.entity';
import { ConversationParticipant } from './conversation-participant.entity';
import { CreateConversationGroupDto } from './dto/create-conversation-group.dto';
import { CreateConversationMessageDto } from './dto/create-conversation-message.dto';
import { NotificationsService } from '../notifications/notifications.service';

const MESSAGE_MIN_INTERVAL_MS = 15_000;
const FLAG_THRESHOLD = 3;
const MAX_CONSECUTIVE_MESSAGES = 3;

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(ConversationGroup) private readonly groupsRepo: Repository<ConversationGroup>,
    @InjectRepository(ConversationMessage) private readonly messagesRepo: Repository<ConversationMessage>,
    @InjectRepository(ConversationParticipant) private readonly participantsRepo: Repository<ConversationParticipant>,
    @InjectRepository(ConversationBlock) private readonly blocksRepo: Repository<ConversationBlock>,
    @InjectRepository(ConversationMessageLike) private readonly likesRepo: Repository<ConversationMessageLike>,
    private readonly notificationsService: NotificationsService,
  ) {}

  private normalize(v: string | null | undefined) {
    return (v ?? '').trim();
  }

  private cleanOptional(v: string | null | undefined) {
    const s = this.normalize(v);
    return s || null;
  }

  private containsExternalLink(content: string) {
    return /(https?:\/\/|www\.)/i.test(content);
  }

  private containsBlacklistedWord(content: string) {
    const lowered = content.toLowerCase();
    const blacklist = ['arnaque', 'escort', 'telegram', 'sexe', 'raciste', 'nazi'];
    return blacklist.some((word) => lowered.includes(word));
  }

  private assertMessagePolicy(content: string) {
    if (this.containsExternalLink(content)) {
      throw new BadRequestException('external_links_not_allowed');
    }
    if (this.containsBlacklistedWord(content)) {
      throw new BadRequestException('message_not_allowed');
    }
  }

  private async findPublicEvent(eventId: string) {
    const event = await this.eventsRepo.findOne({ where: { id: eventId } });
    if (!event || !event.public) {
      throw new NotFoundException('event_not_found');
    }
    return event;
  }

  private async findUser(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('user_not_found');
    }
    if (user.isBanned) {
      throw new ForbiddenException('account_banned');
    }
    return user;
  }

  private async assertParticipant(groupId: string, userId: string) {
    const isParticipant = await this.participantsRepo
      .createQueryBuilder('p')
      .leftJoin('p.user', 'u')
      .where('p.groupId = :groupId', { groupId })
      .andWhere('u.id = :userId', { userId })
      .andWhere('p.active = :active', { active: true })
      .getExists();

    if (!isParticipant) {
      throw new ForbiddenException('participant_required');
    }
  }

  private async findGroupOrThrow(groupId: string) {
    const group = await this.groupsRepo
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.event', 'event')
      .leftJoinAndSelect('g.creator', 'creator')
      .where('g.id = :groupId', { groupId })
      .getOne();

    if (!group || group.status === 'DELETED') {
      throw new NotFoundException('group_not_found');
    }

    if (group.expiresAt.getTime() < Date.now()) {
      if (group.status === 'OPEN') {
        group.status = 'LOCKED';
        await this.groupsRepo.save(group);
      }
      throw new ForbiddenException('group_expired');
    }

    return group;
  }

  private async assertCanPost(group: ConversationGroup, userId: string) {
    if (group.status !== 'OPEN') {
      throw new ForbiddenException('group_locked');
    }

    const block = await this.blocksRepo
      .createQueryBuilder('b')
      .leftJoin('b.blocker', 'blocker')
      .leftJoin('b.blocked', 'blocked')
      .where('b.groupId = :groupId', { groupId: group.id })
      .andWhere(
        '((blocker.id = :userId AND blocked.id = :creatorId) OR (blocker.id = :creatorId AND blocked.id = :userId))',
        { userId, creatorId: group.creator.id },
      )
      .getOne();

    if (block) {
      throw new ForbiddenException('blocked_in_group');
    }

    const latest = await this.messagesRepo
      .createQueryBuilder('m')
      .leftJoin('m.user', 'u')
      .where('m.groupId = :groupId', { groupId: group.id })
      .andWhere('u.id = :userId', { userId })
      .orderBy('m.createdAt', 'DESC')
      .getOne();

    if (latest && Date.now() - latest.createdAt.getTime() < MESSAGE_MIN_INTERVAL_MS) {
      throw new BadRequestException('message_rate_limited');
    }

    const lastMessages = await this.messagesRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'u')
      .where('m.groupId = :groupId', { groupId: group.id })
      .andWhere('m.status IN (:...visible)', { visible: ['VISIBLE', 'FLAGGED'] })
      .orderBy('m.createdAt', 'DESC')
      .limit(MAX_CONSECUTIVE_MESSAGES)
      .getMany();

    if (
      lastMessages.length >= MAX_CONSECUTIVE_MESSAGES &&
      lastMessages.every((m) => m.user?.id === userId)
    ) {
      throw new BadRequestException('consecutive_message_limit_reached');
    }
  }

  private async ensureParticipant(group: ConversationGroup, user: User) {
    const existing = await this.participantsRepo
      .createQueryBuilder('p')
      .leftJoin('p.group', 'g')
      .leftJoin('p.user', 'u')
      .where('g.id = :groupId', { groupId: group.id })
      .andWhere('u.id = :userId', { userId: user.id })
      .getOne();

    if (existing) {
      if (!existing.active) {
        existing.active = true;
        await this.participantsRepo.save(existing);
      }
      return;
    }

    const participant = this.participantsRepo.create({ group, user, active: true });
    await this.participantsRepo.save(participant);
  }

  async listGroups(eventId: string, query: { q?: string }, viewerId?: string | null) {
    await this.findPublicEvent(eventId);
    const q = this.normalize(query.q);
    const now = new Date();

    const groups = await this.groupsRepo
      .createQueryBuilder('g')
      .leftJoinAndSelect('g.creator', 'creator')
      .leftJoin('g.event', 'event')
      .where('event.id = :eventId', { eventId })
      .andWhere('g.status != :deleted', { deleted: 'DELETED' })
      .andWhere('g.expiresAt > :now', { now })
      .andWhere(q ? 'LOWER(g.title) LIKE LOWER(:q)' : '1=1', { q: `%${q}%` })
      .orderBy('g.createdAt', 'DESC')
      .getMany();

    const result = [] as Array<{
      id: string;
      title: string;
      createdAt: string;
      creator: { id: string; pseudo: string; profileImage: string | null };
      participantCount: number;
      firstMessagePreview: string;
      status: 'OPEN' | 'LOCKED' | 'DELETED';
      options: { lieuRdv: string | null; heureRdv: string | null; contactRdv: string | null };
      joinedByMe: boolean;
    }>;

    for (const group of groups) {
      const [participantCount, firstMessage, joined] = await Promise.all([
        this.participantsRepo
          .createQueryBuilder('p')
          .where('p.groupId = :groupId', { groupId: group.id })
          .andWhere('p.active = :active', { active: true })
          .getCount(),
        this.messagesRepo
          .createQueryBuilder('m')
          .where('m.groupId = :groupId', { groupId: group.id })
          .andWhere('m.status IN (:...visible)', { visible: ['VISIBLE', 'FLAGGED'] })
          .orderBy('m.createdAt', 'ASC')
          .getOne(),
        viewerId
          ? this.participantsRepo
              .createQueryBuilder('p')
              .leftJoin('p.user', 'u')
              .where('p.groupId = :groupId', { groupId: group.id })
              .andWhere('u.id = :viewerId', { viewerId })
              .andWhere('p.active = :active', { active: true })
              .getExists()
          : Promise.resolve(false),
      ]);

      result.push({
        id: group.id,
        title: group.title,
        createdAt: group.createdAt.toISOString(),
        creator: {
          id: group.creator.id,
          pseudo: group.creator.pseudo,
          profileImage: group.creator.profileImage,
        },
        participantCount,
        firstMessagePreview: firstMessage?.content ?? '',
        status: group.status,
        options: {
          lieuRdv: group.lieuRdv,
          heureRdv: group.heureRdv,
          contactRdv: group.contactRdv,
        },
        joinedByMe: !!joined,
      });
    }

    return result;
  }

  async createGroup(eventId: string, dto: CreateConversationGroupDto, creatorId: string) {
    const [event, creator] = await Promise.all([this.findPublicEvent(eventId), this.findUser(creatorId)]);

    if (!creator.isAdmin) {
      const alreadyCreatedGroup = await this.groupsRepo
        .createQueryBuilder('g')
        .leftJoin('g.event', 'event')
        .leftJoin('g.creator', 'creator')
        .where('event.id = :eventId', { eventId })
        .andWhere('creator.id = :creatorId', { creatorId: creator.id })
        .andWhere('g.status != :deleted', { deleted: 'DELETED' })
        .getExists();

      if (alreadyCreatedGroup) {
        throw new BadRequestException('group_creation_limit_reached');
      }
    }

    const firstMessage = this.normalize(dto.firstMessage);
    this.assertMessagePolicy(firstMessage);

    const refDate = event.dateFin ?? event.dateDebut;
    const expiresAt = new Date(refDate.getTime() + 180 * 24 * 60 * 60 * 1000);

    const group = this.groupsRepo.create({
      event,
      creator,
      title: this.normalize(dto.title),
      lieuRdv: this.cleanOptional(dto.lieuRdv),
      heureRdv: this.cleanOptional(dto.heureRdv),
      contactRdv: this.cleanOptional(dto.contactRdv),
      status: 'OPEN',
      expiresAt,
    });

    const savedGroup = await this.groupsRepo.save(group);

    const participant = this.participantsRepo.create({ group: savedGroup, user: creator, active: true });
    await this.participantsRepo.save(participant);

    const message = this.messagesRepo.create({
      group: savedGroup,
      user: creator,
      content: firstMessage,
      status: 'VISIBLE',
      reportCount: 0,
    });
    await this.messagesRepo.save(message);

    return {
      id: savedGroup.id,
      title: savedGroup.title,
      createdAt: savedGroup.createdAt.toISOString(),
      expiresAt: savedGroup.expiresAt.toISOString(),
      status: savedGroup.status,
    };
  }

  async joinGroup(groupId: string, userId: string) {
    const [group, user] = await Promise.all([this.findGroupOrThrow(groupId), this.findUser(userId)]);
    await this.ensureParticipant(group, user);
    return { ok: true };
  }

  async leaveGroup(groupId: string, userId: string) {
    const group = await this.findGroupOrThrow(groupId);
    const participant = await this.participantsRepo
      .createQueryBuilder('p')
      .leftJoin('p.user', 'u')
      .where('p.groupId = :groupId', { groupId: group.id })
      .andWhere('u.id = :userId', { userId })
      .andWhere('p.active = :active', { active: true })
      .getOne();

    if (!participant) {
      return { ok: true };
    }

    participant.active = false;
    await this.participantsRepo.save(participant);
    return { ok: true };
  }

  async deleteGroup(groupId: string, userId: string) {
    const group = await this.findGroupOrThrow(groupId);
    if (group.creator.id !== userId) {
      throw new ForbiddenException('only_creator_can_delete_group');
    }

    group.status = 'DELETED';
    await this.groupsRepo.save(group);
    return { ok: true };
  }

  async listMessages(groupId: string, viewerId: string) {
    const group = await this.findGroupOrThrow(groupId);
    await this.findUser(viewerId);
    await this.assertParticipant(group.id, viewerId);

    const messages = await this.messagesRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'user')
      .where('m.groupId = :groupId', { groupId: group.id })
      .andWhere('m.status IN (:...visible)', { visible: ['VISIBLE', 'FLAGGED'] })
      .orderBy('m.createdAt', 'ASC')
      .getMany();

    const result = [] as Array<{
      id: string;
      content: string;
      createdAt: string;
      status: 'VISIBLE' | 'FLAGGED' | 'HIDDEN' | 'DELETED';
      reportCount: number;
      user: { id: string; pseudo: string; profileImage: string | null };
      likeCount: number;
      likedByMe: boolean;
    }>;

    for (const message of messages) {
      const [likeCount, likedByMe] = await Promise.all([
        this.likesRepo.createQueryBuilder('l').where('l.messageId = :messageId', { messageId: message.id }).getCount(),
        this.likesRepo
          .createQueryBuilder('l')
          .leftJoin('l.user', 'u')
          .where('l.messageId = :messageId', { messageId: message.id })
          .andWhere('u.id = :viewerId', { viewerId })
          .getExists(),
      ]);

      result.push({
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        status: message.status,
        reportCount: message.reportCount,
        user: {
          id: message.user.id,
          pseudo: message.user.pseudo,
          profileImage: message.user.profileImage,
        },
        likeCount,
        likedByMe,
      });
    }

    return result;
  }

  async postMessage(groupId: string, dto: CreateConversationMessageDto, userId: string) {
    const [group, user] = await Promise.all([this.findGroupOrThrow(groupId), this.findUser(userId)]);
    await this.assertParticipant(group.id, user.id);

    const content = this.normalize(dto.content);
    if (!content) {
      throw new BadRequestException('message_empty');
    }

    this.assertMessagePolicy(content);
    await this.assertCanPost(group, user.id);

    const message = this.messagesRepo.create({
      group,
      user,
      content,
      status: 'VISIBLE',
      reportCount: 0,
    });

    const saved = await this.messagesRepo.save(message);

    this.notificationsService
      .createMessageNotification(group.id, group.event.id, group.event.titre, user.id, group.title)
      .catch(() => {});

    return {
      id: saved.id,
      content: saved.content,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async reportMessage(messageId: string, userId: string) {
    await this.findUser(userId);

    const message = await this.messagesRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'user')
      .leftJoinAndSelect('m.group', 'group')
      .where('m.id = :messageId', { messageId })
      .getOne();

    if (!message || message.status === 'DELETED') {
      throw new NotFoundException('message_not_found');
    }

    await this.assertParticipant(message.group.id, userId);

    if (message.user.id === userId) {
      throw new BadRequestException('cannot_report_own_message');
    }

    message.reportCount += 1;
    if (message.reportCount >= FLAG_THRESHOLD && message.status === 'VISIBLE') {
      message.status = 'FLAGGED';
    }

    await this.messagesRepo.save(message);
    return { ok: true, reportCount: message.reportCount, status: message.status };
  }

  async toggleLike(messageId: string, userId: string) {
    const [message, user] = await Promise.all([
      this.messagesRepo
        .createQueryBuilder('m')
        .leftJoinAndSelect('m.group', 'group')
        .where('m.id = :messageId', { messageId })
        .getOne(),
      this.findUser(userId),
    ]);

    if (!message || message.status === 'DELETED') {
      throw new NotFoundException('message_not_found');
    }

    const existing = await this.likesRepo
      .createQueryBuilder('l')
      .leftJoin('l.user', 'u')
      .leftJoin('l.message', 'm')
      .where('m.id = :messageId', { messageId: message.id })
      .andWhere('u.id = :userId', { userId })
      .getOne();

    if (existing) {
      await this.likesRepo.remove(existing);
    } else {
      const like = this.likesRepo.create({ message, user });
      await this.likesRepo.save(like);
    }

    const likeCount = await this.likesRepo.createQueryBuilder('l').where('l.messageId = :id', { id: message.id }).getCount();
    return { ok: true, liked: !existing, likeCount };
  }

}
