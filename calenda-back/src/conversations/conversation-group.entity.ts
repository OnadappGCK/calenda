import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';
import { ConversationMessage } from './conversation-message.entity';
import { ConversationParticipant } from './conversation-participant.entity';

@Entity('conversation_groups')
export class ConversationGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Event, { nullable: false, eager: false, onDelete: 'CASCADE' })
  event!: Event;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  creator!: User;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  villeDepart!: string | null;

  @Column({ type: 'text', nullable: true })
  trancheAge!: string | null;

  @Column({ type: 'text', nullable: true })
  ambiance!: string | null;

  @Column({ type: 'text', default: 'OPEN' })
  status!: 'OPEN' | 'LOCKED' | 'DELETED';

  @Column()
  expiresAt!: Date;

  @OneToMany(() => ConversationMessage, (message) => message.group, { cascade: false })
  messages!: ConversationMessage[];

  @OneToMany(() => ConversationParticipant, (participant) => participant.group, { cascade: false })
  participants!: ConversationParticipant[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
