import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../api';
import { Edit3, Send, X, Clock, Trash2, CheckSquare, RefreshCw } from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';

export function QueueTab({ onEdit }: { onEdit: (job: any) => void }) {
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === jobs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(jobs.map((j: any) => j.id)));
  };
  const deleteSelected = () => {
    selectedIds.forEach(id => deleteMutation.mutate(String(id)));
    setSelectedIds(new Set());
  };

  const { data, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => fetchApi('/jobs'),
    refetchInterval: 15000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/jobs/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] });
      const previousJobs = queryClient.getQueryData(['jobs']);
      queryClient.setQueryData(['jobs'], (old: any) => ({
        ...old,
        jobs: (old?.jobs || []).filter((j: any) => j.id !== id),
      }));
      return { previousJobs };
    },
    onError: (err, _id, context: any) => {
      queryClient.setQueryData(['jobs'], context.previousJobs);
      alert("Failed to cancel job: " + err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const sendMutation = useMutation({
    mutationFn: (job: any) => fetchApi('/send', { method: 'POST', body: JSON.stringify(job) }),
    onMutate: async (job) => {
      await queryClient.cancelQueries({ queryKey: ['jobs'] });
      const previousJobs = queryClient.getQueryData(['jobs']);
      queryClient.setQueryData(['jobs'], (old: any) => ({
        ...old,
        jobs: (old?.jobs || []).filter((j: any) => j.id !== job.id),
      }));
      return { previousJobs };
    },
    onSuccess: () => alert("Message sent successfully!"),
    onError: (err, _job, context: any) => {
      queryClient.setQueryData(['jobs'], context?.previousJobs);
      alert("Failed to send immediately: " + err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  if (isLoading) return <div className="text-gray-400 py-4">Loading queue...</div>;

  const jobs = data?.jobs || [];

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 border border-dashed border-gray-800 rounded-xl">
        <Clock className="w-12 h-12 mb-4 opacity-50" />
        <p>No messages in the queue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
          <input type="checkbox" checked={selectedIds.size === jobs.length && jobs.length > 0} onChange={toggleSelectAll} className="accent-blue-500" />
          <CheckSquare className="w-4 h-4" />
          Select All
        </label>
        {selectedIds.size > 0 && (
          <button 
            onClick={deleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 rounded text-sm transition-all duration-150 active:scale-95"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedIds.size})
          </button>
        )}
      </div>
      {jobs.map((job: any) => (
        <div key={job.id} className="p-4 bg-gray-900/50 rounded-xl border border-gray-800/50 transition-all hover:border-gray-700/50">
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={selectedIds.has(job.id)} onChange={() => toggleSelect(job.id)} className="mt-1 accent-blue-500" />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-3">
                <div>
              <div className="font-medium text-gray-100 flex items-center gap-2">
                {job.person} 
                <span className="px-1.5 py-0.5 bg-gray-800/50 rounded text-xs text-gray-500 uppercase tracking-wider">{job.network}</span>
              </div>
              <div className="text-sm text-blue-400 mt-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {job.time ? <CountdownTimer time={job.time} /> : job.schedule}
                <span className="text-gray-500 text-xs ml-1">({new Date(job.time).toLocaleString()})</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => onEdit(job)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-all duration-150 active:scale-95"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
              <button 
                onClick={() => sendMutation.mutate(job)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-all duration-150 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" /> Send Now
              </button>
              <button 
                onClick={() => deleteMutation.mutate(job.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700/50 rounded text-sm transition-all duration-150 active:scale-95"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-300 bg-gray-800/30 p-3 rounded-lg border border-gray-800/50 whitespace-pre-wrap">
            {job.text}
          </div>
          </div>
          </div>
        </div>
      ))}
    </div>
  );
}
