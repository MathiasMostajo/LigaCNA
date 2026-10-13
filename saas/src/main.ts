import './style.css';
if (location.pathname.startsWith('/admin/submissions') || (import.meta.env.DEV && location.pathname==='/preview')) {
  void import('./inbox');
} else { void import('./portal'); }

