import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type NotificationType = 'FAVORITE_EVENT' | 'NEW_MESSAGE';

@Entity('user_notifications')
export class UserNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column()
  type!: NotificationType;

  @Column({ nullable: true, type: 'text' })
  eventId!: string | null;

  @Column({ nullable: true, type: 'text' })
  groupId!: string | null;

  @Column({ type: 'text' })
  text!: string;

  @Column({ default: true })
  active!: boolean;

  /** Date YYYY-MM-DD utilisée pour éviter les doublons de FAVORITE_EVENT. */
  @Column({ nullable: true, type: 'text' })
  notifDate!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
