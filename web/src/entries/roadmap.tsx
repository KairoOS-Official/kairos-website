import React from 'react';
import { createRoot } from 'react-dom/client';
import { RoadmapVoteApp } from '../RoadmapVoteApp.js';

const el = document.getElementById('react-roadmap-root');
if (el) {
  createRoot(el).render(<RoadmapVoteApp />);
}
