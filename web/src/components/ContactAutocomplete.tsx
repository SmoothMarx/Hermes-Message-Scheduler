import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api';
import { MessageCircle, Phone, Monitor, Hash, Smartphone, Shield, Mail, Users, MessageSquare, Camera, Briefcase, Search } from 'lucide-react';

const NETWORK_ICONS: Record<string, {icon: any, color: string}> = {
  telegram:  { icon: MessageCircle, color: 'text-blue-400' },
  whatsapp:  { icon: Phone, color: 'text-green-500' },
  beeper:    { icon: Monitor, color: 'text-red-400' },
  discord:   { icon: Hash, color: 'text-indigo-400' },
  sms:       { icon: Smartphone, color: 'text-yellow-400' },
  signal:    { icon: Shield, color: 'text-purple-400' },
  email:     { icon: Mail, color: 'text-gray-400' },
  facebook:  { icon: MessageSquare, color: 'text-blue-500' },
  'facebook/messenger': { icon: MessageSquare, color: 'text-blue-500' },
  instagram: { icon: Camera, color: 'text-pink-400' },
  linkedin:  { icon: Briefcase, color: 'text-blue-300' },
};

function getNetworkMeta(network: string) {
  return NETWORK_ICONS[network.toLowerCase()] || { icon: MessageCircle, color: 'text-gray-400' };
}

interface BeeperSearchResult {
  name: string;
  network: string;
  platform_id: string;
  account_id: string;
}

export function ContactAutocomplete({ person, onChange }: { person: string, onChange: (p: string, net?: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [beeperResults, setBeeperResults] = useState<BeeperSearchResult[]>([]);
  const debounceRef = useRef<any>(null);
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

  // Debounced Beeper search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (person.trim().length < 3) {
      setBeeperResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetchApi('/search-beeper', {
          method: 'POST',
          body: JSON.stringify({ query: person.trim() }),
        });
        setBeeperResults(r.results || []);
      } catch {
        setBeeperResults([]);
      }
      setSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [person]);

  const rawContacts: Array<{name: string; networks: Array<{network: string; identifier: string; id: number}>}> =
    contactsData?.contacts || [];

  const filtered = person.trim() === ""
    ? rawContacts
    : rawContacts.filter(c =>
        c.name.toLowerCase().startsWith(person.toLowerCase()) ||
        c.name.toLowerCase().includes(person.toLowerCase())
      );

  const hasContacts = rawContacts.length > 0;

  const handleSelectBeeperResult = async (r: BeeperSearchResult) => {
    // Create the Beeper chat, add to contacts, then select
    try {
      const participantId = `@${r.account_id}_${r.platform_id}:beeper.local`;
      const chatResult = await fetchApi('/bridge-create-chat', {
        method: 'POST',
        body: JSON.stringify({ accountID: r.account_id, participantID: participantId }),
      });
      if (chatResult?.chat_id) {
        // Add to local contacts table so it's available for scheduling
        await fetchApi('/api/contacts', {
          method: 'POST',
          body: JSON.stringify({ name: r.name, network: r.network, identifier: chatResult.chat_id }),
        }).catch(() => {});
      }
    } catch {}
    onChange(r.name, r.network);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <input 
        type="text" 
        className="w-full p-2.5 border rounded bg-gray-800 text-white border-gray-600 focus:outline-none focus:border-blue-500"
        value={person}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder="Type a contact name or search Beeper..."
      />
      {isOpen && (
        <div className="absolute z-[60] w-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-2xl max-h-80 overflow-y-auto">
          {/* Local contacts */}
          {!hasContacts && filtered.length === 0 && !searching && beeperResults.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No contacts yet.</p>
              <p className="text-xs mt-1">Search Beeper below to find people on your connected platforms.</p>
            </div>
          )}
          {hasContacts && filtered.length > 0 && filtered.map((c, i) => {
            const preferredNet = c.networks.find(n => n.network !== 'beeper') || c.networks[0];
            const primaryNet = preferredNet?.network || 'telegram';
            return (
              <div 
                key={i} 
                className="p-3 hover:bg-blue-600 hover:outline hover:outline-2 hover:outline-white hover:z-10 relative text-white cursor-pointer text-sm border-b border-gray-700 last:border-b-0 transition-all duration-150 active:scale-[0.98] transform"
                onClick={() => {
                  onChange(c.name, primaryNet);
                  setIsOpen(false);
                }}
              >
                <div className="font-medium">{c.name}</div>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {c.networks.map((net, j) => {
                    const meta = getNetworkMeta(net.network);
                    const Icon = meta.icon;
                    return (
                      <span key={j} className={`inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-900 rounded text-xs uppercase tracking-wider border border-gray-700 ${meta.color}`}>
                        <Icon className="w-3 h-3" />
                        {net.network === 'beeper' ? 'Beeper' : net.network}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Beeper search section */}
          {person.trim().length >= 3 && (
            <>
              {hasContacts && filtered.length > 0 && (
                <div className="px-3 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 border-t border-gray-700/50">
                  Search Beeper...
                </div>
              )}
              {(!hasContacts || filtered.length === 0) && searching && (
                <div className="p-3 text-gray-400 text-sm text-center flex items-center justify-center gap-2">
                  <Search className="w-4 h-4 animate-pulse" />
                  Searching Beeper...
                </div>
              )}
              {!searching && beeperResults.length > 0 && beeperResults.map((r, i) => {
                const meta = getNetworkMeta(r.network);
                const Icon = meta.icon;
                return (
                  <div
                    key={`beeper-${i}`}
                    className="p-3 hover:bg-blue-600 hover:outline hover:outline-2 hover:outline-white hover:z-10 relative cursor-pointer text-sm border-b border-gray-700 last:border-b-0 transition-all duration-150 active:scale-[0.98] transform"
                    onClick={() => handleSelectBeeperResult(r)}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                      <div>
                        <div className="text-white font-medium">{r.name}</div>
                        <div className="text-gray-400 text-xs mt-0.5 capitalize">{r.network}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!searching && beeperResults.length === 0 && person.trim().length >= 3 && !hasContacts && (
                <div className="p-3 text-gray-500 text-sm text-center">
                  No results on Facebook, Instagram, or LinkedIn
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}