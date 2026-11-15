import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const derive = promisify(scrypt);
const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const secure = new URL(origin).protocol === 'https:';
const cookieName = 'todo_session';
const lifetime = 7 * 24 * 60 * 60;
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'Ожидается JSON.');
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new HttpError(413, 'Слишком большой запрос.'); chunks.push(chunk); }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new HttpError(400, 'Некорректный JSON.'); }
}
function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new HttpError(400, 'Неизвестное поле запроса.');
}
function credentials(value: Record<string, unknown>) {
  fields(value, ['email', 'password']);
  const { email, password } = value;
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new HttpError(400, 'Введите корректный email.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new HttpError(400, 'Пароль должен содержать от 8 до 128 символов.');
  return { email: email.trim().toLowerCase(), password };
}
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
async function validPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(':');
  const actual = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
function tokenFrom(req: IncomingMessage) {
  return (req.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
}
function cookie(res: ServerResponse, token: string, age: number) {
  res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}${secure ? '; Secure' : ''}`);
}
async function session(req: IncomingMessage) {
  const token = tokenFrom(req);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'Войдите в аккаунт.');
  const found = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: { id: true, email: true } } } });
  if (!found || found.expiresAt <= new Date()) throw new HttpError(401, 'Войдите в аккаунт.');
  return found;
}
async function openSession(req: IncomingMessage, res: ServerResponse, userId: string) {
  const token = randomBytes(32).toString('hex');
  await db.$transaction([
    db.session.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, { tokenHash: tokenHash(tokenFrom(req)) }] } }),
    db.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt: new Date(Date.now() + lifetime * 1000) } }),
  ]);
  cookie(res, token, lifetime);
}
// Ограничение перебора в одном процессе; не доверяем присланным X-Forwarded-For.
const attempts = new Map<string, { count: number; until: number }>();
const cleanup = setInterval(() => { for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key); }, 60000);
cleanup.unref();
function limit(req: IncomingMessage) {
  const key = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now(); let value = attempts.get(key);
  if (!value || value.until < now) { value = { count: 0, until: now + 60000 }; attempts.set(key, value); }
  if (++value.count > 20) throw new HttpError(429, 'Слишком много попыток. Повторите через минуту.');
}
function todoData(value: Record<string, unknown>, partial: boolean) {
  fields(value, ['title', 'description', 'completed']);
  const data: { title?: string; description?: string; completed?: boolean } = {};
  if (!partial || 'title' in value) {
    if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 200) throw new HttpError(400, 'Заголовок должен содержать от 1 до 200 символов.');
    data.title = value.title.trim();
  }
  if ('description' in value) {
    if (typeof value.description !== 'string' || value.description.length > 2000) throw new HttpError(400, 'Описание — не более 2000 символов.');
    data.description = value.description.trim();
  }
  if ('completed' in value) {
    if (typeof value.completed !== 'boolean') throw new HttpError(400, 'Некорректная отметка выполнения.');
    data.completed = value.completed;
  }
  if (partial && !Object.keys(data).length) throw new HttpError(400, 'Нет изменений.');
  return data;
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const method = req.method ?? 'GET';
    if (!['GET', 'HEAD'].includes(method) && req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, 'Недопустимый источник запроса.');
    if (path === '/api/health' && method === 'GET') { await db.$queryRaw`SELECT 1`; send(res, 200, { ok: true }); return; }
    if (['/api/register', '/api/login'].includes(path) && method === 'POST') {
      limit(req);
      const { email, password } = credentials(await body(req));
      if (path === '/api/register') {
        const user = await db.user.create({ data: { email, passwordHash: await hashPassword(password) }, select: { id: true, email: true } });
        await openSession(req, res, user.id); send(res, 201, user); return;
      }
      const user = await db.user.findUnique({ where: { email } });
      const valid = await validPassword(password, user?.passwordHash ?? dummyHash);
      if (!user || !valid) throw new HttpError(401, 'Неверный email или пароль.');
      await openSession(req, res, user.id); send(res, 200, { id: user.id, email: user.email }); return;
    }
    const current = await session(req);
    if (path === '/api/me' && method === 'GET') { send(res, 200, current.user); return; }
    if (path === '/api/logout' && method === 'POST') {
      await db.session.deleteMany({ where: { tokenHash: current.tokenHash } }); cookie(res, '', 0); send(res, 200, { ok: true }); return;
    }
    if (path === '/api/todos' && method === 'GET') {
      send(res, 200, await db.todo.findMany({ where: { userId: current.userId }, orderBy: { id: 'asc' } })); return;
    }
    if (path === '/api/todos' && method === 'POST') {
      const data = todoData(await body(req), false);
      send(res, 201, await db.todo.create({ data: { ...data, title: data.title!, userId: current.userId } })); return;
    }
    const match = /^\/api\/todos\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(path);
    if (match && ['PATCH', 'DELETE'].includes(method)) {
      const where = { id: match[1], userId: current.userId };
      if (method === 'DELETE') {
        const result = await db.todo.deleteMany({ where });
        if (!result.count) throw new HttpError(404, 'Задача не найдена.');
        send(res, 200, { ok: true }); return;
      }
      const result = await db.todo.updateMany({ where, data: todoData(await body(req), true) });
      if (!result.count) throw new HttpError(404, 'Задача не найдена.');
      send(res, 200, await db.todo.findFirst({ where })); return;
    }
    throw new HttpError(404, 'Страница не найдена.');
  } catch (error) {
    if (error instanceof HttpError) { send(res, error.status, { error: error.message }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { send(res, 409, { error: 'Этот email уже зарегистрирован.' }); return; }
    console.error('Ошибка обработки запроса:', error instanceof Error ? error.name : 'Unknown');
    send(res, 500, { error: 'Ошибка сервера. Попробуйте ещё раз.' });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
await db.$connect();
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log('Backend запущен на порту 3000'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => { void db.$disconnect().then(() => process.exit(0)); }); });
