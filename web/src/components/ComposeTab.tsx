import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../api';
import { ContactAutocomplete } from './ContactAutocomplete';
import { Sparkles, Save, Send, Paperclip, Trash2, Bold, Italic, Link, Code, Smile, MessageCircle, Phone, Monitor, Hash, Smartphone, Shield, Mail } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { addHours, addDays, addWeeks, addMonths, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday, setHours, setMinutes, startOfMinute, isAfter, startOfDay } from 'date-fns';

function TemplateModal({ isOpen, onClose, onSave }: { isOpen: boolean, onClose: () => void, onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center">
      <div className="bg-gray-900 p-6 rounded border border-gray-700 w-96">
        <h3 className="text-lg font-bold mb-4 text-white">Save as Template</h3>
        <input 
          autoFocus
          className="w-full p-2.5 mb-4 border rounded bg-gray-800 text-white border-gray-600 focus:outline-none focus:border-blue-500"
          placeholder="Template Name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition-all duration-150 active:scale-95 active:brightness-90 transform">Cancel</button>
          <button onClick={() => { onSave(name); setName(""); }} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition-all duration-150 active:scale-95 active:brightness-90 transform">Save</button>
        </div>
      </div>
    </div>
  );
}

function TemplateDropdown({ templates, onLoadTemplate }: { templates: any[], onLoadTemplate: (t: any) => void }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className="w-full p-2.5 border rounded bg-gray-800 text-gray-400 border-gray-600 hover:border-gray-500 focus:outline-none focus:border-blue-500 text-left flex items-center justify-between transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>Load Template...</span>
        <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute z-[60] w-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-2xl max-h-72 overflow-y-auto">
          {templates.length === 0 && (
            <div className="p-3 text-gray-500 text-sm text-center">No templates saved yet.</div>
          )}
          {templates.map((t: any) => (
            <div
              key={t.id}
              className="flex items-center gap-2 p-3 hover:bg-blue-600 hover:outline hover:outline-2 hover:outline-white hover:z-10 relative text-white cursor-pointer text-sm border-b border-gray-700 last:border-b-0 transition-all duration-150 active:scale-95 active:brightness-90 transform"
            >
              <div className="flex-1 min-w-0" onClick={() => { onLoadTemplate(t); setIsOpen(false); }}>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-gray-400 truncate mt-0.5">{t.text}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete template "${t.name}"?`)) {
                    fetchApi(`/templates/${t.id}`, { method: 'DELETE' }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['templates'] });
                    });
                  }
                }}
                className="p-1 hover:bg-red-800 rounded text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-all flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const NETWORK_ICONS: Record<string, {icon: any, color: string}> = {
  telegram:  { icon: MessageCircle, color: 'text-blue-400' },
  whatsapp:  { icon: Phone, color: 'text-green-500' },
  beeper:    { icon: Monitor, color: 'text-red-400' },
  discord:   { icon: Hash, color: 'text-indigo-400' },
  sms:       { icon: Smartphone, color: 'text-yellow-400' },
  signal:    { icon: Shield, color: 'text-purple-400' },
  email:     { icon: Mail, color: 'text-gray-400' },
};

