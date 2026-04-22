// Protocol constants for the unofficial Gemini Web API.
// Upstream: HanaokaYuzu/Gemini-API (Python) + JimLiu/baoyu-skills TS port. See NOTICE.md.

export const Endpoint = {
  GOOGLE: 'https://www.google.com',
  INIT: 'https://gemini.google.com/app',
  GENERATE:
    'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',
  ROTATE_COOKIES: 'https://accounts.google.com/RotateCookies',
  UPLOAD: 'https://content-push.googleapis.com/upload',
} as const

export const Headers = {
  GEMINI: {
    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    Host: 'gemini.google.com',
    Origin: 'https://gemini.google.com',
    Referer: 'https://gemini.google.com/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Same-Domain': '1',
  },
  ROTATE_COOKIES: {
    'Content-Type': 'application/json',
  },
  UPLOAD: {
    'Push-ID': 'feeds/mcudyrk2a4khkz',
  },
} as const

export const ErrorCode = {
  TEMPORARY_ERROR_1013: 1013,
  USAGE_LIMIT_EXCEEDED: 1037,
  MODEL_INCONSISTENT: 1050,
  MODEL_HEADER_INVALID: 1052,
  IP_TEMPORARILY_BLOCKED: 1060,
} as const

export class Model {
  static readonly UNSPECIFIED = new Model('unspecified', {})
  static readonly G_3_0_PRO = new Model('gemini-3.0-pro', {
    'x-goog-ext-525001261-jspb':
      '[1,null,null,null,"9d8ca3786ebdfbea",null,null,0,[4],null,null,1]',
  })
  static readonly G_3_0_FLASH = new Model('gemini-3.0-flash', {
    'x-goog-ext-525001261-jspb':
      '[1,null,null,null,"fbb127bbb056c959",null,null,0,[4],null,null,1]',
  })
  static readonly G_3_0_FLASH_THINKING = new Model('gemini-3.0-flash-thinking', {
    'x-goog-ext-525001261-jspb':
      '[1,null,null,null,"5bf011840784117a",null,null,0,[4],null,null,1]',
  })
  static readonly G_3_1_PRO_PREVIEW = new Model('gemini-3.1-pro-preview', {})

  static readonly ALL: readonly Model[] = [
    Model.UNSPECIFIED,
    Model.G_3_0_PRO,
    Model.G_3_0_FLASH,
    Model.G_3_0_FLASH_THINKING,
    Model.G_3_1_PRO_PREVIEW,
  ]

  constructor(
    public readonly model_name: string,
    public readonly model_header: Record<string, string>,
  ) {}

  static from_name(name: string): Model {
    for (const model of Model.ALL) if (model.model_name === name) return model
    throw new Error(
      `Unknown model name: ${name}. Available: ${Model.ALL.map((m) => m.model_name).join(', ')}`,
    )
  }
}
