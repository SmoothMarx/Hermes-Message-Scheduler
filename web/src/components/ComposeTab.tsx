import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../api';
import { ContactAutocomplete } from './ContactAutocomplete';
import { Save, Send, Paperclip, FolderOpen } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { addHours, addDays, nextFriday, setHours, startOfMinute } from 'date-fns';

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

function LoadTemplateModal({ isOpen, onClose, onLoad }: { isOpen: boolean, onClose: () => void, onLoad: (template: any) => void }) {
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => fetchApi('/templates')
  });

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center">
      <div className="bg-gray-900 p-6 rounded border border-gray-700 w-96 max-h-[80vh] flex flex-col">
        <h3 className="text-lg font-bold mb-4 text-white">Load Template</h3>
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {(!templates?.templates || templates.templates.length === 0) && (
            <div className="text-gray-400 text-sm">No templates saved yet.</div>
          )}
          {templates?.templates?.map((t: any) => (
            <div 
              key={t.id} 
              className="p-3 bg-gray-800 hover:bg-gray-700 hover:outline hover:outline-2 hover:outline-white hover:z-10 relative rounded cursor-pointer border border-gray-700 transition-all duration-150 active:scale-95 active:brightness-90 transform"
              onClick={() => onLoad(t)}
            >
              <div className="font-bold text-white text-sm">{t.name}</div>
              <div className="text-xs text-gray-400 truncate">{t.text}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition-all duration-150 active:scale-95 active:brightness-90 transform">Close</button>
        </div>
      </div>
    </div>
  );
}

export function ComposeTab({ editJob, onClearEdit, onScheduled }: { editJob: any, onClearEdit: () => void, onScheduled: () => void }) {
  const [person, setPerson] = useState("");
  const [network, setNetwork] = useState("");
  const [time, setTime] = useState<Date | null>(null);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);

  const queryClient = useQueryClient();

  const [enabledNetworks, setEnabledNetworks] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("scheduled_msgs_platforms") || "{}");
      const active = Object.keys(stored).filter(k => stored[k]);
      setEnabledNetworks(active.length > 0 ? active : ['telegram', 'whatsapp', 'discord', 'beeper', 'sms']);
    } catch {
      setEnabledNetworks(['telegram', 'whatsapp', 'discord', 'beeper', 'sms']);
    }
  }, []);

  useEffect(() => {
    if (editJob) {
      setPerson(editJob.person || "");
      setNetwork(editJob.network || "");
      setMessage(editJob.text || "");
      if (editJob.time) {
        setTime(new Date(editJob.time));
      }
      onClearEdit();
    }
  }, [editJob, onClearEdit]);

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
      setPerson(""); setNetwork(""); setTime(null); setMessage("");
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

  const handleSchedule = () => {
    if (!person || !network || !time || !message) {
      setErrorMsg("All fields are required.");
      return;
    }
    setErrorMsg("");
    scheduleMutation.mutate({ person, network, time: time.toISOString(), message });
  };

  const handleSaveTemplate = (name: string) => {
    if (!name) return;
    saveTemplateMutation.mutate({ name, person, network, text: message });
  };

  const setQuickTime = (type: '1h' | 'tomorrow' | 'friday') => {
    const now = new Date();
    if (type === '1h') setTime(startOfMinute(addHours(now, 1)));
    if (type === 'tomorrow') setTime(startOfMinute(setHours(addDays(now, 1), 9)));
    if (type === 'friday') setTime(startOfMinute(setHours(nextFriday(now), 17)));
  };
  
  const handleMediaUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const res = await fetchApi('/upload', {
          method: 'POST',
          body: formData,
        });
        // Assuming backend returns { path: string }
        if (res.path) {
           // We might append the file path to the message for now, as the plan doesn't specify a separate media field in DB,
           // or we can just append a reference.
           setMessage(prev => prev + `\n[Attachment: ${res.path}]`);
        }
      } catch (err: any) {
        setErrorMsg("Failed to upload media: " + err.message);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-6">
      <TemplateModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} onSave={handleSaveTemplate} />
      <LoadTemplateModal isOpen={isLoadModalOpen} onClose={() => setIsLoadModalOpen(false)} onLoad={(t) => {
        setPerson(t.person || "");
        setNetwork(t.network || "");
        setMessage(t.text || "");
        setIsLoadModalOpen(false);
      }} />

      {errorMsg && (
        <div className="p-3 bg-red-900/40 border border-red-500 rounded text-red-200 text-sm">
          {errorMsg}
        </div>
      )}
      
      <div className="flex justify-end mb-[-1rem]">
         <button onClick={() => setIsLoadModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-all duration-150 active:scale-95 border border-gray-600">
           <FolderOpen className="w-4 h-4" /> Load Template
         </button>
      </div>

      <div className="flex gap-4 flex-col md:flex-row">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1 text-gray-300">Recipient</label>
          <ContactAutocomplete 
            person={person} 
            onChange={(p, net) => { setPerson(p); if (net) setNetwork(net); }} 
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1 text-gray-300">Network</label>
          <select 
            className="w-full p-2.5 border rounded bg-gray-800 text-white border-gray-600 focus:border-blue-500 focus:outline-none transition-colors z-50 capitalize"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
          >
            <option value="">Select Network...</option>
            {enabledNetworks.map(net => (
              <option key={net} value={net}>{net}</option>
            ))}
            {network && !enabledNetworks.includes(network.toLowerCase()) && (
              <option value={network}>{network}</option>
            )}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-300">Send At</label>
        <div className="flex gap-2 mb-3 flex-wrap">
          <button onClick={() => setQuickTime('1h')} className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/50 hover:bg-blue-600 hover:text-white rounded text-sm transition-all duration-150 active:scale-95">In 1 Hour</button>
          <button onClick={() => setQuickTime('tomorrow')} className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/50 hover:bg-blue-600 hover:text-white rounded text-sm transition-all duration-150 active:scale-95">Tomorrow 9 AM</button>
          <button onClick={() => setQuickTime('friday')} className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-600/50 hover:bg-blue-600 hover:text-white rounded text-sm transition-all duration-150 active:scale-95">Friday 5 PM</button>
        </div>
        <DatePicker
          selected={time}
          onChange={(date: Date | null) => setTime(date)}
          showTimeSelect
          timeFormat="HH:mm"
          timeIntervals={15}
          dateFormat="MMMM d, yyyy h:mm aa"
          className="w-full p-2.5 border rounded bg-gray-800 text-white border-gray-600 focus:border-blue-500 focus:outline-none"
          placeholderText="Select date and time"
          wrapperClassName="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-300">Message</label>
        <textarea 
          className="w-full p-3 border rounded bg-gray-800 text-white border-gray-600 h-32 focus:border-blue-500 focus:outline-none resize-none"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
        />
        <div className="flex justify-between items-center mt-2">
          <button onClick={handleMediaUpload} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-all duration-150 active:scale-95 border border-gray-600">
            <Paperclip className="w-4 h-4" /> Attach Media
          </button>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-gray-800">
        <button 
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium shadow-lg transition-all duration-150 active:scale-95 disabled:opacity-50"
          onClick={handleSchedule}
          disabled={scheduleMutation.isPending}
        >
          <Send className="w-4 h-4" />
          {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule Message'}
        </button>
        <button 
          onClick={() => setIsSaveModalOpen(true)}
          className="flex items-center gap-2 px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium shadow transition-all duration-150 active:scale-95"
        >
          <Save className="w-4 h-4" />
          Save as Template
        </button>
      </div>
    </div>
  );
}
