import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeSimulatorApp } from '../ThemeSimulatorApp.js';

const el = document.getElementById('react-theme-simulator-root');
if (el) {
  createRoot(el).render(<ThemeSimulatorApp />);
}
