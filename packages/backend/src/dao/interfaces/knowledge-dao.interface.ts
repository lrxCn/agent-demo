import { KnowledgeBase } from '../../knowledge/knowledge-base.entity';
import { IBaseDao } from './base-dao.interface';

/** 知识库 DAO */
export type IKnowledgeDao = IBaseDao<KnowledgeBase>;
