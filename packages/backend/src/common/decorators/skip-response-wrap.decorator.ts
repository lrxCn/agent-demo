import { SetMetadata } from '@nestjs/common';

/** 标记该路由的返回值不经 ResponseInterceptor 包装（如 SSE、原始流） */
export const SKIP_RESPONSE_WRAP_KEY = 'skipResponseWrap';

export const SkipResponseWrap = () => SetMetadata(SKIP_RESPONSE_WRAP_KEY, true);