function NetworkDropdown({ options, value, onChange, personName, onContactAdded }: { options: string[], value: string, onChange: (v: string) => void, personName?: string, onContactAdded?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newNetwork, setNewNetwork] = useState("");
  const [newIdentifier, setNewIdentifier] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setAdding(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const meta = (net: string) => NETWORK_ICONS[net.toLowerCase()] || { icon: MessageCircle, color: 'text-gray-400' };

  const handleAddContact = async () => {
    if (!personName || !newNetwork) return;
    try {
      await fetchApi('/contacts', {
        method: 'POST',
        body: JSON.stringify({ name: personName, network: newNetwork, identifier: newIdentifier }),
      });
      setNewNetwork("");
      setNewIdentifier("");
      setAdding(false);
      setIsOpen(false);
      if (onContactAdded) onContactAdded();
    } catch (e: any) {
      alert("Failed to add contact: " + e.message);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className={`w-full p-2.5 rounded-lg bg-gray-800/50 text-left flex items-center justify-between transition-all border ${value ? 'text-white border-gray-600/50' : 'text-gray-400 border-gray-700/50'} hover:border-gray-500/50 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 capitalize`}
        onClick={() => !adding && setIsOpen(!isOpen)}
      >
        {value ? (
          <span className="flex items-center gap-2 capitalize">
            {React.createElement(meta(value).icon, { className: `w-4 h-4 ${meta(value).color}` })}
            {value}
          </span>
        ) : (
          <span>Select Network...</span>
        )}
        <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && !adding && (
        <div className="absolute z-[60] w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-h-72 overflow-y-auto">
          {options.length === 0 && personName && (
            <div className="p-3 text-gray-500 text-sm text-center">No networks yet</div>
          )}
          {options.map(net => {
            const m = meta(net);
            return (
              <div
                key={net}
                className={`flex items-center gap-3 p-3 hover:bg-blue-600 hover:outline hover:outline-2 hover:outline-white hover:z-10 relative text-sm cursor-pointer border-b border-gray-700 last:border-b-0 transition-all duration-150 active:scale-[0.98] transform capitalize ${
                  value === net ? 'text-white bg-blue-600/20' : 'text-gray-300'
                }`}
                onClick={() => { onChange(net); setIsOpen(false); }}
              >
                {React.createElement(m.icon, { className: `w-4 h-4 ${m.color}` })}
                <span>{net}</span>
              </div>
            );
          })}
          {personName && (
            <div
              className="flex items-center gap-2 p-3 hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 text-sm cursor-pointer border-t border-gray-700/50 transition-colors"
              onClick={() => setAdding(true)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add network...</span>
            </div>
          )}
        </div>
      )}
      {adding && (
        <div className="absolute z-[60] w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-3 space-y-2">
          <p className="text-xs text-gray-400 font-medium">Add network for <span className="text-white">{personName}</span></p>
          <select value={newNetwork} onChange={e => setNewNetwork(e.target.value)}
            className="w-full p-2 rounded-lg bg-gray-900/50 text-white border border-gray-700/50 text-sm focus:outline-none focus:border-blue-500/50">
            <option value="">Select network...</option>
            {Object.keys(NETWORK_ICONS).map(net => (
              <option key={net} value={net} className="capitalize">{net}</option>
            ))}
          </select>
          <input type="text" value={newIdentifier} onChange={e => setNewIdentifier(e.target.value)}
            placeholder="Identifier (chat ID, phone, etc.)"
            className="w-full p-2 rounded-lg bg-gray-900/50 text-white border border-gray-700/50 text-sm focus:outline-none focus:border-blue-500/50" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">Cancel</button>
            <button onClick={handleAddContact} disabled={!newNetwork}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs transition-colors disabled:opacity-50">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickTimeDropdown({ onSelect }: { onSelect: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const groups = [
    { label: "Relative", options: [{ value: "1h", label: "In 1 Hour" }, { value: "2h", label: "In 2 Hours" }] },
    { label: "Day parts", options: [{ value: "afternoon", label: "This Afternoon" }, { value: "tomorrow-morning", label: "Tomorrow Morning" }, { value: "tomorrow-afternoon", label: "Tomorrow Afternoon" }] },
    { label: "Periods", options: [{ value: "weekend", label: "This Weekend" }, { value: "next-week", label: "Next Week" }, { value: "next-month", label: "Next Month" }] },
    { label: "Weekday", options: [{ value: "mon", label: "Monday" }, { value: "tue", label: "Tuesday" }, { value: "wed", label: "Wednesday" }, { value: "thu", label: "Thursday" }, { value: "fri", label: "Friday" }] },
    { label: "Next Weekday", options: [{ value: "next-mon", label: "Next Monday" }, { value: "next-tue", label: "Next Tuesday" }, { value: "next-wed", label: "Next Wednesday" }, { value: "next-thu", label: "Next Thursday" }, { value: "next-fri", label: "Next Friday" }] },
  ];

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className="w-full p-2.5 rounded-lg bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:border-gray-500/50 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-left flex items-center justify-between"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>Quick select...</span>
        <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute z-[60] w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-h-72 overflow-y-auto">
          {groups.map((group, gi) => (
            <div key={gi}>
              <div className="px-3 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{group.label}</div>
              {group.options.map(opt => (
                <div
                  key={opt.value}
                  className="px-3 py-2 hover:bg-blue-600 hover:outline hover:outline-2 hover:outline-white hover:z-10 relative text-gray-300 hover:text-white text-sm cursor-pointer border-b border-gray-700/50 last:border-b-0 transition-all duration-150 active:scale-[0.98] transform"
                  onClick={() => { onSelect(opt.value); setIsOpen(false); }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```...```) - must be done first
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="bg-gray-700 p-3 rounded text-sm overflow-x-auto my-2"><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-700 px-1.5 py-0.5 rounded text-sm">$1</code>');

  // Bold (**text**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*) — after bold so ** isn't matched
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // Paragraphs and line breaks
  const lines = html.split('\n');
  const paragraphs: string[] = [];
  let currentPara: string[] = [];

  for (const line of lines) {
    if (line.trim() === '') {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join('<br/>'));
        currentPara = [];
      }
    } else {
      currentPara.push(line);
    }
  }
  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join('<br/>'));
  }

  return paragraphs.map(p => `<p class="mb-2">${p}</p>`).join('\n');
}

const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','🤗','🤩','🙂','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬','👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','✌️','🤟','🤘','👌','❤️','💔','💖','💙','💚','💛','💜','🖤','💯','💢','🔥','💥','✨','🌟','⭐','🌙','☀️','🌈','☁️','⛈️','🌊','🍕','🍔','🌮','🥗','☕','🍺','🍷','🎉','🎊','🎂','🎁','🎈','🏆','🥇','🚀','✈️','🏠','🚗','📱','💻','⌚','📷','🔧','💰','📅','📍','🔔','🔕','♻️','✅','❌','❓','❗','➕','➖','➗','✖️','🔗','📎','✏️','📝','🗑️','🔒','🔓','💡','📌','🎯','🏁'];

function insertFormatting(textarea: HTMLTextAreaElement, before: string, after: string, setter: (v: string) => void, currentValue: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = currentValue.substring(start, end);
  const replacement = before + selected + after;
  const newValue = currentValue.substring(0, start) + replacement + currentValue.substring(end);
  setter(newValue);
  // Restore cursor position after React re-render
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  });
}

export function ComposeTab({ editJob, onClearEdit, onScheduled }: { editJob: any, onClearEdit: () => void, onScheduled: () => void }) {
  const [person, setPerson] = useState("");
  const [network, setNetwork] = useState("");
  const [time, setTime] = useState<Date | null>(null);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<Array<{name: string, url: string, path: string}>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  // Modal states
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => fetchApi('/templates')
  });

  const { data: contactsData } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => fetchApi('/contacts'),
  });

  const { data: platformStatus } = useQuery({
    queryKey: ['platform-status'],
    queryFn: () => fetchApi('/platforms/status').then(r => r.platforms),
    refetchInterval: 30000,
  });

  const [enabledNetworks, setEnabledNetworks] = useState<string[]>([]);

  const [aiPrompt, setAiPrompt] = useState("");
  const aiMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const r = await fetch("/api/generate", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ prompt }) });
      return r.json();
    },
    onSuccess: (data: any) => {
      if (data.status === 'ok' && data.text) setMessage(data.text);
      else if (data.text) setErrorMsg("AI error: " + data.text.substring(0, 100));
    },
    onError: (e: any) => setErrorMsg("AI generation failed: " + e.message),
  });

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("scheduled_msgs_platforms") || "{}");
      const active = Object.keys(stored).filter(k => stored[k]);
      setEnabledNetworks(active.length > 0 ? active : ['telegram', 'whatsapp', 'beeper', 'discord', 'sms']);
    } catch {
      setEnabledNetworks(['telegram', 'whatsapp', 'beeper', 'discord', 'sms']);
    }
  }, []);

  useEffect(() => {
    if (editJob) {
      setPerson(editJob.person || "");
      setNetwork(editJob.network || "");
      setMessage(editJob.text || "");
      if (editJob.id) {
        setOriginalId(editJob.id);
      }
      if (editJob.time) {
        setTime(new Date(editJob.time));
      }
      onClearEdit();
    }
  }, [editJob, onClearEdit]);

  // Close emoji picker on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const scheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      // Simulate ID if not provided by backend immediately or use returned job
      return fetchApi('/schedule', { method: 'POST', body: JSON.stringify(data) });
    },
    onMutate: async (newJob: any) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] });
      const previousJobs = queryClient.getQueryData(['jobs']);
      queryClient.setQueryData(['jobs'], (old: any) => {
        const jobs = old?.jobs || [];
        return {
          ...old,
          jobs: [...jobs, { id: 'temp-' + Date.now(), ...newJob }]
        };
      });
      return { previousJobs };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setOriginalId(null);
      setPerson(""); setNetwork(""); setTime(null); setMessage(""); setAttachments([]);
      onScheduled();
    },
    onError: (e: any, _newJob, context: any) => {
      queryClient.setQueryData(['jobs'], context?.previousJobs);
      setErrorMsg(e.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['jobs'] })
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: any) => fetchApi('/templates', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsSaveModalOpen(false);
    },
    onError: (e: any) => setErrorMsg(e.message)
  });

  const sendNowMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const body: any = { person, network, text: message, time: now };
      if (attachments.length > 0) {
        body.attachments = attachments.map(a => a.url);
      }
      return fetchApi('/send', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      setMessage("");
      setPerson("");
      setNetwork("");
      setAttachments([]);
    },
    onError: (e: any) => setErrorMsg(e.message),
  });

  const handleSchedule = () => {
    if (!person || !network || !time || !message) {
      setErrorMsg("All fields are required.");
      return;
    }
    setErrorMsg("");
    const body: any = { person, network, time: time.toISOString(), text: message };
    if (originalId) {
      body.replace_id = originalId;
    }
    if (attachments.length > 0) {
      body.attachments = attachments.map(a => a.url);
    }
    scheduleMutation.mutate(body);
  };

  const handleSaveTemplate = (name: string) => {
    if (!name) return;
    saveTemplateMutation.mutate({ name, person, network, text: message });
  };

  const todayIs = (day: string) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()] === day;

  const setQuickTime = (type: string) => {
    const now = new Date();
    const hour = now.getHours();
    switch (type) {
      case '1h': setTime(startOfMinute(addHours(now, 1))); break;
      case '2h': setTime(startOfMinute(addHours(now, 2))); break;
      case 'afternoon': setTime(startOfMinute(setHours(now, hour < 14 ? 14 : 25))); break;  // 25 = tomorrow 14:00 effectively
      case 'tomorrow-morning': setTime(startOfMinute(setHours(addDays(now, 1), 9))); break;
      case 'tomorrow-afternoon': setTime(startOfMinute(setHours(addDays(now, 1), 14))); break;
      case 'weekend': setTime(startOfMinute(setHours(nextSaturday(now), 10))); break;
      case 'next-week': setTime(startOfMinute(setHours(startOfDay(addWeeks(now, 1)), 9))); break;
      case 'next-month': setTime(startOfMinute(setHours(startOfDay(addMonths(now, 1)), 9))); break;
      case 'mon': setTime(startOfMinute(setHours(nextMonday(now), 9))); break;
      case 'tue': setTime(startOfMinute(setHours(nextTuesday(now), 9))); break;
      case 'wed': setTime(startOfMinute(setHours(nextWednesday(now), 9))); break;
      case 'thu': setTime(startOfMinute(setHours(nextThursday(now), 9))); break;
      case 'fri': setTime(startOfMinute(setHours(nextFriday(now), 9))); break;
      case 'next-mon': setTime(startOfMinute(setHours(addWeeks(nextMonday(now), todayIs('Mon') ? 1 : 0), 9))); break;
      case 'next-tue': setTime(startOfMinute(setHours(addWeeks(nextTuesday(now), todayIs('Tue') ? 1 : 0), 9))); break;
      case 'next-wed': setTime(startOfMinute(setHours(addWeeks(nextWednesday(now), todayIs('Wed') ? 1 : 0), 9))); break;
      case 'next-thu': setTime(startOfMinute(setHours(addWeeks(nextThursday(now), todayIs('Thu') ? 1 : 0), 9))); break;
      case 'next-fri': setTime(startOfMinute(setHours(addWeeks(nextFriday(now), todayIs('Fri') ? 1 : 0), 9))); break;
    }
  };
  
  const handleMediaUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      if (files.length === 0) return;
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
          const res = await fetchApi('/upload', {
            method: 'POST',
            body: formData,
          });
          if (res.url) {
            setAttachments(prev => [...prev, { name: file.name, url: res.url, path: res.path }]);
          }
        } catch (err: any) {
          setErrorMsg("Failed to upload media: " + err.message);
        }
      }
    };
    input.click();
  };

  return (
    <div className="space-y-5">
      <TemplateModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} onSave={handleSaveTemplate} />

          {errorMsg && (
            <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl text-red-300 text-sm">
              {errorMsg}
            </div>
          )}
      
          <div className="flex gap-4 flex-col md:flex-row">
            <div className="flex-1">
              <label className="block text-xs font-semibold mb-1.5 text-gray-400 uppercase tracking-wider">Recipient</label>
              <ContactAutocomplete 
                person={person} 
                onChange={(p, net) => { setPerson(p); if (net) setNetwork(net); }} 
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold mb-1.5 text-gray-400 uppercase tracking-wider">Network</label>
              <div className="relative">
                {(() => {
                  const rawContacts: Array<{name: string; networks: Array<{network: string}>}> = contactsData?.contacts || [];
                  const match = rawContacts.find(c => c.name.toLowerCase() === person.toLowerCase());
                  const personNets = match ? match.networks.map(n => n.network) : [];
                  const options = person ? personNets : enabledNetworks;
                  return (
                    <NetworkDropdown
                      options={options}
                      value={network}
                      onChange={setNetwork}
                      personName={person || undefined}
                      onContactAdded={() => queryClient.invalidateQueries({ queryKey: ['contacts'] })}
                    />
                  );
                })()}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-gray-400 uppercase tracking-wider">Send At</label>
            <div className="flex gap-3 flex-col md:flex-row">
              <div className="flex-1">
                <DatePicker
                  selected={time}
                  onChange={(date: Date | null) => setTime(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="w-full p-2.5 rounded-lg bg-gray-800/50 text-white border border-gray-700/50 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  placeholderText="Select date and time"
                  wrapperClassName="w-full"
                />
              </div>
              <div className="w-full md:w-56 flex-shrink-0">
                <QuickTimeDropdown onSelect={(val) => setQuickTime(val)} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-gray-400 uppercase tracking-wider">Message</label>
            {templates?.templates?.length > 0 && (
              <div className="mb-2">
                <TemplateDropdown
                  templates={templates.templates}
                  onLoadTemplate={(t) => {
                    setPerson(t.person || "");
                    setNetwork(t.network || "");
                    setMessage(t.text || "");
                  }}
                />
              </div>
            )}

            {/* Formatting toolbar */}
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              <button
                onClick={() => textareaRef.current && insertFormatting(textareaRef.current, '**', '**', setMessage, message)}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                title="Bold"
              ><Bold className="w-4 h-4" /></button>
              <button
                onClick={() => textareaRef.current && insertFormatting(textareaRef.current, '*', '*', setMessage, message)}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                title="Italic"
              ><Italic className="w-4 h-4" /></button>
              <button
                onClick={() => {
                  const ta = textareaRef.current;
                  if (!ta) return;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const selected = message.substring(start, end);
                  const url = prompt('Enter URL:', 'https://');
                  if (!url) return;
                  const replacement = `[${selected || 'link text'}](${url})`;
                  const newValue = message.substring(0, start) + replacement + message.substring(end);
                  setMessage(newValue);
                }}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                title="Link"
              ><Link className="w-4 h-4" /></button>
              <button
                onClick={() => textareaRef.current && insertFormatting(textareaRef.current, '`', '`', setMessage, message)}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                title="Inline Code"
              ><Code className="w-4 h-4" /></button>
              <span className="w-px h-4 bg-gray-700/50 mx-1" />
              <div className="relative" ref={emojiPickerRef}>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                  title="Emoji"
                ><Smile className="w-4 h-4" /></button>
                {showEmojiPicker && (
                  <div className="absolute top-full left-0 mt-1 z-[70] bg-gray-800 border border-gray-700/50 rounded-xl shadow-lg p-2 w-72 max-h-48 overflow-y-auto grid grid-cols-8 gap-1">
                    {EMOJIS.map((emoji, i) => (
                      <button
                        key={i}
                        className="p-1 hover:bg-gray-700/50 rounded-lg text-lg transition-colors"
                        onClick={() => {
                          const ta = textareaRef.current;
                          if (ta) {
                            const start = ta.selectionStart;
                            const newValue = message.substring(0, start) + emoji + message.substring(ta.selectionEnd);
                            setMessage(newValue);
                            requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); });
                          } else {
                            setMessage(prev => prev + emoji);
                          }
                          setShowEmojiPicker(false);
                        }}
                      >{emoji}</button>
                    ))}
                  </div>
                )}
              </div>
              <span className="flex-1" />
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/30 hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 rounded-lg text-xs transition-colors border border-gray-700/30"
              >
                {previewMode ? 'Edit' : 'Preview'}
              </button>
            </div>

            {previewMode ? (
              <div
                className="w-full p-3 rounded-lg bg-gray-800/30 text-white border border-gray-700/50 min-h-32 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message || '') }}
              />
            ) : (
              <textarea
                ref={textareaRef}
                className="w-full p-3 rounded-lg bg-gray-800/30 text-white border border-gray-700/50 h-32 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20 resize-none transition-all"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
              />
            )}

            {/* Attachment chips */}
            {attachments.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {attachments.map((att, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
                    <Paperclip className="w-3 h-3" />
                    <span className="truncate max-w-[150px]">{att.name}</span>
                    <button
                      onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-300 ml-0.5 font-bold"
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center mt-2">
              <div className="flex gap-2">
                <button onClick={handleMediaUpload} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/30 hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 rounded-lg text-sm transition-all border border-gray-700/30">
                  <Paperclip className="w-4 h-4" /> Attach Media {attachments.length > 0 && `(${attachments.length})`}
                </button>
                <button onClick={() => {
                    if (!message.trim()) { setErrorMsg("Type a prompt into the message field first."); return; }
                    const fullPrompt = person
                      ? `Write a message for ${person}. ${message}. Give exactly one version, no alternatives, no conversation — just the message text.`
                      : `${message}. Give exactly one version, no alternatives, no conversation — just the message text.`;
                    aiMutation.mutate(fullPrompt);
                  }}
                  disabled={aiMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 rounded-lg text-sm transition-all disabled:opacity-50"
                >
                  <Sparkles className={`w-4 h-4 ${aiMutation.isPending ? 'animate-pulse' : ''}`} />
                  {aiMutation.isPending ? 'Generating...' : 'Use AI'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-800/50">
            <button 
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 shadow-sm"
              onClick={handleSchedule}
              disabled={scheduleMutation.isPending}
            >
              <Send className="w-4 h-4" />
              {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule'}
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 shadow-sm"
              onClick={() => sendNowMutation.mutate()}
              disabled={sendNowMutation.isPending || !person || !network || !message}
            >
              <Send className="w-4 h-4" />
              {sendNowMutation.isPending ? 'Sending...' : 'Send Now'}
            </button>
            <button 
              onClick={() => setIsSaveModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 text-gray-300 rounded-lg text-sm font-medium transition-all border border-gray-700/30"
            >
              <Save className="w-4 h-4" />
              Save Template
            </button>
          </div>
        </div>
      );
}