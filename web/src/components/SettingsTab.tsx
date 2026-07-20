import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "../api";
import { RefreshCw, Save, Plus, Trash2, Users, Bot, CheckCircle2, XCircle, Bell, Edit3 } from "lucide-react";

// Platform icons using actual brand SVGs
const PLATFORM_SVGS: Record<string, string> = {
  telegram: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.22c.309-1.239-.473-1.8-1.282-1.434z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
  signal: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.02 3.289a8.704 8.704 0 0 1 6.163 2.546 8.704 8.704 0 0 1 0 12.33 8.704 8.704 0 0 1-12.33 0 8.704 8.704 0 0 1 0-12.33 8.704 8.704 0 0 1 6.167-2.546zM12 5.73a6.17 6.17 0 0 0-4.38 1.822l-.058.059a6.17 6.17 0 0 0 0 8.737l.058.059a6.17 6.17 0 0 0 8.737 0l.059-.059a6.17 6.17 0 0 0 0-8.737l-.059-.059A6.17 6.17 0 0 0 12 5.73z"/></svg>`,
  sms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.074.074 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>`,
  beeper: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
};

const PLATFORM_COLORS: Record<string, string> = {
  telegram: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.22c.309-1.239-.473-1.8-1.282-1.434z"/></svg>`,
  whatsapp: "text-green-500",
  facebook: "text-blue-600",
  instagram: "text-pink-500",
  linkedin: "text-blue-400",
  signal: "text-purple-400",
  sms: "text-yellow-400",
  email: "text-gray-400",
  discord: "text-indigo-400",
  beeper: "text-red-400",
};

