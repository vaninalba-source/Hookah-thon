import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
type User = { id: string; email: string };
type Todo = { id: string; title: string; description: string; completed: boolean; createdAt: string | null };
const createdAtFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const value = await res.json();
  if (!res.ok) throw new ApiError(res.status, value.error ?? 'Не удалось выполнить запрос');
  return value as T;
}
function Icon({ name }: { name: 'note' | 'plus' | 'edit' | 'trash' | 'exit' | 'clock' }) {
  const paths = {
    note: <><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="m10 14 1-4L18 3a2.12 2.12 0 0 1 3 3l-7 7-4 1Z" /><path d="m16 5 3 3" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    edit: <><path d="m4 16-1 5 5-1L20 8a2.12 2.12 0 0 0-4-4L4 16Z" /><path d="m14 6 4 4" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    exit: <><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
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
    setError(err instanceof ApiError ? err.message : 'Не удалось связаться с сервером — Попробуйте ещё раз');
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
  if (!ready) return <main className="loading"><span className="brand-mark"><Icon name="note" /></span><p role="status">Открываем ваши заметки</p></main>;
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Список задач — главная"><span className="brand-mark"><Icon name="note" /></span><span>Мои заметки<span className="brand-caption">Немного порядка в каждом дне</span></span></a>
      {user && <div className="account"><span className="account-email">{user.email}</span><button className="secondary logout" disabled={busy} onClick={() => void action(async () => { await api('/logout', 'POST'); setUser(null); setTodos([]); resetForm(); })}><Icon name="exit" />Выйти</button></div>}
    </header>
    <main className={user ? 'workspace' : 'auth-layout'}>
      <div className="page-heading"><p className="eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО</p><h1>{user ? 'Выгрузи дела из головы' : mode === 'login' ? 'С возвращением!' : 'Начнём с чистого листа'}</h1><p className="page-subtitle">{user ? 'Вноси задачи, выполняй и вычеркивай с удовольствием' : 'Войдите или создайте аккаунт, чтобы сохранить свои задачи'}</p></div>
      {error && <div role="alert" className="error-message">{error}</div>}
      {!user ? <section className="panel auth-panel" aria-labelledby="auth-title">
        <div className="section-heading"><h2 id="auth-title">{mode === 'login' ? 'Вход' : 'Регистрация'}</h2><span className="heading-decoration" aria-hidden="true">✦</span></div>
        <form onSubmit={auth} className="form-fields">
          <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} disabled={busy} /></label>
          <label>Пароль<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={128} required disabled={busy} placeholder="Введите пароль" /><span className="field-hint">От 8 до 128 символов</span></label>
          <button className="primary full-width" disabled={busy}>{busy ? 'Подождите' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
        </form>
        <p className="auth-switch">{mode === 'login' ? 'Пока нет аккаунта? ' : 'Уже есть аккаунт? '}<button className="text-button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Зарегистрироваться' : 'Войти'}</button></p>
      </section> : <div className="task-layout">
        <section className="panel composer" aria-labelledby="composer-title"><div className="section-heading"><h2 id="composer-title">{editing ? 'Редактирование' : 'Новая заметка'}</h2><span className="heading-icon"><Icon name={editing ? 'edit' : 'plus'} /></span></div>
          <p className="section-description">{editing ? 'Измените нужное и сохраните' : 'Большие планы начинаются с маленькой записи'}</p>
          <form onSubmit={save} className="form-fields">
            <label>Заголовок<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} disabled={busy} placeholder="Что хочется сделать?" /></label>
            <label>Описание <span className="optional">· необязательно</span><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={4} disabled={busy} placeholder="Детали, которые важно не забыть" /></label>
            <div className="form-actions"><button className="primary" disabled={busy || !title.trim()}><Icon name={editing ? 'edit' : 'plus'} />{busy ? 'Сохранение' : editing ? 'Сохранить' : 'Добавить заметку'}</button>{editing && <button type="button" className="secondary" disabled={busy} onClick={resetForm}>Отмена</button>}</div>
          </form>
        </section>
        <section className="task-section" aria-labelledby="list-title"><div className="list-heading"><h2 id="list-title">Мои задачи</h2><span className="list-line" aria-hidden="true" /></div>
          {todos.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name="note" /></span><h3>Здесь будет ваш список</h3><p>Добавьте первую заметку<br />Пусть важное остаётся под рукой</p></div> : <ul className="task-list">{todos.map(todo => <li key={todo.id} className={`task-card${todo.completed ? ' is-complete' : ''}`}>
            <input className="todo-checkbox" type="checkbox" checked={todo.completed} disabled={busy} aria-label={`Выполнено: ${todo.title}`} onChange={() => void action(async () => { const updated = await api<Todo>(`/todos/${todo.id}`, 'PATCH', { completed: !todo.completed }); setTodos(items => items.map(item => item.id === updated.id ? updated : item)); })} />
            <div className="task-content"><h3 className="task-title">{todo.title}</h3>{todo.description && <p className="task-description">{todo.description}</p>}
              <p className="task-date"><Icon name="clock" />{todo.createdAt ? <><span>Создано: <time dateTime={todo.createdAt}>{createdAtFormat.format(new Date(todo.createdAt))}</time></span></> : <span>Дата создания неизвестна</span>}</p>
              <div className="task-actions"><button className="task-action" disabled={busy} onClick={() => { setEditing(todo.id); setTitle(todo.title); setDescription(todo.description); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Icon name="edit" />Изменить</button><button className="task-action delete-action" disabled={busy} onClick={() => void action(async () => { await api(`/todos/${todo.id}`, 'DELETE'); setTodos(items => items.filter(item => item.id !== todo.id)); if (editing === todo.id) resetForm(); })}><Icon name="trash" />Удалить</button></div>
            </div>
          </li>)}</ul>}
        </section>
      </div>}
    </main>
    <footer className="app-footer">Для дел, мыслей и маленьких шагов</footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
