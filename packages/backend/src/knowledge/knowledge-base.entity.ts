import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../role/role.entity';

/** knowledge_bases 表 */
@Entity('knowledge_bases')
export class KnowledgeBase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'file_name', type: 'text', nullable: true })
  fileName: string | null;

  @Column({ name: 'file_type', type: 'text', nullable: true })
  fileType: string | null;

  @Column({ name: 'qdrant_collection', type: 'text', nullable: true })
  qdrantCollection: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToMany(() => Role, (role) => role.knowledgeBases)
  @JoinTable({
    name: 'knowledge_base_roles',
    joinColumn: { name: 'knowledge_base_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: Role[];
}
