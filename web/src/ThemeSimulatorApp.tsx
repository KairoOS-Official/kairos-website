import React, { useState } from 'react';

export interface ThemeItem {
  id: string;
  name: string;
  category: string;
  previewClass: string;
  primaryColor: string;
  accentColor: string;
  bgGrad: string;
}

const THEMES: ThemeItem[] = [
  {
    id: 'arcade-retro',
    name: 'Néo-Arcade CRT',
    category: 'Rétro',
    previewClass: 'from-amber-500/20 to-rose-500/20',
    primaryColor: '#F59E0B',
    accentColor: '#F43F5E',
    bgGrad: 'radial-gradient(ellipse at top, #78350f 0%, #090d16 100%)'
  },
  {
    id: 'cyber-dark',
    name: 'Cyberpunk 2099',
    category: 'Futuriste',
    previewClass: 'from-cyan-500/20 to-purple-500/20',
    primaryColor: '#06B6D4',
    accentColor: '#A855F7',
    bgGrad: 'radial-gradient(ellipse at top, #164e63 0%, #090d16 100%)'
  },
  {
    id: 'minimal-clean',
    name: 'Nordic Minimal',
    category: 'Moderne',
    previewClass: 'from-slate-500/20 to-indigo-500/20',
    primaryColor: '#6366F1',
    accentColor: '#38BDF8',
    bgGrad: 'radial-gradient(ellipse at top, #1e1b4b 0%, #090d16 100%)'
  },
  {
    id: 'emerald-forest',
    name: 'Pixel Forest',
    category: 'Nature',
    previewClass: 'from-emerald-500/20 to-teal-500/20',
    primaryColor: '#10B981',
    accentColor: '#14B8A6',
    bgGrad: 'radial-gradient(ellipse at top, #064e3b 0%, #090d16 100%)'
  }
];

export const ThemeSimulatorApp: React.FC = () => {
  const [selectedTheme, setSelectedTheme] = useState<ThemeItem>(THEMES[0]!);
  const [crtEffect, setCrtEffect] = useState(true);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {THEMES.map((th) => (
          <button
            key={th.id}
            onClick={() => setSelectedTheme(th)}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              selectedTheme.id === th.id
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-sm ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-mono font-bold text-slate-400">{th.category}</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{th.name}</div>
          </button>
        ))}
      </div>

      <div
        className="p-8 rounded-3xl border border-slate-700 relative overflow-hidden shadow-2xl transition-all"
        style={{ background: selectedTheme.bgGrad, minHeight: '320px' }}
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-rose-500" />
            <div className="w-3.5 h-3.5 rounded-full bg-amber-500" />
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-mono text-slate-300 font-bold ml-2">
              KaïroOS Simulator — {selectedTheme.name}
            </span>
          </div>
          <button
            onClick={() => setCrtEffect(!crtEffect)}
            className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-200 text-xs font-mono font-bold hover:bg-slate-800 cursor-pointer"
          >
            Filtre CRT : {crtEffect ? 'Activé' : 'Désactivé'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {['Super Mario World', 'Street Fighter II', 'Sonic the Hedgehog'].map((title, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 backdrop-blur-sm flex flex-col justify-between space-y-3"
            >
              <div className="h-24 rounded-xl bg-slate-900/80 flex items-center justify-center font-mono text-xs text-slate-400 font-bold">
                [Aperçu Jeu #{i + 1}]
              </div>
              <div className="text-xs font-bold text-white">{title}</div>
              <button
                className="w-full py-1.5 rounded-lg text-xs font-bold font-mono transition-all text-slate-950"
                style={{ backgroundColor: selectedTheme.primaryColor }}
              >
                Lancer
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