function PlatformIcon({ network }: { network: string }) {
  const svg = PLATFORM_SVGS[network.toLowerCase()];
  const color = PLATFORM_COLORS[network.toLowerCase()] || "text-gray-400";
  if (svg) {
    return <span className={`w-4 h-4 ${color}`} dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  // Fallback: first letter
  return <span className={`text-xs font-bold uppercase ${color}`}>{network[0]}</span>;
}

export function SettingsTab() {
  const queryClient = useQueryClient();

  // Platform toggles
  const [platforms, setPlatforms] = useState(() => {
    try { return JSON.parse(localStorage.getItem("scheduled_msgs_platforms") || "{}"); }
    catch { return {}; }
  });
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [forceSyncing, setForceSyncing] = useState(false);

  // New contact form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNetwork, setNewNetwork] = useState("sms");
  const [newIdentifier, setNewIdentifier] = useState("");

  const [connectionTesting, setConnectionTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<boolean | null>(null);
  const [showIconLegend, setShowIconLegend] = useState(false);

  // Notify Me state
  const [notifyChannel, setNotifyChannel] = useState("");
  const [notifyIdentifier, setNotifyIdentifier] = useState("");
  const [notifyTestResult, setNotifyTestResult] = useState<boolean | null>(null);

  const { data: notifySettings } = useQuery({
    queryKey: ['notify-settings'],
    queryFn: () => fetchApi('/settings/notify'),
  });

  useEffect(() => {
    if (notifySettings) {
      setNotifyChannel(notifySettings.channel || "");
      setNotifyIdentifier(notifySettings.identifier || "");
    }
  }, [notifySettings]);

  const saveNotifySettings = async () => {
    await fetchApi('/settings/notify', {
      method: 'POST',
      body: JSON.stringify({ channel: notifyChannel, identifier: notifyIdentifier }),
    });
    queryClient.invalidateQueries({ queryKey: ['notify-settings'] });
  };

  const testNotify = async () => {
    try {
      await saveNotifySettings();
      const r = await fetchApi('/send', {
        method: 'POST',
        body: JSON.stringify({
          person: notifyIdentifier || "myself",
          network: notifyChannel,
          text: "🔔 Test notification from Message Scheduler",
          time: new Date().toISOString(),
        }),
      });
      setNotifyTestResult(r.status === 'queued_for_immediate');
    } catch {
      setNotifyTestResult(false);
    }
  };

  const { data: configData } = useQuery({
    queryKey: ['config'],
    queryFn: () => fetchApi('/config'),
    staleTime: 60000,
  });

  const { data: platformStatus } = useQuery({
    queryKey: ['platform-status'],
    queryFn: () => fetchApi('/platforms/status').then(r => r.platforms),
    refetchInterval: 30000,
  });

  const testConnection = useCallback(async () => {
    setConnectionTesting(true);
    setConnectionResult(null);
    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'say "ok"' })
      }).then(res => res.json());
      setConnectionResult(r.status === 'ok' || r.text);
    } catch {
      setConnectionResult(false);
    }
    setConnectionTesting(false);
  }, []);

  const handleToggle = (p: string) => setPlatforms({ ...platforms, [p]: !platforms[p] });

  const saveSettings = () => {
    localStorage.setItem("scheduled_msgs_platforms", JSON.stringify(platforms));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSync = async (net: string) => {
    setSyncing(net);
    try {
      await fetchApi(`/contacts/sync/${net}`, { method: "POST" });
      alert(`Sync triggered for ${net}.`);
    } catch(e: any) {
      alert(`Failed to sync ${net}: ${e.message}`);
    }
    setSyncing(null);
  };

  // Contacts
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => fetchApi("/contacts"),
  });

  const addContactMutation = useMutation({
    mutationFn: (c: any) => fetchApi("/contacts", { method: "POST", body: JSON.stringify(c) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setShowAddForm(false);
      setNewName("");
      setNewNetwork("");
      setNewIdentifier("");
    },
    onError: (e: any) => alert("Failed to add contact: " + e.message),
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: number) => fetchApi(`/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
    onError: (e: any) => alert("Failed to delete contact: " + e.message),
  });

  // Edit contact state
  const [editingContact, setEditingContact] = useState<{id: number; name: string; network: string; identifier: string; networks: any[]} | null>(null);

  const updateContactMutation = useMutation({
    mutationFn: (c: {id: number; name: string; network: string; identifier: string}) =>
      fetchApi(`/contacts/${c.id}`, { method: "PUT", body: JSON.stringify({ name: c.name, network: c.network, identifier: c.identifier }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setEditingContact(null);
    },
    onError: (e: any) => alert("Failed to update contact: " + e.message),
  });

  // Flatten contacts from platform groups
  const allContacts: Array<{id?: number; name: string; network: string; identifier?: string}> = [];
  if (contactsData?.platforms) {
    // We need IDs for deletion — fetch them differently. Let's add a flat list endpoint eventually.
    // For now, show them from the flat API response
  }

  return (
    <div className="space-y-6">
      {/* Platform Status */}
      <div className="bg-gray-900/30 rounded-xl border border-gray-800/50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Platform Status</h3>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(PLATFORM_COLORS).filter(([k]) => k !== 'beeper').map(([name, color]) => {
            const svg = PLATFORM_SVGS[name];
            const direct = platformStatus?.[name]?.connected;
            const bridgedViaBeeper = !!(platformStatus?.beeper?.connected && ['facebook', 'instagram', 'linkedin', 'signal', 'discord'].includes(name));
            const connected = direct ?? bridgedViaBeeper ?? false;
            return (
              <span key={name} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                connected ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {svg ? <span className={`w-3.5 h-3.5 ${color}`} dangerouslySetInnerHTML={{ __html: svg }} /> : <span className={`text-xs font-bold ${color}`}>{name[0]}</span>}
                <span>{connected ? '✓' : '✗'}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Platform Toggles */}
      <div className="bg-gray-900/30 rounded-xl border border-gray-800/50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Enabled Platforms</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {["WhatsApp", "Telegram", "Discord", "Beeper", "SMS", "Google_Contacts"].map(p => {
            const key = p.toLowerCase();
            return (
              <div key={key} className="flex flex-col gap-2 p-3 bg-gray-800 rounded border border-gray-700 hover:border-gray-500 transition-colors">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={!!platforms[key]} onChange={() => handleToggle(key)}
                    className="w-4 h-4 text-blue-600 rounded bg-gray-900 border-gray-600" />
                  <span className="font-medium text-gray-200">{p.replace("_", " ")}</span>
                </label>
                <button onClick={() => handleSync(key)} disabled={syncing === key}
                  className="flex items-center justify-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-all duration-150 active:scale-95 disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${syncing === key ? "animate-spin" : ""}`} /> Rescan
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact Manager */}
      <div className="bg-gray-900/30 rounded-xl border border-gray-800/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Users className="w-4 h-4" /> Contacts
          </h3>
          <div className="flex gap-2">
            <button onClick={async () => {
              setForceSyncing(true);
              try {
                await fetchApi("/contacts/sync/all", { method: "POST" });
                queryClient.invalidateQueries({ queryKey: ["contacts"] });
                alert("Contact sync complete!");
              } catch(e: any) {
                alert("Failed to trigger sync: " + e.message);
              }
              setForceSyncing(false);
            }}
              disabled={forceSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm transition-all duration-150 active:scale-95 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${forceSyncing ? "animate-spin" : ""}`} />
              {forceSyncing ? "Syncing..." : "Force Sync"}
            </button>
            <button onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-all duration-150 active:scale-95">
              <Plus className="w-4 h-4" /> {showAddForm ? "Cancel" : "Add Contact"}
            </button>
          </div>
        </div>

        {/* Add Contact Form */}
        {showAddForm && (
          <div className="p-4 bg-gray-800 rounded border border-gray-700 mb-4 space-y-3">
            <div className="flex gap-3 flex-col md:flex-row">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full p-2 border rounded bg-gray-900 text-white border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                  placeholder="e.g. Maria Silva" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-400 mb-1">Platform</label>
                <select value={newNetwork} onChange={e => setNewNetwork(e.target.value)}
                  className="w-full p-2 border rounded bg-gray-900 text-white border-gray-600 focus:border-blue-500 focus:outline-none text-sm">
                  <option value="">Select...</option>
                  <option value="telegram">Telegram</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="beeper">Beeper</option>
                  <option value="discord">Discord</option>
                  <option value="sms">SMS</option>
                  <option value="signal">Signal</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-400 mb-1">ID / Handle (optional)</label>
                <input type="text" value={newIdentifier} onChange={e => setNewIdentifier(e.target.value)}
                  className="w-full p-2 border rounded bg-gray-900 text-white border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                  placeholder="e.g. @maria_silva" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => {
                if (!newName || !newNetwork) { alert("Name and platform are required"); return; }
                addContactMutation.mutate({ name: newName, network: newNetwork, identifier: newIdentifier });
              }}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm transition-all duration-150 active:scale-95">
                <Plus className="w-4 h-4" /> Add Contact
              </button>
            </div>
          </div>
        )}

        {/* Contact List */}
        {contactsLoading ? (
          <div className="text-gray-400 text-sm py-2">Loading contacts...</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">
                {contactsData?.contacts?.length || 0} unique contacts
              </span>
              <button onClick={() => setShowIconLegend(true)}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-300 transition-colors"
                title="Platform icons legend">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                  <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={2} />
                </svg>
              </button>
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto">
            {(contactsData?.contacts || []).map((c: any) => (
              <div key={c.name}
                className="flex items-center justify-between p-2 bg-gray-800/50 rounded border border-gray-700/50 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-200 font-medium truncate">{c.name}</span>
                  <div className="flex gap-1 flex-shrink-0 flex-wrap">
                    {(c.networks || []).map((n: any) => (
                      <span key={n.id || n.network} className="inline-flex items-center justify-center w-5 h-5 rounded" title={n.network}>
                        <PlatformIcon network={n.network} />
                      </span>
                    ))}
                  </div>
                </div>
                {c.networks?.[0]?.id && (
                  <div className="flex gap-1 ml-2 flex-shrink-0">
                    <button onClick={() => {
                      const net = c.networks[0];
                      setEditingContact({ id: net.id, name: c.name, network: net.network, identifier: net.identifier || "", networks: c.networks });
                    }}
                      className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-300 transition-colors">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => {
                      if (confirm(`Remove all platforms for ${c.name}?`)) {
                        c.networks.forEach((n: any) => deleteContactMutation.mutate(n.id));
                      }
                    }}
                      className="p-1 hover:bg-red-800 rounded text-red-400 hover:text-red-300 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {(!contactsData?.contacts || contactsData.contacts.length === 0) && (
              <div className="text-gray-500 text-sm py-4 text-center border border-dashed border-gray-700 rounded">
                No contacts yet. Add one above or use Force Sync.
              </div>
            )}
          </div>
          {/* Edit Contact Form — outside scrollable area */}
          {editingContact && (
            <div className="p-4 bg-gray-800 rounded-lg border border-gray-700/50 mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400">Edit contact: <span className="text-white">{editingContact.name}</span></p>
                <button onClick={() => setEditingContact(null)}
                  className="text-gray-500 hover:text-gray-300 text-sm">✕</button>
              </div>
              <div className="flex gap-3 flex-col md:flex-row">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Platform</label>
                  <select value={editingContact.network} onChange={e => {
                      const newNet = e.target.value;
                      if (!newNet) return;
                      const match = editingContact.networks.find((n: any) => n.network === newNet);
                      setEditingContact({...editingContact, network: newNet, id: match?.id || editingContact.id, identifier: match?.identifier || "" });
                    }}
                    className="w-full p-2 rounded-lg bg-gray-900/50 text-white border border-gray-700/50 text-sm focus:outline-none focus:border-blue-500/50">
                    <option value="">Add new network...</option>
                    {editingContact.networks.map((n: any) => (
                      <option key={n.network} value={n.network} className="capitalize">{n.network}</option>
                    ))}
                    <optgroup label="─ Other ─">
                      {["telegram","whatsapp","beeper","discord","sms","signal","email","facebook","instagram","linkedin"]
                        .filter(net => !editingContact.networks.some((n: any) => n.network === net))
                        .map(net => (
                          <option key={net} value={net} className="capitalize">{net}</option>
                        ))}
                    </optgroup>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Identifier</label>
                  <input type="text" value={editingContact.identifier} onChange={e => setEditingContact({...editingContact, identifier: e.target.value})}
                    className="w-full p-2 rounded-lg bg-gray-900/50 text-white border border-gray-700/50 text-sm focus:outline-none focus:border-blue-500/50" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingContact(null)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">Cancel</button>
                <button onClick={() => updateContactMutation.mutate(editingContact)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs transition-colors">Save</button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Icon Legend Modal */}
      {showIconLegend && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={() => setShowIconLegend(false)}>
          <div className="bg-gray-900 p-6 rounded border border-gray-700 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-white">Platform Icons</h3>
            <div className="space-y-2">
              {Object.entries(PLATFORM_COLORS).filter(([k]) => k !== 'beeper').map(([name, color]) => {
                const svg = PLATFORM_SVGS[name];
                return (
                  <div key={name} className="flex items-center gap-3 text-sm">
                    {svg ? <span className={`w-5 h-5 ${color}`} dangerouslySetInnerHTML={{ __html: svg }} /> : <span className={`text-sm font-bold ${color}`}>{name[0]}</span>}
                    <span className="text-gray-300 capitalize">{name}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowIconLegend(false)}
                className="px-4 py-2 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition-all duration-150 active:scale-95">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Hermes Connection */}
      <div className="bg-gray-900/30 rounded-xl border border-gray-800/50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-purple-400" />
          Hermes Connection
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Configure the Hermes bridge URL in your docker-compose.yml as <code className="text-purple-300 bg-gray-800 px-1 rounded">HERMES_BRIDGE_URL</code>.
          The bridge is a lightweight HTTP server that relays messages to your Hermes agent.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 w-24">Bridge URL:</label>
            <input type="text" readOnly value={configData?.bridge_url || 'Loading...'}
              className="flex-1 p-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 font-mono" />
          </div>
          <div className="flex gap-2">
            <button onClick={testConnection}
              disabled={connectionTesting}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-sm transition-all duration-150 active:scale-95 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${connectionTesting ? 'animate-spin' : ''}`} />
              {connectionTesting ? 'Testing...' : 'Test Connection'}
            </button>
            {connectionResult !== null && (
              <span className={`flex items-center gap-1 text-sm ${connectionResult ? 'text-green-400' : 'text-red-400'}`}>
                {connectionResult ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {connectionResult ? 'Connected' : 'Failed'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Notify Me */}
      <div className="bg-gray-900/30 rounded-xl border border-gray-800/50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-amber-400" />
          Notify Me
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Get notified when a scheduled message is sent or fails.
        </p>
        <div className="flex gap-3 flex-col md:flex-row items-start md:items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs text-gray-500 mb-1">Channel</label>
            <select value={notifyChannel} onChange={e => setNotifyChannel(e.target.value)}
              className="w-full p-2 rounded-lg bg-gray-800/50 text-white border border-gray-700/50 focus:outline-none focus:border-blue-500/50 text-sm">
              <option value="">Disabled</option>
              <option value="telegram">Telegram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="beeper">Beeper</option>
            </select>
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs text-gray-500 mb-1">Your ID / Chat</label>
            <input type="text" value={notifyIdentifier} onChange={e => setNotifyIdentifier(e.target.value)}
              placeholder={notifyChannel === 'telegram' ? 'Your Telegram chat ID' : notifyChannel === 'whatsapp' ? 'Your phone number' : 'myself'}
              className="w-full p-2 rounded-lg bg-gray-800/50 text-white border border-gray-700/50 focus:outline-none focus:border-blue-500/50 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={saveNotifySettings}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-all shadow-sm">
              Save
            </button>
            <button onClick={testNotify}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-all border border-gray-700/50">
              Test
            </button>
          </div>
        </div>
        {notifyTestResult !== null && (
          <div className={`mt-2 text-xs ${notifyTestResult ? 'text-green-400' : 'text-red-400'}`}>
            {notifyTestResult ? 'Test notification sent ✓' : 'Failed to send test notification'}
          </div>
        )}
      </div>

      {/* Save Settings Button */}
      <div className="pt-4 border-t border-gray-800">
        <button onClick={saveSettings}
          className={`flex items-center gap-2 px-6 py-2.5 rounded font-medium shadow transition-all duration-150 active:scale-95 ${
            saved ? "bg-green-600 hover:bg-green-500 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}>
          <Save className="w-4 h-4" />
          {saved ? "Settings Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
