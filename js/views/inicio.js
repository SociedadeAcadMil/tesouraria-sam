// Tela central: saldo da SAM, pendências, contas a pagar e movimentações.
(function (SAM) {
  const { html, brl, store, ui } = SAM;
  const CATEGORIES = ['Mensalidade', 'Recolhimento de projeto', 'Evento', 'Doação', 'Outros'];
  let showAll = false;

  function alerts() {
    const list = [];
    const today = SAM.today();
    const month = SAM.monthOf(today);

    store.unreadableTasks().forEach((t) => list.push({
      tone: 'bad',
      text: `Sem valor no título, fora do saldo: "${t.title}". Corrija no To Do, por exemplo "… - R$ 150,00".`,
      action: html`<button type="button" class="btn btn-small" data-act="ignore-task" data-id="${t.id}">Não é pagamento</button>`,
    }));

    store.state.fixed.filter((f) => f.startMonth <= month && !(f.checks || {})[month]).forEach((f) => {
      const due = SAM.dueDate(month, f.dueDay);
      const days = SAM.daysBetween(today, due);
      if (days < 0) list.push({ tone: 'bad', text: `Gasto fixo atrasado: ${f.name} venceu em ${SAM.fmtDay(due)}.`, tab: 'fixos' });
      else if (days <= 3) list.push({ tone: 'warn', text: `Gasto fixo próximo: ${f.name} vence ${days === 0 ? 'hoje' : `em ${SAM.fmtDay(due)}`}.`, tab: 'fixos' });
    });

    store.state.projects.filter((p) => !p.archived && p.deadline).forEach((p) => {
      const { paid } = store.projectTotals(p);
      if (p.costCents && paid >= p.costCents) return;
      const days = SAM.daysBetween(today, p.deadline);
      if (days < 0) list.push({ tone: 'bad', text: `Projeto com prazo vencido: ${p.name} (${SAM.fmtDay(p.deadline)}).`, tab: 'projetos' });
      else if (days <= 14) list.push({ tone: 'warn', text: `Prazo próximo: ${p.name} vence em ${SAM.fmtDay(p.deadline)}.`, tab: 'projetos' });
    });

    const budget = store.budgetFor(month);
    if (budget) {
      (budget.sectors || []).forEach((s) => {
        const over = store.sectorSpent(s) - s.plannedCents;
        if (over > 0) list.push({ tone: 'bad', text: `Setor ${s.name} passou ${brl(over)} do orçamento do mês.`, tab: 'orcamento' });
      });
    }
    return list;
  }

  function setupCard() {
    const { settings } = store.state;
    const steps = [
      {
        done: Boolean(settings.initialDate),
        text: 'Informar o saldo atual da conta da SAM',
        action: html`<button type="button" class="btn btn-small" data-act="edit-initial">Informar</button>`,
      },
      {
        done: SAM.ms.connected(),
        text: 'Conectar a conta Microsoft',
        action: html`<button type="button" class="btn btn-small" data-act="go" data-tab="config">Conectar</button>`,
      },
      {
        done: Boolean(settings.todoListId),
        text: 'Escolher a lista de pagamentos do To Do',
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
      ${SAM.ms.configured() ? '' : html`<p class="hint" style="margin-top:12px">Quer ver o app preenchido antes? <a href="?demo=1">Abrir a demonstração</a>.</p>`}
    </section>`;
  }

  function movements() {
    const projectName = (id) => { const p = store.find('projects', id); return p ? p.name : null; };
    const rows = [
      ...store.activeEntries().map((e) => ({ kind: 'in', date: e.date, title: e.desc, sub: e.category, cents: e.cents, entry: e, project: projectName(e.projectId) })),
      ...store.paidTasks().map((t) => ({ kind: 'out', date: t.completedAt, title: t.title, sub: 'Pago pelo To Do', cents: t.cents })),
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
    const { settings } = store.state;
    const open = store.openTasks();
    const items = alerts();

    return html`
      <section class="hero" aria-label="Saldo">
        <div class="hero-label">Saldo atual da SAM</div>
        <div class="hero-value ${s.balance < 0 ? 'is-negative' : ''}">${brl(s.balance)}</div>
        <div class="hero-note">
          ${settings.initialDate ? `Partiu de ${brl(settings.initialCents)} em ${SAM.fmtDate(settings.initialDate)}` : 'Saldo inicial ainda não informado'}
          ${store.todo.fetchedAt ? ` · To Do lido em ${SAM.fmtStamp(store.todo.fetchedAt)}` : ''}
        </div>
        <dl class="hero-metrics">
          <div><dt>Livre para uso</dt><dd>${brl(s.free)}</dd></div>
          <div><dt>Reservado a projetos</dt><dd>${brl(s.reserved)}</dd></div>
          <div><dt>A pagar no To Do</dt><dd>${brl(s.pending)}</dd></div>
          <div><dt>Após pagar tudo</dt><dd>${brl(s.afterPending)}</dd></div>
        </dl>
        <div class="hero-actions">
          <button type="button" class="btn btn-primary" data-act="new-entry">+ Registrar entrada</button>
        </div>
      </section>

      ${setupCard()}

      ${items.length ? html`<section class="card">
        <h2>Precisa de atenção</h2>
        <ul class="alerts">
          ${items.map((a) => html`<li class="alert ${a.tone}">
            <span>${a.text}</span>
            ${a.action || ''}
            ${a.tab ? html`<button type="button" class="btn btn-small" data-act="go" data-tab="${a.tab}">Ver</button>` : ''}
          </li>`)}
        </ul>
      </section>` : ''}

      ${open.length ? html`<section class="card">
        <h2>A pagar (tarefas abertas no To Do)</h2>
        <ul class="rows">
          ${open.map((t) => html`<li>
            <div class="row-main">
              <div>${t.title}</div>
              ${t.dueAt ? html`<div class="row-sub">Vence em ${SAM.fmtDate(t.dueAt)}</div>` : ''}
            </div>
            <span class="amount">${brl(t.cents)}</span>
          </li>`)}
        </ul>
      </section>` : ''}

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
        { name: 'category', label: 'Categoria', type: 'select', value: entry ? entry.category : 'Mensalidade', options: CATEGORIES.map((c) => ({ value: c, label: c })) },
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
  SAM.actions['ignore-task'] = (d) => {
    store.state.ignoredTasks[d.id] = Date.now();
    store.commit();
  };
})(window.SAM);
