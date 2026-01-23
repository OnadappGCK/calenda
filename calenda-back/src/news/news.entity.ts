import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('news')
export class News {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  titre!: string;

  @Column({ type: 'date' })
  datePublication!: string;

  @Column({ type: 'text' })
  texte!: string;

  @Column({ type: 'text', nullable: true })
  image!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
