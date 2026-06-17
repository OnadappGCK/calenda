import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';
import { ConversationParticipant } from '../conversations/conversation-participant.entity';
import { UserNotification } from './user-notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(UserNotification) private readonly repo: Repository<UserNotification>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(ConversationParticipant) private readonly participantsRepo: Repository<ConversationParticipant>,
  ) {}

  private todayDateString() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  private tomorrowDateRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
    return { start, end };
  }

  async getForUser(userId: string) {
    const today = this.todayDateString();
    const { start, end } = this.tomorrowDateRange();

    const user = await this.usersRepo.findOne({ where: { id: userId }, relations: ['favorites'] });
    if (!user) return [];

    const tomorrowFavorites = (user.favorites ?? []).filter((ev) => {
      const d = new Date(ev.dateDebut);
      return d >= start && d <= end;
    });

    for (const ev of tomorrowFavorites) {
      const exists = await this.repo.findOne({
        where: { userId, type: 'FAVORITE_EVENT', eventId: ev.id, notifDate: today },
      });
      if (!exists) {
        const notif = this.repo.create({
          userId,
          type: 'FAVORITE_EVENT',
          eventId: ev.id,
          groupId: null,
          text: `Rappel : "${ev.titre}" a lieu demain !`,
          active: true,
          notifDate: today,
        });
        await this.repo.save(notif);
      }
    }

    const active = await this.repo.find({
      where: { userId, active: true },
      order: { createdAt: 'DESC' },
    });

    return active.map((n) => ({
      id: n.id,
      type: n.type,
      eventId: n.eventId,
      groupId: n.groupId,
      text: n.text,
      active: n.active,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markInactive(id: string, userId: string) {
    const notif = await this.repo.findOne({ where: { id } });
    if (!notif) throw new NotFoundException('notification_not_found');
    if (notif.userId !== userId) throw new ForbiddenException('forbidden');
    notif.active = false;
    await this.repo.save(notif);
    return { ok: true };
  }

  async createMessageNotification(groupId: string, eventId: string, eventTitle: string, senderUserId: string, groupTitle: string) {
    const participants = await this.participantsRepo
      .createQueryBuilder('p')
      .leftJoin('p.user', 'u')
      .where('p.groupId = :groupId', { groupId })
      .andWhere('p.active = :active', { active: true })
      .select(['p.id', 'u.id'])
      .getMany();

    for (const p of participants) {
      if ((p as any).user?.id === senderUserId) continue;
      const recipientId: string = (p as any).user?.id;
      if (!recipientId) continue;

      const notif = this.repo.create({
        userId: recipientId,
        type: 'NEW_MESSAGE',
        eventId,
        groupId,
        text: `Nouveau message dans le groupe "${groupTitle}"`,
        active: true,
        notifDate: null,
      });
      await this.repo.save(notif);
    }
  }
}
