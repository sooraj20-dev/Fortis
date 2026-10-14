import React, { useEffect, useState, useRef } from 'react';
import { 
  Send, 
  Bot, 
  User as UserIcon, 
  AlertCircle
} from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
}

export const CoachPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load existing session or setup initial greeting
  useEffect(() => {
    api.get('/api/coach/sessions')
      .then((res) => {
        if (res.data && res.data.length > 0) {
          const currentId = res.data[0].id;
          setSessionId(currentId);
          return api.get(`/api/coach/sessions/${currentId}/messages`);
        } else {
          return api.post('/api/coach/sessions').then((newSession) => {
            setSessionId(newSession.data.id);
            return { data: [] } as any;
          });
        }
      })
      .then((msgRes) => {
        if (msgRes && msgRes.data && msgRes.data.length > 0) {
          setMessages(msgRes.data);
        } else {
          const userName = user?.name || 'Athlete';
          setMessages([
            {
              role: 'assistant',
              content: `Hello ${userName}, I am Fortis Coach. I observe your real-time workout performance, biometric recovery, and nutritional requirements. Ask me anything about adapting your training or optimizing your daily nutrition.`
            }
          ]);
        }
      })
      .catch(() => {
        const userName = user?.name || 'Athlete';
        setMessages([
          {
            role: 'assistant',
            content: `Hello ${userName}, I am Fortis Coach. I observe your real-time workout performance, biometric recovery, and nutritional requirements. Ask me anything about adapting your training or optimizing your daily nutrition.`
          }
        ]);
      });
  }, [user?.name]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || loading) return;

    setError(null);
    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const activeId = sessionId || 1;
      const res = await api.post(`/api/coach/sessions/${activeId}/message`, { content: text });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.content }]);
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || 'Unable to connect to Fortis Coach right now. Please ensure your backend is running.';
      setError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ ${errMsg}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col bg-dark-card border border-dark-border rounded-2xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="p-4 border-b border-dark-border bg-dark-surface/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white shadow-glow">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-white">Fortis Context-Aware Coach</h2>
            <span className="text-[11px] text-emerald-400 font-medium">Real-Time Continuous Intelligence</span>
          </div>
        </div>
        <span className="text-xs text-text-muted hidden sm:inline">Real Data Telemetry</span>
      </div>

      {/* Suggested Prompts */}
      <div className="p-2.5 bg-dark-surface/30 border-b border-dark-border flex gap-2 overflow-x-auto text-xs hide-scrollbar">
        <button 
          onClick={() => handleSend("Why did Fortis adapt my workout?")}
          className="px-3 py-1.5 rounded-full bg-dark-hover border border-dark-border hover:border-brand/40 text-text-secondary hover:text-white whitespace-nowrap transition-colors"
        >
          Why was my workout changed?
        </button>
        <button 
          onClick={() => handleSend("Adjust today's workout to 20 minutes")}
          className="px-3 py-1.5 rounded-full bg-dark-hover border border-dark-border hover:border-brand/40 text-text-secondary hover:text-white whitespace-nowrap transition-colors"
        >
          I only have 20 minutes today
        </button>
        <button 
          onClick={() => handleSend("What meal options fit my daily nutritional target and budget?")}
          className="px-3 py-1.5 rounded-full bg-dark-hover border border-dark-border hover:border-brand/40 text-text-secondary hover:text-white whitespace-nowrap transition-colors"
        >
          Meals matching budget & macros
        </button>
      </div>

      {/* Message Stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
              m.role === 'user' ? 'bg-brand text-white' : 'bg-dark-surface border border-dark-border text-brand-light'
            }`}>
              {m.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`p-3.5 rounded-2xl text-xs sm:text-sm max-w-[80%] leading-relaxed ${
              m.role === 'user'
                ? 'bg-brand text-white rounded-tr-none'
                : 'bg-dark-surface border border-dark-border text-gray-200 rounded-tl-none whitespace-pre-wrap'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Bot className="w-4 h-4 text-brand animate-pulse" />
            <span>Consulting real-time Fortis records...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <form 
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="p-3 bg-dark-surface border-t border-dark-border flex gap-2"
      >
        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Fortis about your workout adaptation, recovery, or diet..."
          className="fortis-input text-xs sm:text-sm"
        />
        <button 
          type="submit"
          disabled={!input.trim() || loading}
          className="fortis-btn-primary px-4 flex items-center justify-center"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default CoachPage;
