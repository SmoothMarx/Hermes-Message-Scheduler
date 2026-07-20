import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "../api";
import { RefreshCw, CheckCircle2, XCircle, Trash2, CheckSquare } from "lucide-react";

export function HistoryTab({ onRetry }: { onRetry: (job: any) => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["history"], queryFn: () => fetchApi("/history") });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchApi(`/history/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
    onError: (e: any) => alert("Failed to delete: " + e.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = (history: any[]) => {
    if (selectedIds.size === history.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(history.map((h: any) => h.id)));
  };
  const deleteSelected = () => {
    selectedIds.forEach(id => deleteMutation.mutate(id));
    setSelectedIds(new Set());
  };

  if (isLoading) return <div className="text-gray-400 py-4">Loading history...</div>;

  const history = data?.history || [];

  if (history.length === 0) {
    return <div className="text-gray-400 py-8 text-center border border-dashed border-gray-800 rounded-xl">No message history available.</div>;
  }

  return (
    <div className="space-y-3">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-gray-800/50 p-3 rounded-xl border border-gray-800">
          <span className="text-sm text-gray-400">{selectedIds.size} selected</span>
          <button onClick={deleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 rounded-lg text-sm transition-all duration-150 active:scale-95">
            <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedIds.size})
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 px-1 pb-1 border-b border-gray-700/50">
        <input type="checkbox"
          checked={selectedIds.size > 0 && selectedIds.size === history.length}
          onChange={() => toggleSelectAll(history)}
          className="rounded border-gray-600/50 bg-gray-800 text-blue-400 focus:ring-blue-500/50 focus:ring-offset-0" />
        <span className="text-xs text-gray-500 uppercase tracking-wider">
          {selectedIds.size > 0 ? `${selectedIds.size} of ${history.length} selected` : `${history.length} entries`}
        </span>
      </div>
      {history.map((item: any, idx: number) => (
        <div key={item.id || idx} className="p-4 bg-gray-900/50 rounded-xl border border-gray-800/50">
          <div className="flex gap-3">
            <div className="flex-shrink-0 pt-1">
              <input type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelect(item.id)}
                className="rounded border-gray-600/50 bg-gray-800 text-blue-400 focus:ring-blue-500/50 focus:ring-offset-0" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium flex items-center gap-2"> 
                <span>{item.person} <span className="text-gray-500 text-xs uppercase ml-1">{item.network}</span></span>
                <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium ${item.status?.toLowerCase() === "sent" ? "bg-green-900/20 text-green-400 border border-green-800/30" : "bg-red-900/20 text-red-400 border border-red-800/30"}`}>
                  {item.status?.toLowerCase() === "sent" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {item.status}
                </span>
              </div>
              <div className="text-sm text-gray-400 mt-1">{item.time}</div>
              {item.error && <div className="text-sm text-red-400 mt-1">Error: {item.error}</div>}
              <div className="text-sm mt-2 text-gray-300 truncate max-w-lg">{item.text}</div>
            </div>
            <div className="flex flex-col gap-2 ml-3 flex-shrink-0">
              {item.status !== "Sent" && (
                <button onClick={() => onRetry(item)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 rounded-lg text-sm transition-all duration-150 active:scale-95">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              )}
              <button onClick={() => {
                if (confirm("Delete this history entry?")) deleteMutation.mutate(item.id);
              }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 rounded-lg text-sm transition-all duration-150 active:scale-95">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
