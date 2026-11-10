// Quadro de orçamento mensal: divide o previsto por setor e acompanha os gastos.
// Gastos lançados aqui não alteram o saldo, que muda pelas tarefas concluídas no To Do.
(function (SAM) {
  const { html, brl, store, ui } = SAM;

  const saveBudget = (budget) => { store.upsert('budgets', budget); store.commit(); };
  const withSector = (budget, sectorId, fn) => ({
    ...budget,
    sectors: budget.sectors.map((s) => (s.id === sectorId ? fn(s) : s)),
  });

  function sectorCard(s) {
    const spent = store.sectorSpent(s);
    const left = s.plannedCents - spent;
    const used = SAM.pct(spent, s.plannedCents);
    const expenses = [...(s.expenses || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    let tone = '';
    if (left < 0) tone = 'bad';
    else if (used >= 80) tone = 'warn';

    return html`<section class="card">
      <div class="card-head">
        <h2>${s.name}</h2>
        <button type="button" class="btn btn-small" data-act="edit-sector" data-id="${s.id}">Editar</button>
      </div>
      <div class="stats" style="margin:10px 0">
        <div><div class="stat-label">Previsto</div><div class="stat-value">${brl(s.plannedCents)}</div></div>
        <div><div class="stat-label">Gasto</div><div class="stat-value">${brl(spent)}</div></div>
        <div><div class="stat-label">${left < 0 ? 'Acima do previsto' : 'Disponível'}</div><div class="stat-value ${left < 0 ? 'bad' : 'good'}">${brl(Math.abs(left))}</div></div>
      </div>
      ${ui.bar(used, tone)}
      <div class="btn-row" style="margin-top:12px">
        <button type="button" class="btn btn-small" data-act="add-expense" data-id="${s.id}">+ Lançar gasto</button>
      </div>
      ${expenses.length ? html`<details data-key="sector-${s.id}" ${ui.isOpen(`sector-${s.id}`)}>
        <summary>Gastos lançados (${expenses.length})</summary>
        <ul class="rows">
          ${expenses.map((e) => html`<li>
            <div class="row-main"><div>${e.desc}</div><div class="row-sub">${SAM.fmtDate(e.date)}${e.taskId ? ' · do To Do' : ''}</div></div>
            <span class="amount">${brl(e.cents)}</span>
            <button type="button" class="btn btn-small" data-act="edit-expense" data-id="${s.id}" data-item="${e.id}">Editar</button>
          </li>`)}
        </ul>
      </details>` : ''}
    </section>`;
  }

  function unallocated(budget) {
    const used = store.allocatedTaskIds();
    const tasks = store.paidTasks().filter((t) => SAM.monthOf(t.completedAt || '') === ui.month && !used.has(t.id));
    if (!tasks.length || !budget.sectors.length) return '';
    return html`<section class="card">
      <h2>Pagamentos sem setor</h2>
      <ul class="rows">
        ${tasks.map((t) => html`<li style="flex-wrap:wrap">
          <div class="row-main" style="min-width:180px"><div>${t.title}</div><div class="row-sub">${SAM.fmtDate(t.completedAt)} · ${brl(t.cents)}</div></div>
          <select class="btn btn-small" data-change="alloc-task" data-id="${t.id}" aria-label="Setor de ${t.title}">
            <option value="">Escolher setor…</option>
            ${budget.sectors.map((s) => html`<option value="${s.id}">${s.name}</option>`)}
          </select>
        </li>`)}
      </ul>
    </section>`;
  }

  function latestBefore(month) {
    return store.state.budgets
      .filter((b) => b.month < month)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
  }

  SAM.views.orcamento = () => {
    const { month } = ui;
    const budget = store.budgetFor(month);
    const head = html`<div class="page-head">
      <h1>Orçamento</h1>
      ${budget ? html`<button type="button" class="btn btn-primary" data-act="new-sector">+ Setor</button>` : ''}
    </div>${ui.monthNav()}`;

    if (!budget) {
      const earlier = latestBefore(month);
      return html`${head}<section class="card empty-card">
        <p class="empty">Sem orçamento neste mês.</p>
        <div class="btn-row" style="justify-content:center">
          <button type="button" class="btn btn-primary" data-act="new-budget">Criar</button>
          ${earlier ? html`<button type="button" class="btn" data-act="copy-budget" data-from="${earlier.month}">Copiar de ${SAM.monthLabel(earlier.month)}</button>` : ''}
        </div>
      </section>`;
    }

    const planned = SAM.sum(budget.sectors, (s) => s.plannedCents);
    const spent = SAM.sum(budget.sectors, (s) => store.sectorSpent(s));
    const free = budget.totalCents - planned;
    const left = budget.totalCents - spent;
    let tone = '';
    if (left < 0) tone = 'bad';
    else if (SAM.pct(spent, budget.totalCents) >= 80) tone = 'warn';

    return html`${head}
      <section class="card">
        <div class="card-head">
          <h2>Resumo</h2>
          <button type="button" class="btn btn-small" data-act="edit-budget">Editar</button>
        </div>
        <div class="stats" style="margin:10px 0">
          <div><div class="stat-label">Orçamento</div><div class="stat-value">${brl(budget.totalCents)}</div></div>
          <div><div class="stat-label">Gasto</div><div class="stat-value">${brl(spent)}</div></div>
          <div><div class="stat-label">${left < 0 ? 'Acima do orçamento' : 'Restante'}</div><div class="stat-value ${left < 0 ? 'bad' : 'good'}">${brl(Math.abs(left))}</div></div>
        </div>
        ${ui.bar(SAM.pct(spent, budget.totalCents), tone)}
        <p class="hint" style="margin-top:8px">
          ${free >= 0 ? `Não distribuído: ${brl(free)}` : `Setores excedem o total em ${brl(-free)}`}
        </p>
      </section>
      ${budget.sectors.length === 0 ? html`<section class="card empty-card"><p class="empty">Nenhum setor criado.</p></section>` : budget.sectors.map(sectorCard)}
      ${unallocated(budget)}
    `;
  };

  async function budgetForm(budget) {
    const v = await ui.form({
      title: budget ? 'Editar orçamento do mês' : `Orçamento de ${SAM.monthLabel(ui.month)}`,
      fields: [{ name: 'totalCents', label: 'Orçamento previsto para o mês (R$)', type: 'money', required: true, positive: true, value: budget ? budget.totalCents : null }],
    });
    if (!v) return;
    saveBudget({ id: `budget-${ui.month}`, month: ui.month, sectors: [], ...(budget || {}), ...v });
  }

  async function sectorForm(budget, sector) {
    const v = await ui.form({
      title: sector ? 'Editar setor' : 'Novo setor',
      fields: [
        { name: 'name', label: 'Nome do setor', required: true, value: sector && sector.name },
        { name: 'plannedCents', label: 'Previsto para o mês (R$)', type: 'money', required: true, value: sector ? sector.plannedCents : null },
      ],
      extra: sector && {
        label: 'Excluir',
        onClick: async () => {
          const yes = await ui.confirm({ title: 'Excluir setor?', message: `"${sector.name}" e seus gastos lançados serão removidos deste orçamento.`, confirmLabel: 'Excluir', danger: true });
          if (yes) saveBudget({ ...budget, sectors: budget.sectors.filter((s) => s.id !== sector.id) });
        },
      },
    });
    if (!v) return;
    if (sector) saveBudget(withSector(budget, sector.id, (s) => ({ ...s, ...v })));
    else saveBudget({ ...budget, sectors: [...budget.sectors, { id: SAM.uid(), expenses: [], ...v }] });
  }

  async function expenseForm(budget, sector, expense) {
    const defaultDate = SAM.monthOf(SAM.today()) === ui.month ? SAM.today() : `${ui.month}-01`;
    const v = await ui.form({
      title: expense ? 'Editar gasto' : `Lançar gasto: ${sector.name}`,
      intro: expense ? '' : 'Não altera o saldo.',
      fields: [
        { name: 'desc', label: 'Descrição', required: true, value: expense && expense.desc },
        { name: 'cents', label: 'Valor (R$)', type: 'money', required: true, positive: true, value: expense ? expense.cents : null },
        { name: 'date', label: 'Data', type: 'date', required: true, value: expense ? expense.date : defaultDate },
      ],
      extra: expense && {
        label: 'Excluir',
        onClick: () => saveBudget(withSector(budget, sector.id, (s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== expense.id) }))),
      },
    });
    if (!v) return;
    saveBudget(withSector(budget, sector.id, (s) => ({
      ...s,
      expenses: expense
        ? s.expenses.map((e) => (e.id === expense.id ? { ...e, ...v } : e))
        : [...(s.expenses || []), { id: SAM.uid(), ...v }],
    })));
  }

  const current = () => store.budgetFor(ui.month);
  const sectorOf = (id) => current().sectors.find((s) => s.id === id);

  SAM.actions['new-budget'] = () => budgetForm(null);
  SAM.actions['edit-budget'] = () => budgetForm(current());
  SAM.actions['copy-budget'] = (d) => {
    const from = store.budgetFor(d.from);
    saveBudget({
      id: `budget-${ui.month}`,
      month: ui.month,
      totalCents: from.totalCents,
      sectors: from.sectors.map((s) => ({ id: SAM.uid(), name: s.name, plannedCents: s.plannedCents, expenses: [] })),
    });
    ui.toast('Setores copiados. Os gastos começam zerados.');
  };
  SAM.actions['new-sector'] = () => sectorForm(current(), null);
  SAM.actions['edit-sector'] = (d) => sectorForm(current(), sectorOf(d.id));
  SAM.actions['add-expense'] = (d) => expenseForm(current(), sectorOf(d.id), null);
  SAM.actions['edit-expense'] = (d) => {
    const sector = sectorOf(d.id);
    expenseForm(current(), sector, sector.expenses.find((e) => e.id === d.item));
  };
  SAM.changes['alloc-task'] = (d, el) => {
    if (!el.value) return;
    const task = store.paidTasks().find((t) => t.id === d.id);
    if (!task) return;
    saveBudget(withSector(current(), el.value, (s) => ({
      ...s,
      expenses: [...(s.expenses || []), { id: SAM.uid(), desc: task.title, cents: task.cents, date: task.completedAt, taskId: task.id }],
    })));
  };
})(window.SAM);
