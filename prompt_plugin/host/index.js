/**
 * dsh-prompt-gallery — Host half.
 *
 * Owns the durable prompt library (categories + prompts) and the Web API the
 * Client half talks to:
 *
 *   GET    /prompt-gallery/api/state
 *   GET    /prompt-gallery/api/health
 *   POST   /prompt-gallery/api/prompts
 *   PATCH  /prompt-gallery/api/prompts/:id
 *   DELETE /prompt-gallery/api/prompts/:id
 *   POST   /prompt-gallery/api/prompts/:id/use
 *   POST   /prompt-gallery/api/categories
 *   PATCH  /prompt-gallery/api/categories/:id
 *   DELETE /prompt-gallery/api/categories/:id
 *   POST   /prompt-gallery/api/optimize
 *
 * Storage is one JSON document under `$DSH_HOME/prompt-gallery/library.json`
 * (falls back to `~/.dsh/prompt-gallery/library.json`). Writes are atomic and
 * serialized; reads are served from memory after the first load.
 *
 * The Host half imports only Node builtins so it never depends on the
 * deployment's package layout; optional services (`llm`, `agentDefaultModel`)
 * are reached through `ctx.get(...)`.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Web route prefix owned by this plugin (distinct from `/api`). */
const API_PREFIX = '/prompt-gallery/api';
/** JSON request body hard cap. */
const MAX_BODY_BYTES = 512 * 1024;
/** Stored prompt body cap. */
const MAX_PROMPT_BODY = 20000;
/** Input accepted by the optimizer; longer prompts are rejected. */
const MAX_OPTIMIZE_INPUT = 8000;
/** Optimizer call budget. */
const OPTIMIZE_TIMEOUT_MS = 120000;
/** Library document schema version. */
const LIBRARY_VERSION = 1;
/** Host API contract revision, surfaced by /health (also used to verify HMR reloads). */
const API_VERSION = 3;

/** Canonical category that always exists and cannot be removed. */
const UNCATEGORIZED_ID = 'uncategorized';

/** Seed categories per supported client locale. */
const SEED_CATEGORIES = {
  zh: [
    ['writing', '写作'],
    ['coding', '编程'],
    ['translation', '翻译'],
    ['analysis', '分析'],
    ['office', '办公'],
    [UNCATEGORIZED_ID, '未分类'],
  ],
  en: [
    ['writing', 'Writing'],
    ['coding', 'Coding'],
    ['translation', 'Translation'],
    ['analysis', 'Analysis'],
    ['office', 'Productivity'],
    [UNCATEGORIZED_ID, 'Uncategorized'],
  ],
};

/** One API failure carrying its HTTP status and machine-readable code. */
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Shape one seed category record. */
function seedCategory(id, name, order) {
  return {
    id,
    name,
    description: '',
    order,
    builtin: id === UNCATEGORIZED_ID ? 'protected' : 'seed',
    createdAt: Date.now(),
  };
}

/** Build the initial document for a locale. */
function createDocument(locale) {
  const rows = SEED_CATEGORIES[locale === 'en' ? 'en' : 'zh'];
  return {
    version: LIBRARY_VERSION,
    categories: rows.map(([id, name], index) => seedCategory(id, name, index)),
    prompts: [],
  };
}

/** Clamp and clean a stored string. */
function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/** Normalize tags from an arbitrary input value. */
function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tags = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().slice(0, 40);
    if (tag === '' || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= 20) break;
  }
  return tags;
}

