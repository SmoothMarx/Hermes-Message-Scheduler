import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Clock, List, History, Settings } from 'lucide-react';
import { ComposeTab } from './components/ComposeTab';
import { QueueTab } from './components/QueueTab';
import { HistoryTab } from './components/HistoryTab';
import { SettingsTab } from './components/SettingsTab';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-900/20 text-red-400 rounded border border-red-800 m-4">
          <h2 className="text-lg font-bold mb-2">Plugin Crash</h2>
          <pre className="text-sm whitespace-pre-wrap">{String(this.state.error?.stack || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<'compose'|'queue'|'history'|'settings'>('compose');
  const [editJob, setEditJob] = useState<any>(null);

  const handleEdit = (job: any) => {
    setEditJob(job);
    setActiveTab('compose');
  };

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <div className="p-6 max-w-4xl mx-auto text-[var(--text-primary)]">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Clock className="w-6 h-6" />
            Scheduled Messages
          </h2>
          
          <div className="flex space-x-1 mb-6 border-b border-[var(--background-base)]/20 pb-0">
            {[
              { id: 'compose', label: 'Compose', icon: Clock },
              { id: 'queue', label: 'Queue', icon: List },
              { id: 'history', label: 'History', icon: History },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 capitalize font-medium rounded-t-md transition-all duration-150 active:scale-95 active:brightness-90 transform ${
                  activeTab === tab.id 
                    ? 'bg-gray-800 text-white border-b-2 border-blue-500' 
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-gray-900 rounded-b-md p-6 border border-gray-800 shadow-xl">
            {activeTab === 'compose' && <ComposeTab editJob={editJob} onClearEdit={() => setEditJob(null)} onScheduled={() => setActiveTab('queue')} />}
            {activeTab === 'queue' && <QueueTab onEdit={handleEdit} />}
            {activeTab === 'history' && <HistoryTab onRetry={handleEdit} />}
            {activeTab === 'settings' && <SettingsTab />}
          </div>
        </div>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
