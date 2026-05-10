import {
  PaginatedResult,
  PaginationQuery,
} from '../interfaces/base-dao.interface';

/** 规范化分页参数，避免非法页码 */
export function resolvePagination(query?: PaginationQuery): {
  page: number;
  pageSize: number;
  skip: number;
  keyword?: string;
} {
  const page = Math.max(1, query?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query?.pageSize ?? 20));
  const skip = (page - 1) * pageSize;
  const keyword = query?.keyword?.trim() || undefined;
  return { page, pageSize, skip, keyword };
}

export function toPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return { items, total, page, pageSize };
}
