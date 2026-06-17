import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { ConversationGroup } from './conversation-group.entity';

@Entity('conversation_messages')
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ConversationGroup, (group) => group.messages, { nullable: false, eager: false, onDelete: 'CASCADE' })
  group!: ConversationGroup;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'text', default: 'VISIBLE' })
  status!: 'VISIBLE' | 'FLAGGED' | 'HIDDEN' | 'DELETED';

  @Column({ default: 0 })
  reportCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
