import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('news')
/** Entité TypeORM représentant une news (titre, texte, image, date de publication). */
export class News {
  @PrimaryGeneratedColumn('uuid')
  /** Identifiant unique UUID. */
  id!: string;

  @Column()
  /** Titre de la news. */
  titre!: string;

  @Column({ type: 'date' })
  /** Date de publication (format date). */
  datePublication!: string;

  @Column({ type: 'text' })
  /** Contenu texte. */
  texte!: string;

  @Column({ type: 'text', nullable: true })
  /** URL/chemin d'image (optionnel). */
  image!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
