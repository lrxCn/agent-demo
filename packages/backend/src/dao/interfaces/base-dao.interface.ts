/** 分页查询参数 */
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 通用 CRUD DAO 接口 */
export interface IBaseDao<T> {
  findById(id: string): Promise<T | null>;
  findAll(query?: PaginationQuery): Promise<PaginatedResult<T>>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
