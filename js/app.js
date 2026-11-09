// Inicialização do aplicativo.
(function (SAM) {
  // O login silencioso da Microsoft abre esta página em um iframe oculto: nele o app não sobe.
  if (window.self !== window.top) return;

  const { store, ui, sync, ms } = SAM;

  async function boot() {
    document.getElementById('demo-banner').hidden = !store.isDemo;
    history.replaceState({ tab: ui.tab }, '');
    window.addEventListener('popstate', (e) => ui.go((e.state && e.state.tab) || 'inicio', { push: false }));
    ui.render();

    try {
      await ms.init();
    } catch (e) {
      sync.setStatus({ error: navigator.onLine ? 'Falha no login da Microsoft.' : 'Sem internet: mostrando os últimos dados salvos.' });
    }
    ui.render();
    sync.run();

    let lastFocusRun = Date.now();
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastFocusRun < 60000) return;
      lastFocusRun = Date.now();
      sync.run();
    };
    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('focus', refreshIfStale);
    window.addEventListener('online', () => sync.run());

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  boot();
})(window.SAM);
