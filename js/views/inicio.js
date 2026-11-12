// Tela central: saldo da SAM, pendências, contas a pagar e movimentações.
(function (SAM) {
  const { html, brl, store, ui } = SAM;
  const CATEGORIES = SAM.ENTRY_TYPES;
  let showAll = false;
  let showAllUnreadable = false;

  function alerts() {
    const list = [];
    const today = SAM.today();

    if (SAM.ms.needsLogin) {
      list.push({
        tone: 'bad',
        text: 'Sessão Microsoft expirada',
        action: html`<button type="button" class="btn btn-small btn-primary" data-act="sign-in">Reconectar</button>`,
      });
    }
    const month = SAM.monthOf(today);

    // Tarefa com vários itens sem valor (ex.: lista de lembretes): um aviso só,
    // com a opção de ignorar a tarefa inteira, inclusive itens futuros.
    const byTask = new Map();
    store.unreadableTasks().forEach((t) => {
      const key = t.group ? t.taskId : t.id;
      byTask.set(key, [...(byTask.get(key) || []), t]);
    });
    const unreadable = [];
    byTask.forEach((items, taskId) => {
      if (items.length < 3) { unreadable.push(...items); return; }
      list.push({
        tone: 'bad',
        text: `${items.length} itens sem valor em "${items[0].group}"`,
        action: html`<button type="button" class="btn btn-small" data-act="ignore-whole-task" data-id="${taskId}" data-name="${items[0].group}">Ignorar tarefa</button>`,
      });
    });
    (showAllUnreadable ? unreadable : unreadable.slice(0, 5)).forEach((t) => list.push({
      tone: 'bad',
      text: `Sem valor: "${t.title}"${t.group ? ` (${t.group})` : ''}`,
      action: html`<button type="button" class="btn btn-small" data-act="ignore-task" data-id="${t.id}">Ignorar</button>`,
    }));
    if (unreadable.length > 5) {
      list.push({
        tone: 'bad',
        text: showAllUnreadable ? 'Todos os itens sem valor' : `+${unreadable.length - 5} itens sem valor`,
        action: html`<button type="button" class="btn btn-small" data-act="toggle-unreadable">${showAllUnreadable ? 'Mostrar menos' : 'Ver todos'}</button>`,
      });
    }

    store.state.fixed.filter((f) => f.startMonth <= month && !(f.checks || {})[month]).forEach((f) => {
      const due = SAM.dueDate(month, f.dueDay);
      const days = SAM.daysBetween(today, due);
      if (days < 0) list.push({ tone: 'bad', text: `${f.name}: venceu ${SAM.fmtDay(due)}`, tab: 'fixos' });
      else if (days <= 3) list.push({ tone: 'warn', text: `${f.name}: vence ${days === 0 ? 'hoje' : SAM.fmtDay(due)}`, tab: 'fixos' });
    });

    store.state.projects.filter((p) => !p.archived && p.deadline).forEach((p) => {
      const { paid } = store.projectTotals(p);
      if (p.costCents && paid >= p.costCents) return;
      const days = SAM.daysBetween(today, p.deadline);
      if (days < 0) list.push({ tone: 'bad', text: `${p.name}: prazo vencido ${SAM.fmtDay(p.deadline)}`, tab: 'projetos' });
      else if (days <= 14) list.push({ tone: 'warn', text: `${p.name}: prazo ${SAM.fmtDay(p.deadline)}`, tab: 'projetos' });
    });

    const budget = store.budgetFor(month);
    if (budget) {
      (budget.sectors || []).forEach((s) => {
        const over = store.sectorSpent(s) - s.plannedCents;
        if (over > 0) list.push({ tone: 'bad', text: `${s.name}: ${brl(over)} acima do orçamento`, tab: 'orcamento' });
      });
    }
    return list;
  }

  function setupCard() {
    const { settings } = store.state;
    const steps = [
      {
        done: Boolean(settings.initialDate),
        text: 'Saldo inicial',
        action: html`<button type="button" class="btn btn-small" data-act="edit-initial">Informar</button>`,
      },
      {
        done: SAM.ms.connected(),
        text: 'Conta Microsoft',
        action: html`<button type="button" class="btn btn-small" data-act="go" data-tab="config">Conectar</button>`,
      },
      {
        done: Boolean(settings.todoListId),
        text: 'Lista do To Do',
        action: SAM.ms.connected() ? html`<button type="button" class="btn btn-small" data-act="pick-list">Escolher</button>` : '',
      },
    ];
    if (steps.every((s) => s.done)) return '';
    return html`<section class="card">
      <h2>Primeiros passos</h2>
      <ol class="steps">
        ${steps.map((s, i) => html`<li>
          <span class="step-mark ${s.done ? 'done' : ''}">${s.done ? '✓' : i + 1}</span>
          <span class="step-text">${s.text}</span>
          ${s.done ? '' : s.action}
        </li>`)}
      </ol>
      ${SAM.ms.configured() ? '' : html`<p class="hint" style="margin-top:12px"><a href="?demo=1">Ver demonstração</a></p>`}
    </section>`;
  }

  function movements() {
    const projectName = (id) => { const p = store.find('projects', id); return p ? p.name : null; };
    const rows = [
      ...store.activeEntries().map((e) => ({ kind: 'in', date: e.date, title: e.desc, sub: SAM.entryType(e) === 'Outras' ? e.category : SAM.entryType(e), cents: e.cents, entry: e, project: projectName(e.projectId) })),
      ...store.receivedIncomes().map((t) => ({ kind: 'in', date: t.completedAt, title: t.title, sub: `To Do · ${t.group || t.list}`, cents: t.cents })),
      ...store.paidTasks().map((t) => ({ kind: 'out', date: t.completedAt, title: t.title, sub: t.group ? `To Do · ${t.group}` : 'Pago pelo To Do', cents: t.cents })),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const visible = showAll ? rows : rows.slice(0, 10);

    return html`<section class="card">
      <h2>Movimentações</h2>
      ${rows.length === 0 ? html`<p class="empty">Nenhuma movimentação ainda.</p>` : html`
        <ul class="rows">
          ${visible.map((r) => html`<li>
            <div class="row-main">
              <div>${r.title}</div>
              <div class="row-sub">${SAM.fmtDate(r.date)} · ${r.sub}</div>
            </div>
            <span class="amount ${r.kind}">${r.kind === 'in' ? '+' : '−'} ${brl(r.cents)}</span>
            ${r.entry && !r.entry.projectId ? html`<button type="button" class="btn btn-small" data-act="edit-entry" data-id="${r.entry.id}">Editar</button>` : ''}
          </li>`)}
        </ul>
        ${rows.length > 10 ? html`<button type="button" class="btn-link" data-act="toggle-all">${showAll ? 'Ver menos' : `Ver todas (${rows.length})`}</button>` : ''}
      `}
    </section>`;
  }

  SAM.views.inicio = () => {
    const s = store.summary();
    const open = store.openTasks();
    const toReceive = store.pendingIncomes();
    const items = alerts();
    const pendingList = (title, list) => html`<section class="card">
      <h2>${title}</h2>
      <ul class="rows">
        ${list.map((t) => html`<li>
          <div class="row-main">
            <div>${t.title}</div>
            ${t.dueAt ? html`<div class="row-sub">${SAM.fmtDate(t.dueAt)}</div>` : ''}
          </div>
          <span class="amount">${brl(t.cents)}</span>
        </li>`)}
      </ul>
    </section>`;

    return html`
      <section class="hero" aria-label="Saldo">
        <div class="hero-label">Saldo</div>
        <div class="hero-value ${s.balance < 0 ? 'is-negative' : ''}">${brl(s.balance)}</div>
        <dl class="hero-metrics">
          <div><dt>Livre</dt><dd>${brl(s.free)}</dd></div>
          <div><dt>Projetos</dt><dd>${brl(s.reserved)}</dd></div>
          <div><dt>A pagar</dt><dd>${brl(s.pending)}</dd></div>
          <div><dt>A receber</dt><dd>${brl(s.receivable)}</dd></div>
          <div><dt>Após pagar</dt><dd>${brl(s.afterPending)}</dd></div>
        </dl>
        <div class="hero-actions">
          <button type="button" class="btn btn-primary" data-act="new-entry">+ Entrada</button>
        </div>
      </section>

      ${setupCard()}

      ${items.length ? html`<section class="card">
        <h2>Atenção</h2>
        <ul class="alerts">
          ${items.map((a) => html`<li class="alert ${a.tone}">
            <span>${a.text}</span>
            ${a.action || ''}
            ${a.tab ? html`<button type="button" class="btn btn-small" data-act="go" data-tab="${a.tab}">Ver</button>` : ''}
          </li>`)}
        </ul>
      </section>` : ''}

      ${open.length ? pendingList('A pagar', open) : ''}
      ${toReceive.length ? pendingList('A receber', toReceive) : ''}

      ${movements()}
    `;
  };

  async function entryForm(entry) {
    const startDate = store.state.settings.initialDate;
    const values = await ui.form({
      title: entry ? 'Editar entrada' : 'Registrar entrada',
      fields: [
        { name: 'desc', label: 'Descrição', required: true, value: entry && entry.desc },
        { name: 'cents', label: 'Valor (R$)', type: 'money', required: true, positive: true, value: entry ? entry.cents : null },
        { name: 'date', label: 'Data', type: 'date', required: true, value: entry ? entry.date : SAM.today() },
        { name: 'category', label: 'Categoria', type: 'select', value: entry ? SAM.entryType(entry) : 'Faturamento de vendas', options: CATEGORIES.map((c) => ({ value: c, label: c })) },
      ],
      validate: (v) => (startDate && v.date < startDate
        ? `Essa data é anterior ao saldo inicial (${SAM.fmtDate(startDate)}), que já inclui esse valor.`
        : ''),
      extra: entry && {
        label: 'Excluir',
        onClick: async () => {
          const yes = await ui.confirm({ title: 'Excluir entrada?', message: `"${entry.desc}" (${brl(entry.cents)}) sairá do saldo.`, confirmLabel: 'Excluir', danger: true });
          if (yes) { store.remove('entries', entry.id); store.commit(); }
        },
      },
    });
    if (!values) return;
    store.upsert('entries', { ...(entry || {}), ...values });
    store.commit();
    ui.toast('Saldo atualizado.');
  }

  SAM.actions['new-entry'] = () => entryForm(null);
  SAM.actions['edit-entry'] = (d) => entryForm(store.find('entries', d.id));
  SAM.actions['toggle-all'] = () => { showAll = !showAll; ui.render(); };
  SAM.actions['toggle-unreadable'] = () => { showAllUnreadable = !showAllUnreadable; ui.render(); };
  SAM.actions['ignore-whole-task'] = async (d) => {
    const yes = await ui.confirm({
      title: 'Ignorar a tarefa inteira?',
      message: `Nada da tarefa "${d.name}" entrará no saldo, nem itens adicionados depois. A tarefa no To Do não é alterada.`,
      confirmLabel: 'Ignorar tarefa',
    });
    if (!yes) return;
    store.state.ignoredTasks[`task:${d.id}`] = Date.now();
    store.commit();
  };
  SAM.actions['ignore-task'] = (d) => {
    store.state.ignoredTasks[d.id] = Date.now();
    store.commit();
  };
})(window.SAM);
