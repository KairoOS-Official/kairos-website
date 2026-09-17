export interface SiteCatalog {
  status: string;
  lang: string;
  content: Record<string, string>;
  games: any[];
  faq: any[];
  plugins: any[];
  themes: any[];
  milestones: any[];
}

export async function fetchSiteContent(lang = 'fr'): Promise<SiteCatalog> {
  const res = await fetch('/api/content?lang=' + encodeURIComponent(lang));
  if (!res.ok) throw new Error('Erreur chargement contenu');
  return await res.json();
}
