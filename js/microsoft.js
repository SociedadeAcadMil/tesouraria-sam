// Login Microsoft (MSAL) e chamadas ao Microsoft Graph: leitura do To Do e arquivo no OneDrive.
(function (SAM) {
  const MSAL_URL = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.28.1/lib/msal-browser.min.js';
  const MSAL_INTEGRITY = 'sha384-B5PXeUfgiegchZiX5iMRssMrHd9NfPhFnITob1HyW1CY76udptWpBsniaDsH/+BY';
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  // Precisa ser igual ao endereço registrado na Microsoft, mesmo abrindo por /index.html.
  const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');
  const SCOPES = ['User.Read', 'Tasks.Read', 'Files.ReadWrite.AppFolder'];

  let client = null;
  let loading = null;

  function loadMsal() {
    if (window.msal) return Promise.resolve();
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = MSAL_URL;
        s.integrity = MSAL_INTEGRITY;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => { loading = null; reject(new Error('Não foi possível carregar o login da Microsoft.')); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  async function getClient() {
    if (client) return client;
    await loadMsal();
    client = new window.msal.PublicClientApplication({
      auth: {
        clientId: window.SAM_CONFIG.microsoftClientId,
        authority: 'https://login.microsoftonline.com/consumers',
        redirectUri: APP_URL,
        navigateToLoginRequestUrl: false,
      },
      // No localStorage o login sobrevive ao fechamento do app instalado no celular.
      cache: { cacheLocation: 'localStorage' },
    });
    await client.initialize();
    return client;
  }

  const ms = {
    account: null,
    needsLogin: false,

    configured() { return Boolean(window.SAM_CONFIG && window.SAM_CONFIG.microsoftClientId); },
    connected() { return Boolean(this.account); },

    // Conclui um retorno de login e recupera a sessão existente, sem abrir telas.
    async init() {
      if (!this.configured()) return;
      const returningFromLogin = /[#&](code|error)=/.test(location.hash);
      const known = SAM.store.readMeta('msConnected', false);
      if (!returningFromLogin && !known) return;
      const app = await getClient();
      const result = await app.handleRedirectPromise();
      this.account = (result && result.account) || app.getAllAccounts()[0] || null;
      if (this.account) app.setActiveAccount(this.account);
      SAM.store.writeMeta('msConnected', Boolean(this.account));
    },

    async signIn() {
      const app = await getClient();
      await app.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
    },

    async signOut() {
      const app = await getClient();
      SAM.store.writeMeta('msConnected', false);
      await app.logoutRedirect({ account: this.account, postLogoutRedirectUri: APP_URL });
    },

    // Falhas na renovação silenciosa que só se resolvem entrando de novo. No celular
    // (sobretudo iPhone) a renovação em segundo plano costuma ser bloqueada e termina
    // em "monitor_window_timeout" depois de ~24 h do último login.
    needsInteraction(e) {
      const code = String((e && (e.errorCode || e.message)) || '');
      return (window.msal && e instanceof window.msal.InteractionRequiredAuthError)
        || /interaction_required|login_required|consent_required|interaction|monitor_window_timeout|timed_out|token_renewal_error|no_tokens_found|refresh_token_expired|invalid_grant/i.test(code);
    },

    async token() {
      if (!this.account) throw new Error('Conta Microsoft não conectada.');
      const app = await getClient();
      try {
        const r = await app.acquireTokenSilent({ scopes: SCOPES, account: this.account });
        this.needsLogin = false;
        return r.accessToken;
      } catch (e) {
        // Não redireciona sozinho: os dados continuam visíveis e a tela pede para reconectar.
        if (ms.needsInteraction(e)) {
          this.needsLogin = true;
          const err = new Error('Sessão Microsoft expirada.');
          err.needsLogin = true;
          throw err;
        }
        throw e;
      }
    },

    // Faz a chamada e devolve a Response; quem chama decide como tratar 404 e 412.
    async request(pathOrUrl, options = {}) {
      const url = pathOrUrl.startsWith('https://') ? pathOrUrl : GRAPH + pathOrUrl;
      const headers = { ...(options.headers || {}), Authorization: `Bearer ${await this.token()}` };
      return fetch(url, { ...options, headers });
    },

    async json(pathOrUrl) {
      const res = await this.request(pathOrUrl);
      if (!res.ok) {
        const err = new Error(`Microsoft respondeu com erro ${res.status}.`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },

    async allPages(path) {
      const items = [];
      let next = path;
      while (next) {
        const page = await this.json(next);
        items.push(...(page.value || []));
        next = page['@odata.nextLink'] || null;
      }
      return items;
    },

    lists() { return this.allPages('/me/todo/lists'); },

    // Itens da lista: kind 'out' (pagamento) ou 'in' (etapas das tarefas "Entradas ...").
    async tasks(listId) {
      const raw = await this.allPages(`/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100&$expand=checklistItems`);
      return raw.flatMap(ms.toPayments);
    },

    // Data local (horário do aparelho) de um instante do To Do, como "2026-11-12T23:30:00Z".
    // Sem conversão, uma marcação feita às 22h em Brasília cairia no dia seguinte.
    localDay(iso) {
      if (!iso) return null;
      const s = String(iso);
      const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
      if (Number.isNaN(d.getTime())) return s.slice(0, 10);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },

    // Data no título da tarefa ("08/11", "DIA 24/06", "29/06 (STONE)", "08/11/2026").
    // Sem ano, usa o ano em que a tarefa foi criada, corrigindo a virada de ano
    // (tarefa "28/12" criada em janeiro).
    titleDate(title, createdIso) {
      const m = String(title || '').match(/(?:^|\D)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/);
      if (!m) return null;
      const day = Number(m[1]);
      const month = Number(m[2]);
      if (day < 1 || day > 31 || month < 1 || month > 12) return null;
      let year;
      if (m[3]) {
        year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
      } else {
        const created = createdIso ? new Date(createdIso) : new Date();
        year = created.getFullYear();
        const monthsAhead = (month - 1) - created.getMonth();
        if (monthsAhead > 6) year -= 1;
        if (monthsAhead < -6) year += 1;
      }
      const pad = (n) => String(n).padStart(2, '0');
      return `${year}-${pad(month)}-${pad(day)}`;
    },

    // Cada etapa de uma tarefa é um pagamento ("2.333,23 - Salário Ruth"), pago
    // quando a etapa é marcada ou a tarefa inteira é concluída. A data do pagamento
    // é a do título da tarefa; sem data no título, a da marcação no To Do.
    // Tarefa sem etapas vale como um pagamento só, com o valor no título.
    // Tarefas com título "Entradas ..." (ex.: "Entradas NOVEMBRO") guardam entradas:
    // cada etapa marcada soma no saldo, na data em que foi marcada.
    toPayments(t) {
      // A tarefa "pendente" guarda lembretes, não pagamentos: nunca entra no saldo.
      if (/pendente/i.test(t.title || '')) return [];
      const kind = /^\s*entradas\b/i.test(t.title || '') ? 'in' : 'out';
      const taskDone = t.status === 'completed';
      const day = (v) => (v ? String(v).slice(0, 10) : null);
      const taskCompleted = day(t.completedDateTime && t.completedDateTime.dateTime)
        || day(t.lastModifiedDateTime);
      const fromTitle = ms.titleDate(t.title, t.createdDateTime);
      const dueAt = day(t.dueDateTime && t.dueDateTime.dateTime) || fromTitle;
      const items = t.checklistItems || [];

      if (!items.length) {
        // Dia ou mês de entradas ainda sem etapas ("10/11", "Entradas DEZEMBRO"): nada a lançar.
        if (kind === 'in') return [];
        if (fromTitle && SAM.parseTitleValue(t.title) === null) return [];
        return [{
          id: t.id,
          taskId: t.id,
          kind,
          title: t.title || '(sem título)',
          group: null,
          done: taskDone,
          completedAt: taskDone ? (fromTitle || taskCompleted) : null,
          dueAt,
          cents: SAM.parseTitleValue(t.title),
        }];
      }
      return items.map((c) => {
        const done = Boolean(c.isChecked) || taskDone;
        return {
          id: `${t.id}:${c.id}`,
          taskId: t.id,
          kind,
          title: c.displayName || '(sem descrição)',
          group: t.title || null,
          done,
          completedAt: done ? (fromTitle || ms.localDay(c.checkedDateTime) || taskCompleted) : null,
          dueAt,
          cents: SAM.parseTitleValue(c.displayName, { strict: true }),
        };
      });
    },
  };

  SAM.ms = ms;
})(window.SAM);
