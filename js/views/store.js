// Estado da tesouraria: guardado no aparelho e sincronizado pelo OneDrive (sync.js).
// Regra central: o saldo só muda por entradas e por tarefas concluídas no To Do.
// Checklist de gastos fixos, pagamentos de projeto e orçamento são controles que
// não alteram o saldo; assim um mesmo pagamento nunca é descontado duas vezes.
(function (SAM) {
  const COLLECTIONS = ['entries', 'fixed', 'projects', 'budgets'];
  const isDemo = new URLSearchParams(location.search).has('demo');
  const KEY = isDemo ? 'sam-demo' : 'sam-tesouraria';

  const empty = () => ({
    version: 1,
    settings: { updatedAt: 0, initialCents: 0, initialDate: null, todoListId: null, todoListName: null },
    entries: [], fixed: [], projects: [], budgets: [],
    ignoredTasks: {}, deleted: {},
    // Categoria do balancete de cada pagamento do To Do: { [id]: { cat, at } }.
    taskCategories: {},
  });

  function normalize(raw) {
    const base = empty();
    if (!raw || typeof raw !== 'object') return base;
    base.settings = { ...base.settings, ...(raw.settings || {}) };
    COLLECTIONS.forEach((c) => { if (Array.isArray(raw[c])) base[c] = raw[c]; });
    base.ignoredTasks = raw.ignoredTasks || {};
    base.deleted = raw.deleted || {};
    base.taskCategories = raw.taskCategories || {};
    return base;
  }

  const read = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  };

  const store = {
    isDemo,
    KEY,
    state: normalize(read(KEY, null)),
    todo: read(`${KEY}:todo`, { tasks: [], fetchedAt: null }),
    listeners: [],
    revision: 0,

    onChange(fn) { this.listeners.push(fn); },
    notify() { this.listeners.forEach((fn) => fn()); },

    // Apaga os dados deste aparelho (usado ao sair da conta; o OneDrive não é alterado).
    clearLocal() {
      this.state = empty();
      this.todo = { tasks: [], fetchedAt: null };
      write(KEY, this.state);
      write(`${KEY}:todo`, this.todo);
    },

    // Grava uma alteração feita pela usuária e agenda o envio ao OneDrive.
    commit() {
      this.revision += 1;
      if (!write(KEY, this.state)) SAM.ui && SAM.ui.toast('Não foi possível salvar neste aparelho.');
      this.notify();
      if (SAM.sync) SAM.sync.schedule();
    },

    upsert(collection, record) {
      const item = { ...record, id: record.id || SAM.uid(), updatedAt: Date.now() };
      const list = this.state[collection];
      const i = list.findIndex((r) => r.id === item.id);
      if (i >= 0) list[i] = item; else list.push(item);
      return item;
    },
    remove(collection, id) {
      this.state[collection] = this.state[collection].filter((r) => r.id !== id);
      this.state.deleted[id] = Date.now();
    },
    find(collection, id) { return this.state[collection].find((r) => r.id === id); },
    updateSettings(patch) {
      this.state.settings = { ...this.state.settings, ...patch, updatedAt: Date.now() };
    },

    // Troca o estado sem marcar alteração local (dados vindos da sincronização).
    replace(next) {
      this.state = normalize(next);
      write(KEY, this.state);
      this.notify();
    },
    setTodo(tasks) {
      this.todo = { tasks, fetchedAt: Date.now() };
      write(`${KEY}:todo`, this.todo);
      this.notify();
    },
    readMeta(name, fallback) { return read(`${KEY}:${name}`, fallback); },
    writeMeta(name, value) { write(`${KEY}:${name}`, value); },

    // Combina dois estados registro a registro: vale a edição mais recente, e
    // uma exclusão só vence se for posterior à última edição do registro.
    merge(a, b) {
      const x = normalize(a);
      const y = normalize(b);
      const out = empty();
      out.deleted = { ...x.deleted };
      Object.entries(y.deleted).forEach(([id, ts]) => {
        out.deleted[id] = Math.max(out.deleted[id] || 0, ts);
      });
      out.ignoredTasks = { ...x.ignoredTasks, ...y.ignoredTasks };
      out.taskCategories = { ...x.taskCategories };
      Object.entries(y.taskCategories).forEach(([id, c]) => {
        const cur = out.taskCategories[id];
        if (!cur || (c.at || 0) > (cur.at || 0)) out.taskCategories[id] = c;
      });
      out.settings = (y.settings.updatedAt || 0) > (x.settings.updatedAt || 0) ? y.settings : x.settings;
      COLLECTIONS.forEach((c) => {
        const byId = new Map();
        [...x[c], ...y[c]].forEach((r) => {
          const cur = byId.get(r.id);
          if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(r.id, r);
        });
        out[c] = [...byId.values()].filter((r) => !(out.deleted[r.id] >= (r.updatedAt || 0)));
      });
      return out;
    },

    // ---------- Cálculos ----------
    // Tarefa do To Do transformada em pagamento, respeitando a data do saldo
    // inicial: o que foi concluído antes dela já está embutido no saldo inicial.
    tasks() {
      const { ignoredTasks, settings } = this.state;
      const start = settings.initialDate;
      return this.todo.tasks.filter((t) => !ignoredTasks[t.id] && !(t.taskId && ignoredTasks[`task:${t.taskId}`])
        && !(t.done && start && t.completedAt && t.completedAt < start));
    },
    // Entradas anteriores à data do saldo inicial já estão embutidas nele.
    activeEntries() {
      const start = this.state.settings.initialDate;
      return this.state.entries.filter((e) => !start || e.date >= start);
    },
    paidTasks() { return this.tasks().filter((t) => t.done && t.cents !== null); },
    openTasks() { return this.tasks().filter((t) => !t.done && t.cents !== null); },
    unreadableTasks() { return this.tasks().filter((t) => t.cents === null); },

    projectTotals(p) {
      const collected = SAM.sum(p.receipts || [], (r) => r.cents);
      const paid = SAM.sum(p.payments || [], (r) => r.cents);
      return { collected, paid, reserved: Math.max(0, collected - paid) };
    },

    summary() {
      const { settings, projects } = this.state;
      const incoming = SAM.sum(this.activeEntries(), (e) => e.cents);
      const outgoing = SAM.sum(this.paidTasks(), (t) => t.cents);
      const pending = SAM.sum(this.openTasks(), (t) => t.cents);
      const balance = (settings.initialCents || 0) + incoming - outgoing;
      const reserved = SAM.sum(projects.filter((p) => !p.archived), (p) => this.projectTotals(p).reserved);
      return {
        balance, incoming, outgoing, pending, reserved,
        free: balance - reserved,
        afterPending: balance - pending,
      };
    },

    // ---------- Balancete ----------
    categoryOf(id) {
      const c = this.state.taskCategories[id];
      return (c && c.cat) || null;
    },
    setCategory(id, cat) {
      this.state.taskCategories[id] = { cat: cat || null, at: Date.now() };
    },
    // Sugestão pela descrição já classificada antes ("cookie - 2412,00" e
    // "cookie - 1572,00" viram "cookie"); vale a classificação mais recente.
    suggestions() {
      const byName = new Map();
      this.todo.tasks.forEach((t) => {
        const c = this.state.taskCategories[t.id];
        if (!c || !c.cat) return;
        const key = SAM.itemKey(t.title);
        const cur = byName.get(key);
        if (key && (!cur || c.at > cur.at)) byName.set(key, c);
      });
      return byName;
    },

    budgetFor(month) { return this.find('budgets', `budget-${month}`); },
    sectorSpent(sector) { return SAM.sum(sector.expenses || [], (e) => e.cents); },
    allocatedTaskIds() {
      const ids = new Set();
      this.state.budgets.forEach((b) => (b.sectors || []).forEach((s) => (s.expenses || []).forEach((e) => {
        if (e.taskId) ids.add(e.taskId);
      })));
      return ids;
    },
  };

  SAM.store = store;
})(window.SAM);
