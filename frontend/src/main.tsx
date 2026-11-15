import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
type User = { id: string; email: string };
type Todo = { id: string; title: string; description: string; completed: boolean };
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const value = await res.json();
  if (!res.ok) throw new ApiError(res.status, value.error ?? 'Не удалось выполнить запрос.');
  return value as T;
}
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const resetForm = () => { setTitle(''); setDescription(''); setEditing(null); };
  const handleError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) { setUser(null); setTodos([]); resetForm(); }
    setError(err instanceof ApiError ? err.message : 'Не удалось связаться с сервером. Попробуйте ещё раз.');
  };
  async function load() { setTodos(await api<Todo[]>('/todos')); }
  useEffect(() => { void (async () => {
    try { const me = await api<User>('/me'); setUser(me); await load(); }
    catch (err) { if (!(err instanceof ApiError && err.status === 401)) handleError(err); }
    finally { setReady(true); }
  })(); }, []);
  async function auth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try { const me = await api<User>(`/${mode}`, 'POST', { email: data.get('email'), password: data.get('password') }); setUser(me); await load(); }
    catch (err) { handleError(err); } finally { setBusy(false); }
  }
  async function action(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); } catch (err) { handleError(err); } finally { setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void action(async () => {
      if (editing) { const updated = await api<Todo>(`/todos/${editing}`, 'PATCH', { title, description }); setTodos(items => items.map(item => item.id === updated.id ? updated : item)); }
      else { const created = await api<Todo>('/todos', 'POST', { title, description }); setTodos(items => [...items, created]); }
      resetForm();
    });
  }
  if (!ready) return <main className="mx-auto max-w-2xl px-5 py-16"><p role="status">Загрузка…</p></main>;
  return <main className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Todo List</p><h1 className="text-3xl font-semibold tracking-tight">{user ? 'Мои задачи' : mode === 'login' ? 'Вход' : 'Регистрация'}</h1>
      <p className="mt-2 break-all text-sm text-slate-500">{user ? user.email : 'Ваши задачи — в одном месте.'}</p></div>
      {user && <button className="secondary" disabled={busy} onClick={() => void action(async () => { await api('/logout', 'POST'); setUser(null); setTodos([]); resetForm(); })}>Выйти</button>}
    </header>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
    {!user ? <section className="panel">
      <form onSubmit={auth} className="space-y-5">
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} /></label>
        <label>Пароль<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={128} required disabled={busy} /><span className="mt-1 block text-xs font-normal text-slate-500">От 8 до 128 символов</span></label>
        <button className="primary w-full" disabled={busy}>{busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">{mode === 'login' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}<button className="text-emerald-700 underline underline-offset-4" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Регистрация' : 'Войти'}</button></p>
    </section> : <>
      <section className="panel mb-7"><h2 className="mb-4 text-lg font-semibold">{editing ? 'Редактировать задачу' : 'Новая задача'}</h2>
        <form onSubmit={save} className="space-y-4">
          <label>Заголовок<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} disabled={busy} placeholder="Что нужно сделать?" /></label>
          <label>Описание <span className="font-normal text-slate-400">(необязательно)</span><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={3} disabled={busy} /></label>
          <div className="flex flex-wrap gap-2"><button className="primary" disabled={busy || !title.trim()}>{busy ? 'Сохранение…' : editing ? 'Сохранить' : 'Добавить задачу'}</button>{editing && <button type="button" className="secondary" disabled={busy} onClick={resetForm}>Отмена</button>}</div>
        </form>
      </section>
      <section aria-label="Задачи"><h2 className="mb-3 text-lg font-semibold">Список задач</h2>
        {todos.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">Пока нет задач. Добавьте первую выше.</p> : <ul className="space-y-3">{todos.map(todo => <li key={todo.id} className="panel flex items-start gap-3 !p-5">
          <input className="mt-1 !h-5 !w-5 shrink-0 accent-emerald-700" type="checkbox" checked={todo.completed} disabled={busy} aria-label={`Выполнено: ${todo.title}`} onChange={() => void action(async () => { const updated = await api<Todo>(`/todos/${todo.id}`, 'PATCH', { completed: !todo.completed }); setTodos(items => items.map(item => item.id === updated.id ? updated : item)); })} />
          <div className="min-w-0 flex-1"><h3 className={`break-words font-medium ${todo.completed ? 'text-slate-400 line-through' : ''}`}>{todo.title}</h3>{todo.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-500">{todo.description}</p>}
          <div className="mt-3 flex flex-wrap gap-4 text-sm"><button className="text-emerald-700 hover:underline" disabled={busy} onClick={() => { setEditing(todo.id); setTitle(todo.title); setDescription(todo.description); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Изменить</button><button className="text-red-700 hover:underline" disabled={busy} onClick={() => void action(async () => { await api(`/todos/${todo.id}`, 'DELETE'); setTodos(items => items.filter(item => item.id !== todo.id)); if (editing === todo.id) resetForm(); })}>Удалить</button></div></div>
        </li>)}</ul>}
      </section>
    </>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
