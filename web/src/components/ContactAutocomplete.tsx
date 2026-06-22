import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api';
import { MessageCircle, Phone, Monitor, Hash } from 'lucide-react';

export function ContactAutocomplete({ person, onChange }: { person: string, onChange: (p: string, net?: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: contactsData } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => fetchApi('/contacts')
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const rawContacts = contactsData?.platforms || {};
  const flatContacts: Array<{name: string, network: string, id: string}> = [];
  
  Object.entries(rawContacts).forEach(([network, users]: [string, any]) => {
    if (enabledNetworks.length === 0 || enabledNetworks.includes(network.toLowerCase())) {
      users.forEach((u: any) => {
        flatContacts.push({
          name: u.name || u.id,
          network,
          id: u.id
        });
      });
    }
  });

  const filtered = flatContacts.filter(c => 
    c.name.toLowerCase().includes(person.toLowerCase()) || 
    c.id.toLowerCase().includes(person.toLowerCase())
  );

  const getNetworkIcon = (network: string) => {
    const net = network.toLowerCase();
    if (net === 'telegram') return <span className="mr-1 inline-flex items-center text-blue-400"><MessageCircle className="w-4 h-4" /></span>;
    if (net === 'whatsapp') return <span className="mr-1 inline-flex items-center text-green-500"><Phone className="w-4 h-4" /></span>;
    if (net === 'discord') return <span className="mr-1 inline-flex items-center text-indigo-400"><Hash className="w-4 h-4" /></span>;
    if (net === 'beeper') return <span className="mr-1 inline-flex items-center text-red-400"><Monitor className="w-4 h-4" /></span>;
    return <span className="mr-1 inline-flex items-center text-gray-400"><MessageCircle className="w-4 h-4" /></span>;
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <input 
        type="text" 
        className="w-full p-2.5 border rounded bg-gray-800 text-white border-gray-600 focus:outline-none focus:border-blue-500"
        value={person}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search contacts... (e.g. SmoothMarx)" 
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-[60] w-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-2xl max-h-60 overflow-y-auto">
          {filtered.map((c, i) => (
            <div 
              key={i} 
              className="p-3 bg-gray-800 hover:bg-blue-600 hover:outline hover:outline-2 hover:outline-white hover:z-10 relative text-white cursor-pointer text-sm border-b border-gray-700 last:border-b-0 transition-all duration-150 active:scale-95 active:brightness-90 transform"
              onClick={() => {
                onChange(c.name, c.network);
                setIsOpen(false);
              }}
            >
              <div className="font-medium flex items-center">
                {getNetworkIcon(c.network)}
                {c.name}
                <span className="ml-auto px-1.5 py-0.5 bg-gray-900 rounded text-xs text-gray-400 uppercase tracking-wider border border-gray-700">{c.network}</span>
              </div>
              {c.name !== c.id && <div className="text-gray-400 text-xs mt-0.5 ml-5">{c.id}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
