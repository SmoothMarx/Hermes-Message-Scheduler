import { useState } from "react";
import { fetchApi } from "../api";
import { RefreshCw, Save } from "lucide-react";

export function SettingsTab() {
  const [platforms, setPlatforms] = useState(() => {
    try { return JSON.parse(localStorage.getItem("scheduled_msgs_platforms") || "{}"); } catch { return {}; }
  });
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

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
      alert(`Successfully synced ${net} contacts!`);
    } catch(e: any) {
      alert(`Failed to sync ${net}: ${e.message}`);
    }
    setSyncing(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium border-b border-gray-700 pb-2 mb-4 text-white">Enabled Platforms</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {["WhatsApp", "Telegram", "Discord", "Beeper", "SMS", "Google_Contacts"].map(p => {
            const key = p.toLowerCase();
            return (
              <div key={key} className="flex flex-col gap-2 p-3 bg-gray-800 rounded border border-gray-700 hover:border-gray-500 transition-colors">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={!!platforms[key]} onChange={() => handleToggle(key)} className="w-4 h-4 text-blue-600 rounded bg-gray-900 border-gray-600" />
                  <span className="font-medium text-gray-200">{p.replace("_", " ")}</span>
                </label>
                <button 
                  onClick={() => handleSync(key)}
                  disabled={syncing === key}
                  className="flex items-center justify-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-all duration-150 active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${syncing === key ? "animate-spin" : ""}`} /> Rescan
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="pt-4 border-t border-gray-800">
        <button 
          onClick={saveSettings} 
          className={`flex items-center gap-2 px-6 py-2.5 rounded font-medium shadow transition-all duration-150 active:scale-95 ${saved ? "bg-green-600 hover:bg-green-500 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"}`}
        >
          <Save className="w-4 h-4" />
          {saved ? "Settings Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
