// Upstream: HanaokaYuzu/Gemini-API TS port. See NOTICE.md.

export function get_nested_value<T = unknown>(data: unknown, path: number[], def?: T): T {
  let cur: unknown = data
  for (const k of path) {
    if (!Array.isArray(cur)) return def as T
    cur = cur[k]
    if (cur === undefined) return def as T
  }
  if (cur == null && def !== undefined) return def as T
  return cur as T
}

export function extract_json_from_response(text: string): unknown {
  if (typeof text !== 'string') {
    throw new TypeError(`Expected string, got ${typeof text}`)
  }
  let last: unknown = undefined
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      last = JSON.parse(trimmed)
    } catch {}
  }
  if (last === undefined) {
    throw new Error('Could not find a valid JSON object or array in the response.')
  }
  return last
}

export function collect_strings(
  root: unknown,
  accept: (s: string) => boolean,
  limit = 20,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const stack: unknown[] = [root]
  while (stack.length > 0 && out.length < limit) {
    const v = stack.pop()
    if (typeof v === 'string') {
      if (accept(v) && !seen.has(v)) {
        seen.add(v)
        out.push(v)
      }
      continue
    }
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) stack.push(v[i])
      continue
    }
    if (v && typeof v === 'object') {
      for (const val of Object.values(v as Record<string, unknown>)) stack.push(val)
    }
  }
  return out
}
