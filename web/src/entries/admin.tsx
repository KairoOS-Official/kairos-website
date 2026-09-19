import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminDashboardApp } from '../AdminDashboardApp.js';

const el = document.getElementById('react-admin-dashboard-root');
if (el) {
  createRoot(el).render(<AdminDashboardApp />);
}
