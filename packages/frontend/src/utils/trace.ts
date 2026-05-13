/**
 * W3C Trace Context 生成器
 * 规范：https://www.w3.org/TR/trace-context/
 *
 * 格式：00-<32 字符 hex trace_id>-<16 字符 hex span_id>-01
 *   - 00：version
 *   - 01：flags（采样位，01 表示采样）
 */

const HEX_CHARS = '0123456789abcdef'

/** 生成 N 字符的随机 hex 字符串（用浏览器内置 crypto） */
function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    out += HEX_CHARS[b >> 4] + HEX_CHARS[b & 0x0f]
  }
  return out
}

/** 生成 32 字符 hex trace_id */
export function generateTraceId(): string {
  return randomHex(32)
}

/** 生成 16 字符 hex span_id */
export function generateSpanId(): string {
  return randomHex(16)
}

/**
 * 生成完整 W3C traceparent header 值
 * 可传入已有的 trace_id（如同一次会话内复用）
 */
export function generateTraceparent(traceId?: string): string {
  const tid = traceId ?? generateTraceId()
  const sid = generateSpanId()
  return `00-${tid}-${sid}-01`
}

/**
 * 从 traceparent header 值中提取 trace_id（前端排查用）
 * 解析失败返回空字符串
 */
export function parseTraceId(traceparent: string | null | undefined): string {
  if (!traceparent) {
    return ''
  }
  const parts = traceparent.split('-')
  if (parts.length !== 4 || parts[0] !== '00' || parts[1].length !== 32) {
    return ''
  }
  return parts[1]
}
