import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column('jsonb', { nullable: true })
  keywords?: string[];
}
