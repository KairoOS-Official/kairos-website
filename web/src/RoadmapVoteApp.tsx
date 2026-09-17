import React, { useState, useEffect } from 'react';

export interface RoadmapFeature {
  id: number;
  category: string;
  titleFr: string;
  titleEn: string;
  descFr: string;
  descEn: string;
  tag: string;
  votesCount: number;
  sortOrder: number;
  has_voted: boolean;
  suggestions?: any[];
}

export const RoadmapVoteApp: React.FC = () => {
  const [features, setFeatures] = useState<RoadmapFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<number | null>(null);

  const loadFeatures = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/roadmap/features');
      if (res.ok) {
        const data = await res.json();
        setFeatures(data.features || []);
      }
    } catch {
      setFeedback('Erreur lors du chargement de la roadmap.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeatures();
  }, []);

  const handleVote = async (featureId: number) => {
    try {
      setVotingId(featureId);
      const res = await fetch('/api/roadmap/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_id: featureId })
      });
      const data = await res.json();
      setFeedback(data.message || 'Vote enregistré');
      loadFeatures();
    } catch {
      setFeedback('Impossible de voter.');
    } finally {
      setVotingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono text-sm animate-pulse">
        Chargement des fonctionnalités et votes réels...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-sm font-medium flex items-center justify-between shadow-sm">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-xs font-mono underline hover:opacity-80">
            Fermer
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {features.map((feat) => (
          <div
            key={feat.id}
            className="p-6 rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 backdrop-blur-md shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono font-bold">
                  {feat.category || 'GÉNÉRAL'}
                </span>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                  {feat.votesCount} {feat.votesCount > 1 ? 'votes' : 'vote'}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {feat.titleFr}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                {feat.descFr}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80">
              <span className="text-[11px] font-mono text-slate-400">
                {feat.tag || 'En cours de validation'}
              </span>

              <button
                disabled={feat.has_voted || votingId === feat.id}
                onClick={() => handleVote(feat.id)}
                className={'px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ' + (feat.has_voted ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow')}
              >
                <span>{feat.has_voted ? '✓ Voté' : votingId === feat.id ? 'Vote...' : '▲ Voter'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
