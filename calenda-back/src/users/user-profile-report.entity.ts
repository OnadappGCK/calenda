import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_profile_reports')
@Index(['reporter', 'reported'], { unique: true })
export class UserProfileReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  reporter!: User;

  @ManyToOne(() => User, { nullable: false, eager: false, onDelete: 'CASCADE' })
  reported!: User;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