/** Normalized body used for duplicate detection. */
function bodyFingerprint(body) {
  return body.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Validate and normalize one stored prompt, dropping malformed records. */
function normalizePrompt(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : undefined;
  const body = typeof raw.body === 'string' ? raw.body : '';
  if (id === undefined || body.trim() === '') return null;
  const title = cleanText(typeof raw.title === 'string' ? raw.title : '', 200).trim();
  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  return {
    id,
    title: title === '' ? body.trim().slice(0, 40) : title,
    description: cleanText(typeof raw.description === 'string' ? raw.description : '', 2000),
    body: cleanText(body, MAX_PROMPT_BODY),
    categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : UNCATEGORIZED_ID,
    tags: normalizeTags(raw.tags),
    origin: raw.origin === 'chat' ? 'chat' : 'manual',
    createdAt,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt,
    useCount: Number.isFinite(raw.useCount) && raw.useCount >= 0 ? Math.floor(raw.useCount) : 0,
    lastUsedAt: Number.isFinite(raw.lastUsedAt) ? raw.lastUsedAt : 0,
  };
}

/** Validate one stored category, dropping malformed records. */
function normalizeCategory(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  const name = cleanText(typeof raw.name === 'string' ? raw.name : '', 80).trim();
  if (name === '') return null;
  return {
    id: raw.id,
    name,
    description: cleanText(typeof raw.description === 'string' ? raw.description : '', 500),
    order: Number.isFinite(raw.order) ? raw.order : 0,
    builtin: typeof raw.builtin === 'string' ? raw.builtin : 'custom',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

/**
 * Normalize a whole loaded document: guarantees the protected category, unique
 * ids, and prompts pointing at an existing category.
 */
function normalizeDocument(raw, locale) {
  const document =
    raw === null || typeof raw !== 'object'
      ? createDocument(locale)
      : {
          version: LIBRARY_VERSION,
          categories: Array.isArray(raw.categories) ? raw.categories : [],
          prompts: Array.isArray(raw.prompts) ? raw.prompts : [],
        };
  const categories = [];
  const categoryIds = new Set();
  for (const candidate of document.categories.map(normalizeCategory)) {
    if (candidate === null || categoryIds.has(candidate.id)) continue;
    categoryIds.add(candidate.id);
    categories.push(candidate);
  }
  if (!categoryIds.has(UNCATEGORIZED_ID)) {
    const fallback = SEED_CATEGORIES[locale === 'en' ? 'en' : 'zh'].find(
      ([id]) => id === UNCATEGORIZED_ID,
    );
    categories.push(seedCategory(UNCATEGORIZED_ID, fallback ? fallback[1] : 'Uncategorized', categories.length));
    categoryIds.add(UNCATEGORIZED_ID);
  }
  categories.sort((left, right) => left.order - right.order);
  const prompts = [];
  const promptIds = new Set();
  for (const candidate of document.prompts.map(normalizePrompt)) {
    if (candidate === null || promptIds.has(candidate.id)) continue;
    promptIds.add(candidate.id);
    if (!categoryIds.has(candidate.categoryId)) candidate.categoryId = UNCATEGORIZED_ID;
    prompts.push(candidate);
  }
  prompts.sort((left, right) => right.updatedAt - left.updatedAt);
  return { version: LIBRARY_VERSION, categories, prompts };
}

/** Resolve the library directory for this profile. */
function resolveDataFile() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh');
  return join(home, 'prompt-gallery', 'library.json');
}

/**
 * Durable library store: one JSON document, loaded once, mutated in memory and
 * persisted atomically with serialized writes.
 */
function createStore() {
  const file = resolveDataFile();
  // Locale used only when the document does not exist yet (first run).
  let seedLocale = 'zh';
  let document = null;
  let loading = null;
  let writeChain = Promise.resolve();

  /** Load (or seed) the document once. */
  async function ensureLoaded() {
    if (document !== null) return document;
    if (loading !== null) return loading;
    loading = (async () => {
      let raw = null;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch (error) {
        if (error && error.code !== 'ENOENT') {
          // A corrupt document must not brick the plugin: keep a copy aside.
          try {
            await rename(file, `${file}.broken-${Date.now()}`);
          } catch {
            /* best effort */
          }
        }
        raw = null;
      }
      document = normalizeDocument(raw, seedLocale);
      await persist(document);
      return document;
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }

  /** Persist one document atomically. */
  async function persist(next) {
    await mkdir(join(file, '..'), { recursive: true });
    const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(temporary, file);
  }

  /** Run one mutation behind the write chain. */
  function mutate(operation) {
    const run = writeChain.then(async () => {
      const current = await ensureLoaded();
      const outcome = await operation(current);
      const next = normalizeDocument(outcome.document, seedLocale);
      document = next;
      await persist(next);
      return outcome.result;
    });
    writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    file,
    async state(locale = 'zh') {
      seedLocale = locale === 'en' ? 'en' : 'zh';
      const current = await ensureLoaded();
      return {
        version: current.version,
        categories: current.categories,
        prompts: current.prompts,
      };
    },
    async createPrompt(input) {
      const body = cleanText(input.body, MAX_PROMPT_BODY).trim();
      if (body === '') throw new ApiError(400, 'empty-body', 'prompt body is required');
      const fingerprint = bodyFingerprint(body);
      return mutate((current) => {
        const duplicate = current.prompts.find((prompt) => bodyFingerprint(prompt.body) === fingerprint);
        if (duplicate !== undefined) {
          return { document: current, result: { duplicate: true, prompt: duplicate } };
        }
        const now = Date.now();
        const categoryId = current.categories.some((category) => category.id === input.categoryId)
          ? input.categoryId
          : UNCATEGORIZED_ID;
        const prompt = {
          id: `p-${randomUUID()}`,
          title: cleanText(input.title, 200).trim() || body.slice(0, 40),
          description: cleanText(input.description, 2000),
          body,
          categoryId,
          tags: normalizeTags(input.tags),
          origin: input.origin === 'chat' ? 'chat' : 'manual',
          createdAt: now,
          updatedAt: now,
          useCount: 0,
          lastUsedAt: 0,
        };
        const document = {
          ...current,
          prompts: [prompt, ...current.prompts],
        };
        return { document, result: { duplicate: false, prompt } };
      });
    },
    async updatePrompt(id, patch) {
      return mutate((current) => {
        const existing = current.prompts.find((prompt) => prompt.id === id);
        if (existing === undefined) throw new ApiError(404, 'prompt-not-found', 'prompt not found');
        const body =
          patch.body === undefined ? existing.body : cleanText(patch.body, MAX_PROMPT_BODY).trim();
        if (body === '') throw new ApiError(400, 'empty-body', 'prompt body is required');
        const categoryId =
          patch.categoryId === undefined
            ? existing.categoryId
            : current.categories.some((category) => category.id === patch.categoryId)
              ? patch.categoryId
              : UNCATEGORIZED_ID;
        const updated = {
          ...existing,
          title:
            patch.title === undefined
              ? existing.title
              : cleanText(patch.title, 200).trim() || body.slice(0, 40),
          description:
            patch.description === undefined
              ? existing.description
              : cleanText(patch.description, 2000),
          body,
          categoryId,
          tags: patch.tags === undefined ? existing.tags : normalizeTags(patch.tags),
          updatedAt: Date.now(),
        };
        const document = {
          ...current,
          prompts: current.prompts.map((prompt) => (prompt.id === id ? updated : prompt)),
        };
        return { document, result: { prompt: updated } };
      });
    },
    async deletePrompt(id) {
      return mutate((current) => {
        if (!current.prompts.some((prompt) => prompt.id === id)) {
          throw new ApiError(404, 'prompt-not-found', 'prompt not found');
        }
        const document = {
          ...current,
          prompts: current.prompts.filter((prompt) => prompt.id !== id),
        };
        return { document, result: { removed: id } };
      });
    },
    async markUsed(id) {
      return mutate((current) => {
        const existing = current.prompts.find((prompt) => prompt.id === id);
        if (existing === undefined) throw new ApiError(404, 'prompt-not-found', 'prompt not found');
        const updated = {
          ...existing,
          useCount: existing.useCount + 1,
          lastUsedAt: Date.now(),
        };
        const document = {
          ...current,
          prompts: current.prompts.map((prompt) => (prompt.id === id ? updated : prompt)),
        };
        return { document, result: { prompt: updated } };
      });
    },
    async createCategory(input) {
      const name = cleanText(input.name, 80).trim();
      if (name === '') throw new ApiError(400, 'empty-name', 'category name is required');
      return mutate((current) => {
        const category = {
          id: `c-${randomUUID()}`,
          name,
          description: cleanText(input.description, 500),
          order: current.categories.length,
          builtin: 'custom',
          createdAt: Date.now(),
        };
        const document = { ...current, categories: [...current.categories, category] };
        return { document, result: { category } };
      });
    },
    async updateCategory(id, patch) {
      return mutate((current) => {
        const existing = current.categories.find((category) => category.id === id);
        if (existing === undefined) throw new ApiError(404, 'category-not-found', 'category not found');
        const name =
          patch.name === undefined ? existing.name : cleanText(patch.name, 80).trim();
        if (name === '') throw new ApiError(400, 'empty-name', 'category name is required');
        const updated = {
          ...existing,
          name,
          description:
            patch.description === undefined
              ? existing.description
              : cleanText(patch.description, 500),
          order: Number.isFinite(patch.order) ? patch.order : existing.order,
        };
        const document = {
          ...current,
          categories: current.categories.map((category) => (category.id === id ? updated : category)),
        };
        return { document, result: { category: updated } };
      });
    },
    async deleteCategory(id) {
      if (id === UNCATEGORIZED_ID) {
        throw new ApiError(400, 'protected-category', 'the uncategorized category cannot be removed');
      }
      return mutate((current) => {
        if (!current.categories.some((category) => category.id === id)) {
          throw new ApiError(404, 'category-not-found', 'category not found');
        }
        const moved = [];
        const prompts = current.prompts.map((prompt) => {
          if (prompt.categoryId !== id) return prompt;
          moved.push(prompt.id);
          return { ...prompt, categoryId: UNCATEGORIZED_ID, updatedAt: Date.now() };
        });
        const document = {
          ...current,
          categories: current.categories.filter((category) => category.id !== id),
          prompts,
        };
        return { document, result: { removed: id, moved } };
      });
    },
  };
}

/** Write one JSON response. */
function sendJson(res, status, payload) {
  if (res.headersSent === true) {
    res.destroy?.();
    return;
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

/** Write one failure response. */
function sendError(res, error) {
  if (error instanceof ApiError) {
    sendJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } });
    return;
  }
  const message = error instanceof Error ? error.message : 'internal error';
  sendJson(res, 500, { ok: false, error: { code: 'internal', message } });
}

/** Read one JSON request body with a size cap. */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new ApiError(413, 'body-too-large', 'request body too large');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid-json', 'request body is not valid JSON');
  }
}

/** Extract the hostname of a request Host header. */
function hostnameOf(host) {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True for the loopback authorities this deployment serves by default. */
function isLoopbackHostname(hostname) {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

/**
 * Browser-trust fence for the plugin API: same-origin browser calls and
 * loopback tools are accepted, cross-site requests are not.
 */
function isTrustedRequest(req) {
  const host = req.headers.host;
  if (typeof host !== 'string' || host === '') return false;
  const hostname = hostnameOf(host);
  if (hostname === null) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== '') {
    try {
      const originHostname = new URL(origin).hostname.toLowerCase();
      return originHostname === hostname;
    } catch {
      return false;
    }
  }
  return isLoopbackHostname(hostname);
}

/** Build the optimizer system prompt for one locale. */
function optimizerSystemPrompt(locale) {
  if (locale === 'en') {
    return [
      'You are a senior prompt engineer. Rewrite the user-provided prompt into a higher-quality prompt.',
      'Rules:',
      '1. Preserve the original intent, facts and constraints. Do not invent facts. Keep any {{placeholder}} variables unchanged.',
      '2. Add the structure the task needs: role/background, goal, inputs, constraints and prohibitions, expected output format. Do not distort the original intent just to fill a template.',
      '3. If the original is already clear, only tighten and correct it; do not pad it.',
      '4. Output only the optimized prompt body. No explanations, no headings, no Markdown code fences, no "Optimized:" prefix.',
      '5. Answer in the same language as the original prompt.',
      '6. Finish the prompt completely; never stop mid-sentence or with an ellipsis.',
    ].join('\n');
  }
  return [
    '你是一名资深提示词工程师。请把用户提供的提示词改写成更高质量的提示词。',
    '规则：',
    '1. 保留原始意图、事实与限制，不要虚构事实；保留 {{占位符}} 变量不变。',
    '2. 补全任务需要的结构：角色/背景、目标、输入、约束与禁止项、期望输出格式；不要为了套模板而扭曲原意。',
    '3. 如果原文已经很清晰，只做精炼与纠错，不要为凑长度而扩写。',
    '4. 只输出优化后的提示词正文，不要输出解释、标题、Markdown 代码围栏或“优化后：”等前缀。',
    '5. 使用与原提示词相同的语言输出。',
    '6. 必须输出完整的提示词，不要出现中途截断或省略号结尾。',
  ].join('\n');
}

/** Resolve the provider/model used by the optimizer. */
function resolveOptimizeModel(ctx, input) {
  const llm = ctx.get('llm');
  if (llm === undefined || llm === null) {
    throw new ApiError(503, 'llm-unavailable', 'LLM service is not available in this deployment');
  }
  let provider = typeof input.provider === 'string' ? input.provider.trim() : '';
  let model = typeof input.model === 'string' ? input.model.trim() : '';
  let reasoningEffort =
    typeof input.reasoningEffort === 'string' && input.reasoningEffort !== ''
      ? input.reasoningEffort
      : undefined;
  if (provider === '' || model === '') {
    const defaultModel = ctx.get('agentDefaultModel');
    const selection =
      defaultModel !== undefined && defaultModel !== null && typeof defaultModel.currentSelection === 'function'
        ? defaultModel.currentSelection()
        : undefined;
    if (selection !== undefined && selection !== null) {
      provider = selection.provider;
      model = selection.model;
      if (reasoningEffort === undefined && typeof selection.reasoningEffort === 'string') {
        reasoningEffort = selection.reasoningEffort;
      }
    }
  }
  if (provider === '' || model === '') {
    throw new ApiError(503, 'model-unavailable', 'no model is selected for this session');
  }
  return { llm, provider, model, reasoningEffort };
}

/** Stream one optimized prompt out of the LLM service. */
async function optimizePrompt(ctx, input) {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text === '') throw new ApiError(400, 'empty-text', 'prompt text is required');
  if (text.length > MAX_OPTIMIZE_INPUT) {
    throw new ApiError(
      413,
      'text-too-long',
      `prompt text is too long (max ${MAX_OPTIMIZE_INPUT} characters)`,
    );
  }
  const { llm, provider, model, reasoningEffort } = resolveOptimizeModel(ctx, input);
  const locale = input.locale === 'en' ? 'en' : 'zh';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPTIMIZE_TIMEOUT_MS);
  try {
    const message = {
      id: `pg-${randomUUID()}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    };
    const maxTokens = Math.min(8192, Math.max(3072, Math.ceil(text.length * 2.5)));
    let optimized = '';
    const stream = llm.stream({
      provider,
      model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      system: optimizerSystemPrompt(locale),
      messages: [message],
      temperature: 0.3,
      maxTokens,
      signal: controller.signal,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        optimized += chunk.text;
        continue;
      }
      if (chunk.type === 'finish') {
        const reason = chunk.reason;
        if (reason.kind === 'error') {
          throw new ApiError(
            502,
            'llm-error',
            reason.failure && reason.failure.message ? reason.failure.message : 'model call failed',
          );
        }
        if (reason.kind === 'aborted') throw new ApiError(504, 'llm-aborted', 'model call was cancelled');
      }
    }
    const result = optimized.trim();
    if (result === '') throw new ApiError(502, 'empty-result', 'the model returned an empty result');
    return { optimized: result, provider, model };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error && error.name === 'AbortError') {
      throw new ApiError(504, 'llm-timeout', 'model call timed out');
    }
    throw new ApiError(502, 'llm-error', error instanceof Error ? error.message : 'model call failed');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Host plugin entry: mount the API routes and keep them disposed with the
 * plugin fiber. `webServer` is a hard dependency; LLM-related services are
 * optional and reported through the optimizer route.
 */
export const inject = ['webServer'];

export function apply(ctx) {
  const store = createStore();
  // Latest self-reported Client diagnostics (in-memory only). The Client half
  // periodically reports which components mounted and how many capture
  // buttons it installed, so a broken render is observable from /health.
  const diagnostics = { at: 0, payload: null };
  ctx.logger?.info?.('dsh-prompt-gallery: library file is %s', store.file);

  const handler = async (req, res) => {
    try {
      if (!isTrustedRequest(req)) {
        throw new ApiError(403, 'forbidden', 'request is not trusted');
      }
      const url = new URL(req.url ?? '/', 'http://dsh.internal');
      if (!url.pathname.startsWith(API_PREFIX)) {
        throw new ApiError(404, 'not-found', 'unknown route');
      }
      const suffix = url.pathname.slice(API_PREFIX.length);
      const segments = suffix
        .split('/')
        .filter((segment) => segment !== '')
        .map((segment) => decodeURIComponent(segment));
      const method = req.method ?? 'GET';

      if (method === 'GET' && (segments.length === 0 || (segments.length === 1 && segments[0] === 'state'))) {
        const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'zh';
        const document = await store.state(locale);
        sendJson(res, 200, { ok: true, ...document });
        return;
      }

      if (method === 'GET' && segments.length === 1 && segments[0] === 'health') {
        sendJson(res, 200, {
          ok: true,
          file: store.file,
          api: API_VERSION,
          clientAt: diagnostics.at,
          client: diagnostics.payload,
        });
        return;
      }

      if (method === 'POST' && segments.length === 1 && segments[0] === 'presence') {
        const body = await readJsonBody(req);
        const number = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
        const flag = (value) => value === true;
        diagnostics.at = Date.now();
        diagnostics.payload = {
          toolbar: flag(body.toolbar),
          overlay: flag(body.overlay),
          captureButtons: number(body.captureButtons),
          userRows: number(body.userRows),
          locale: typeof body.locale === 'string' ? body.locale.slice(0, 8) : '',
        };
        sendJson(res, 200, { ok: true });
        return;
      }

      if (segments[0] === 'optimize' && segments.length === 1 && method === 'POST') {
        const body = await readJsonBody(req);
        const result = await optimizePrompt(ctx, body);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (segments[0] === 'prompts') {
        if (segments.length === 1 && method === 'POST') {
          const body = await readJsonBody(req);
          const result = await store.createPrompt(body);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        if (segments.length === 2 && method === 'PATCH') {
          const body = await readJsonBody(req);
          const result = await store.updatePrompt(segments[1], body);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        if (segments.length === 2 && method === 'DELETE') {
          const result = await store.deletePrompt(segments[1]);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        if (segments.length === 3 && segments[2] === 'use' && method === 'POST') {
          const result = await store.markUsed(segments[1]);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
      }

      if (segments[0] === 'categories') {
        if (segments.length === 1 && method === 'POST') {
          const body = await readJsonBody(req);
          const result = await store.createCategory(body);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        if (segments.length === 2 && method === 'PATCH') {
          const body = await readJsonBody(req);
          const result = await store.updateCategory(segments[1], body);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
        if (segments.length === 2 && method === 'DELETE') {
          const result = await store.deleteCategory(segments[1]);
          sendJson(res, 200, { ok: true, ...result });
          return;
        }
      }

      throw new ApiError(404, 'not-found', 'unknown route');
    } catch (error) {
      sendError(res, error);
    }
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler,
      }),
    'dsh-prompt-gallery: /prompt-gallery/api routes',
  );
}
