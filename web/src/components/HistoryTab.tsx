import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "../api";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";

export function HistoryTab({ onRetry }: { onRetry: (job: any) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["history"], queryFn: () => fetchApi("/history") });

  if (isLoading) return <div className="text-gray-400 py-4">Loading history...</div>;

  const history = data?.history || [];

  if (history.length === 0) {
    return <div className="text-gray-400 py-8 text-center border border-dashed border-gray-700 rounded-lg">No message history available.</div>;
  }

  return (
    <div className="space-y-3">
      {history.map((item: any, idx: number) => (
        <div key={idx} className="p-4 bg-gray-800 rounded border border-gray-700 flex justify-between items-center">
          <div>
            <div className="font-medium flex items-center gap-2"> 
              <span>{item.person} <span className="text-gray-500 text-xs uppercase ml-1">{item.network}</span></span>
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${item.status === "Sent" ? "bg-green-900/30 text-green-400 border-green-800" : "bg-red-900/30 text-red-400 border-red-800"}`}>
                {item.status === "Sent" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {item.status}
              </span>
            </div>
            <div className="text-sm text-gray-400 mt-1">{item.time}</div>
            {item.error && <div className="text-sm text-red-400 mt-1">Error: {item.error}</div>}
            <div className="text-sm mt-2 text-gray-300 truncate max-w-lg">{item.text}</div>
          </div>
          {item.status !== "Sent" && (
            <div>
              <button 
                onClick={() => onRetry(item)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600/20 hover:bg-yellow-600 text-yellow-500 hover:text-white border border-yellow-600/50 rounded text-sm transition-all duration-150 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
