import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Send,
  Bot,
  User as UserIcon,
  PlusCircle,
  Loader2,
} from 'lucide-react';
import api, { getCached } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
}

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
        const rendered = parts
          .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
          .map((seg, j) => {
            if (seg.startsWith('**') && seg.endsWith('**'))
              return <strong key={j} className="font-bold text-white">{seg.slice(2, -2)}</strong>;
            if (seg.startsWith('*') && seg.endsWith('*'))
              return <em key={j} className="italic">{seg.slice(1, -1)}</em>;
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
  `Hello ${name}, I'm Fortis Coach. I have access to your real-time workout performance, biometric recovery, and nutritional data.\n\nAsk me anything — workout adaptations, recovery, nutrition, or training strategy.`;

const QUICK_PROMPTS = [
  'Why was my workout changed?',
  'I only have 20 minutes today',
  'Meals matching my budget & macros',
  'How is my recovery trending?',
  'What did my scan detect?',
];

export const CoachPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const initGreeting = useCallback((name: string) => {
    setMessages([{ role: 'assistant', content: GREETING(name) }]);
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
          setMessages(msgRes.data);
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

    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
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
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.content }]);
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.detail ||
        'Fortis Coach is temporarily unavailable. Please check your backend connection.';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col bg-dark-card border border-dark-border rounded-2xl overflow-hidden shadow-card">

      {/* ── Header ── */}
      <div className="p-4 border-b border-dark-border bg-dark-surface/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white shadow-glow">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-white">Fortis Context-Aware Coach</h2>
            <span className="text-[11px] text-emerald-400 font-medium">Real-Time Continuous Intelligence</span>
          </div>
        </div>
        <button
          onClick={handleNewChat}
          title="Start new chat"
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white border border-dark-border hover:border-brand/40 rounded-xl px-3 py-1.5 transition-all"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      {/* ── Quick Prompts ── */}
      <div className="px-3 py-2 bg-dark-surface/30 border-b border-dark-border flex gap-2 overflow-x-auto hide-scrollbar shrink-0">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSend(prompt)}
            disabled={loading || initialising}
            className="px-3 py-1.5 rounded-full bg-dark-hover border border-dark-border hover:border-brand/40 text-text-secondary hover:text-white whitespace-nowrap transition-colors text-xs disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* ── Message Stream ── */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {initialising ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading your coaching session…</span>
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  m.role === 'user'
                    ? 'bg-brand text-white'
                    : 'bg-dark-surface border border-dark-border text-brand-light'
                }`}
              >
                {m.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div
                className={`p-3.5 rounded-2xl text-xs sm:text-sm max-w-[82%] ${
                  m.role === 'user'
                    ? 'bg-brand text-white rounded-tr-none'
                    : 'bg-dark-surface border border-dark-border text-gray-200 rounded-tl-none'
                }`}
              >
                {m.role === 'assistant' ? (
                  <MarkdownText text={m.content} />
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center">
              <Bot className="w-4 h-4 text-brand-light" />
            </div>
            <div className="bg-dark-surface border border-dark-border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
              <span className="text-xs text-text-muted">Consulting your Fortis data…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="p-3 bg-dark-surface border-t border-dark-border flex gap-2 shrink-0"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Fortis about your workout, recovery, nutrition, or scan…"
          className="fortis-input text-xs sm:text-sm"
          disabled={loading || initialising}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading || initialising}
          className="fortis-btn-primary px-4 flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default CoachPage;
