import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { ConversationGroup } from './conversation-group.entity';

@Entity('conversation_participants')
@Index(['group', 'user'], { unique: true })
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ConversationGroup, (group) => group.participants, { nullable: false, eager: false, onDelete: 'CASCADE' })
  group!: ConversationGroup;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  user!: User;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
