import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Send,
  PlusCircle,
  Dumbbell,
  Clock,
  Utensils,
  Moon,
  ScanLine,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';
import api, { getCached } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

const COACH_IMG = '/landing_imgs/coach.png';

interface Message {
  id?: number;
  uid?: string;
  role: 'user' | 'assistant';
  content: string;
  /** typewriter reveal, only for freshly received replies */
  animate?: boolean;
}

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

/** Render markdown-lite: **bold**, *italic*, bullet lists, line breaks */
const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  return (
    <span className="leading-relaxed">
      {lines.map((line, i) => {
        // Bullet list items
        const isBullet = /^[\-\*•]\s/.test(line.trim());
        const parts = line.replace(/^[\-\*•]\s/, '');

        // Inline bold / italic replacements
        const rendered = parts.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((seg, j) => {
          if (seg.startsWith('**') && seg.endsWith('**'))
            return (
              <strong key={j} className="font-bold text-white">
                {seg.slice(2, -2)}
              </strong>
            );
          if (seg.startsWith('*') && seg.endsWith('*'))
            return (
              <em key={j} className="italic">
                {seg.slice(1, -1)}
              </em>
            );
          return <React.Fragment key={j}>{seg}</React.Fragment>;
        });

        return (
          <React.Fragment key={i}>
            {isBullet ? (
              <span className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-light shrink-0" />
                <span>{rendered}</span>
              </span>
            ) : (
              <span>{rendered}</span>
            )}
            {i < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </span>
  );
};

const GREETING = (name: string) =>
  `Hello ${name}, I'm Coach Fortis. I have access to your real-time workout performance, biometric recovery, and nutritional data.\n\nAsk me anything — workout adaptations, recovery, nutrition, or training strategy.`;

const QUICK_PROMPTS = [
  { text: 'Why was my workout changed?', tag: 'Workout', icon: Dumbbell },
  { text: 'I only have 20 minutes today', tag: 'Short on time', icon: Clock },
  { text: 'Meals matching my budget & macros', tag: 'Nutrition', icon: Utensils },
  { text: 'How is my recovery trending?', tag: 'Recovery', icon: Moon },
  { text: 'What did my scan detect?', tag: 'Movement scan', icon: ScanLine },
];

const DATA_SOURCES = ['Workouts', 'Recovery', 'Nutrition', 'Scans'];

/* ───────────────────────── Pieces ───────────────────────── */

/** Round coach portrait cropped to the face */
const CoachAvatar: React.FC<{ className?: string; ring?: boolean }> = ({ className, ring }) => (
  <span className={cx('relative inline-block shrink-0', className)}>
    {ring && <span className="coach-ring absolute -inset-1 rounded-full border-2 border-brand" aria-hidden />}
    <img
      src={COACH_IMG}
      alt=""
      aria-hidden
      className="relative w-full h-full rounded-full object-cover object-[49%_22%] border border-brand/50"
    />
  </span>
);

/** Assistant bubble: typewriter reveal (tap to skip) + copy button */
const AssistantBubble: React.FC<{ text: string; animate: boolean; onTick: () => void }> = ({ text, animate, onTick }) => {
  const reduce =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(animate && !reduce ? 0 : text.length);
  const [copied, setCopied] = useState(false);
  const done = shown >= text.length;

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setShown((n) => Math.min(text.length, n + 4));
      onTick();
    }, 20);
    return () => clearInterval(id);
  }, [done, text.length, onTick]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div onClick={() => !done && setShown(text.length)} className={cx(!done && 'cursor-pointer')}>
      <MarkdownText text={text.slice(0, shown)} />
      {!done && <span className="coach-caret inline-block w-1.5 h-4 bg-brand-light ml-0.5 align-middle" aria-hidden />}
      {done && (
        <button
          type="button"
          onClick={copy}
          aria-label="Copy reply"
          className="mt-2 -mb-1 flex items-center gap-1 text-[11px] text-text-muted hover:text-white transition-colors py-1"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </div>
  );
};

/* ───────────────────────── Page ───────────────────────── */

export const CoachPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [expanded, setExpanded] = useState(true); // header banner open / collapsed
  const [showJump, setShowJump] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const uidRef = useRef(0);
  const nextUid = () => `m${++uidRef.current}`;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Cheap instant scroll used while a reply is being typed out
  const stickToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const initGreeting = useCallback((name: string) => {
    setMessages([{ uid: `g${++uidRef.current}`, role: 'assistant', content: GREETING(name), animate: true }]);
  }, []);

  /** Load or create a session */
  const loadSession = useCallback(async () => {
    const name = user?.name || 'Athlete';
    try {
      const res = await getCached<Array<{ id: number; title: string }>>('/api/coach/sessions');
      if (res.data && res.data.length > 0) {
        const sid = res.data[0].id;
        setSessionId(sid);
        const msgRes = await getCached<Message[]>(`/api/coach/sessions/${sid}/messages`);
        if (msgRes.data && msgRes.data.length > 0) {
          setMessages(msgRes.data.map((m) => ({ ...m, uid: `h${++uidRef.current}`, animate: false })));
          if (msgRes.data.some((m) => m.role === 'user')) setExpanded(false);
        } else {
          initGreeting(name);
        }
      } else {
        const newSession = await api.post('/api/coach/sessions');
        setSessionId(newSession.data.id);
        initGreeting(name);
      }
    } catch {
      initGreeting(name);
    } finally {
      setInitialising(false);
    }
  }, [user?.name, initGreeting]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  /** Start a fresh conversation */
  const handleNewChat = async () => {
    setInitialising(true);
    setMessages([]);
    setInput('');
    setExpanded(true);
    try {
      const newSession = await api.post('/api/coach/sessions');
      setSessionId(newSession.data.id);
    } catch {
      setSessionId(null);
    }
    initGreeting(user?.name || 'Athlete');
    setInitialising(false);
    inputRef.current?.focus();
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || loading) return;

    const userMsg: Message = { uid: nextUid(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setExpanded(false);
    setLoading(true);

    try {
      // Ensure we have a session
      let sid = sessionId;
      if (!sid) {
        const newSession = await api.post('/api/coach/sessions');
        sid = newSession.data.id;
        setSessionId(sid);
      }

      const res = await api.post(`/api/coach/sessions/${sid}/message`, { content: text });
      setMessages((prev) => [
        ...prev,
        { uid: nextUid(), role: 'assistant', content: res.data.content, animate: true },
      ]);
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.detail ||
        'Fortis Coach is temporarily unavailable. Please check your backend connection.';
      setMessages((prev) => [...prev, { uid: nextUid(), role: 'assistant', content: `⚠️ ${errMsg}` }]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  /* Header interactions */
  const onListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop > 24 && expanded) setExpanded(false);
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 240);
  };

  const onHeaderMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = headerRef.current;
    if (!el || !expanded) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
    el.style.setProperty('--py', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
  };
  const onHeaderLeave = () => {
    headerRef.current?.style.setProperty('--px', '0');
    headerRef.current?.style.setProperty('--py', '0');
  };

  const hasUserMsg = messages.some((m) => m.role === 'user');

  return (
    <div className="max-w-4xl mx-auto h-[calc(100dvh-140px)] min-h-[480px] flex flex-col bg-dark-card border border-dark-border rounded-2xl sm:rounded-3xl overflow-hidden shadow-card">
      <style>{`
        @keyframes coach-dot { 0%, 80%, 100% { transform: translateY(0); opacity: .4; } 40% { transform: translateY(-5px); opacity: 1; } }
        @keyframes coach-ring { 0% { transform: scale(.9); opacity: .9; } 100% { transform: scale(1.45); opacity: 0; } }
        @keyframes coach-caret { 50% { opacity: 0; } }
        @keyframes coach-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .coach-dot { animation: coach-dot 1.2s ease-in-out infinite; }
        .coach-ring { animation: coach-ring 1.4s ease-out infinite; }
        .coach-caret { animation: coach-caret 1s steps(1) infinite; }
        .coach-in { animation: coach-in .3s ease both; }
        .coach-hero-img {
          transform: translate3d(calc(var(--px, 0) * -10px), calc(var(--py, 0) * -6px), 0) scale(1.1);
          transition: transform .25s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .coach-dot, .coach-ring, .coach-caret, .coach-in { animation: none !important; }
          .coach-hero-img { transform: scale(1.05) !important; transition: none !important; }
        }
      `}</style>

      {/* ── Header: coach banner that collapses once the chat gets going ── */}
      <header
        ref={headerRef}
        onPointerMove={onHeaderMove}
        onPointerLeave={onHeaderLeave}
        className={cx(
          'relative shrink-0 overflow-hidden border-b border-dark-border transition-[height] duration-300 ease-out',
          expanded ? 'h-[168px] sm:h-[190px]' : 'h-[64px]',
        )}
      >
        <img
          src={COACH_IMG}
          alt="Coach Fortis"
          className={cx(
            'coach-hero-img absolute inset-y-0 right-0 h-full object-cover select-none transition-opacity duration-300',
            'w-full sm:w-[66%] object-[50%_28%]',
            expanded ? 'opacity-90' : 'opacity-30',
          )}
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-dark-card via-dark-card/70 to-dark-card/5 sm:to-transparent pointer-events-none" />

        {/* Tap anywhere on the banner to open / close it */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse coach banner' : 'Expand coach banner'}
          aria-expanded={expanded}
          className="absolute inset-0 w-full h-full cursor-pointer"
        />

        <div className="relative z-10 h-full px-4 flex items-end pointer-events-none">
          <div className="flex-1 min-w-0 pb-3 flex items-end gap-3">
            <CoachAvatar
              ring={loading}
              className={cx('transition-all duration-300', expanded ? 'w-0 h-0 opacity-0 -mr-3' : 'w-10 h-10 opacity-100 mb-[1px]')}
            />
            <div className="min-w-0">
              <h2 className={cx('font-black text-white leading-tight', expanded ? 'text-2xl sm:text-3xl' : 'text-base')}>
                Coach Fortis
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cx('w-2 h-2 rounded-full shrink-0', loading ? 'bg-brand animate-pulse' : 'bg-emerald-400')} />
                <span className="text-xs text-text-secondary truncate">
                  {loading ? 'Thinking through your data…' : 'Online · knows your training'}
                </span>
              </div>
              {expanded && (
                <div className="hidden min-[420px]:flex flex-wrap gap-1.5 mt-2.5">
                  {DATA_SOURCES.map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded-full text-[11px] bg-black/40 border border-white/10 text-text-secondary backdrop-blur">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleNewChat}
          title="Start new chat"
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 text-xs text-white/90 hover:text-white bg-black/50 backdrop-blur border border-white/15 hover:border-brand/60 rounded-xl px-3 min-h-[40px] transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden min-[400px]:inline">New chat</span>
        </button>
      </header>

      {/* ── Message stream ── */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={listRef}
          onScroll={onListScroll}
          className="h-full p-3 sm:p-5 overflow-y-auto overscroll-contain space-y-4"
        >
          {initialising ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-text-muted">
                <CoachAvatar ring className="w-14 h-14" />
                <span className="text-xs">Coach Fortis is getting your session ready…</span>
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={m.uid ?? i}
                className={cx('coach-in flex items-end gap-2.5', m.role === 'user' && 'flex-row-reverse')}
              >
                {m.role === 'assistant' && <CoachAvatar className="w-8 h-8" />}
                <div
                  className={cx(
                    'px-4 py-3 rounded-2xl text-sm max-w-[86%] sm:max-w-[75%] min-w-0 break-words',
                    m.role === 'user'
                      ? 'bg-brand text-white rounded-br-md shadow-glow'
                      : 'bg-dark-surface border border-dark-border text-gray-200 rounded-bl-md',
                  )}
                >
                  {m.role === 'assistant' ? (
                    <AssistantBubble text={m.content} animate={!!m.animate} onTick={stickToBottom} />
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))
          )}

          {/* Starter prompts as tappable cards until the user says something */}
          {!initialising && !hasUserMsg && messages.length > 0 && (
            <div className="coach-in pt-1 sm:pl-[42px]">
              <p className="text-xs text-text-muted mb-2.5">Not sure where to start? Tap one.</p>
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2.5">
                {QUICK_PROMPTS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.text}
                      type="button"
                      onClick={() => handleSend(p.text)}
                      disabled={loading}
                      className="group flex items-center gap-3 text-left p-3 rounded-2xl bg-dark-surface/70 border border-dark-border hover:border-brand/50 hover:bg-brand/5 active:scale-[0.98] transition-all disabled:opacity-40"
                    >
                      <span className="w-9 h-9 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0 group-hover:bg-brand/20 transition-colors">
                        <Icon className="w-4 h-4 text-brand-light" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white leading-snug">{p.text}</span>
                        <span className="block text-[11px] text-text-muted mt-0.5">{p.tag}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {loading && (
            <div className="coach-in flex items-end gap-2.5">
              <CoachAvatar ring className="w-8 h-8" />
              <div className="bg-dark-surface border border-dark-border rounded-2xl rounded-bl-md px-4 py-3.5 flex items-center gap-1.5" aria-label="Coach is typing">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="coach-dot w-1.5 h-1.5 rounded-full bg-brand-light" style={{ animationDelay: `${d * 0.16}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Jump to latest */}
        {showJump && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest message"
            className="absolute bottom-3 right-4 w-10 h-10 rounded-full bg-dark-card border border-brand/40 text-brand-light shadow-glow flex items-center justify-center hover:bg-brand/10 transition-colors"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ── Quick prompt chips (once the chat has started) ── */}
      {hasUserMsg && (
        <div className="px-3 pt-2 pb-1 border-t border-dark-border bg-dark-surface/30 flex gap-2 overflow-x-auto hide-scrollbar shrink-0">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.text}
              onClick={() => handleSend(p.text)}
              disabled={loading || initialising}
              className="px-3.5 min-h-[36px] rounded-full bg-dark-hover border border-dark-border hover:border-brand/40 text-text-secondary hover:text-white whitespace-nowrap transition-colors text-xs disabled:opacity-40"
            >
              {p.text}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-dark-surface border-t border-dark-border flex gap-2 shrink-0"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Coach Fortis…"
          className="fortis-input !text-base sm:!text-sm flex-1 min-w-0 !rounded-full px-5"
          disabled={loading || initialising}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!input.trim() || loading || initialising}
          className="fortis-btn-primary w-12 h-12 !p-0 !rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default CoachPage;