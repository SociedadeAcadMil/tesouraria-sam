// Checklist mensal de gastos fixos. Marcar um item não altera o saldo:
// quem desconta é a tarefa concluída no To Do.
(function (SAM) {
  const { html, brl, store, ui } = SAM;

  function statusTag(f, month, today) {
    const check = (f.checks || {})[month];
    if (check) return html`<span class="tag good">Pago ${check.paidOn ? SAM.fmtDay(check.paidOn) : ''}</span>`;
    const days = SAM.daysBetween(today, SAM.dueDate(month, f.dueDay));
    if (days < 0) return html`<span class="tag bad">Atrasado</span>`;
    if (days === 0) return html`<span class="tag warn">Vence hoje</span>`;
    if (days <= 3) return html`<span class="tag warn">Em ${days} dia${days > 1 ? 's' : ''}</span>`;
    return '';
  }

  SAM.views.fixos = () => {
    const { month } = ui;
    const today = SAM.today();
    const items = store.state.fixed
      .filter((f) => f.startMonth <= month)
      .sort((a, b) => a.dueDay - b.dueDay || a.name.localeCompare(b.name));
    const done = items.filter((f) => (f.checks || {})[month]);
    const total = SAM.sum(items, (f) => f.cents);
    const paid = SAM.sum(done, (f) => f.cents);

    return html`
      <div class="page-head">
        <h1>Gastos fixos</h1>
        <button type="button" class="btn btn-primary" data-act="new-fixed">+ Novo</button>
      </div>
      ${ui.monthNav()}
      ${store.state.fixed.length === 0 ? html`<section class="card empty-card">
        <p class="empty">Nenhum gasto fixo cadastrado.</p>
      </section>` : html`<section class="card">
        <div class="stats">
          <div><div class="stat-label">Itens pagos</div><div class="stat-value">${done.length} de ${items.length}</div></div>
          <div><div class="stat-label">Valor marcado como pago</div><div class="stat-value">${brl(paid)}</div></div>
          <div><div class="stat-label">Falta pagar</div><div class="stat-value">${brl(total - paid)}</div></div>
        </div>
        <div style="margin:12px 0 4px">${ui.bar(SAM.pct(done.length, items.length), done.length === items.length && items.length ? 'good' : '')}</div>
        ${items.length === 0 ? html`<p class="empty">Nenhum gasto fixo neste mês.</p>` : html`<ul class="rows">
          ${items.map((f) => {
            const isDone = Boolean((f.checks || {})[month]);
            const boxId = `fixed-${f.id}`;
            return html`<li class="check-row ${isDone ? 'is-done' : ''}">
              <input type="checkbox" id="${boxId}" data-change="toggle-fixed" data-id="${f.id}" ${isDone ? html`checked` : ''}>
              <label class="row-main" for="${boxId}" style="cursor:pointer">
                <div class="row-title">${f.name}</div>
                <div class="row-sub">Vence dia ${f.dueDay} ${statusTag(f, month, today)}</div>
              </label>
              <span class="amount">${brl(f.cents)}</span>
              <button type="button" class="btn btn-small" data-act="edit-fixed" data-id="${f.id}">Editar</button>
            </li>`;
          })}
        </ul>`}
      </section>`}
    `;
  };

  async function fixedForm(item) {
    const values = await ui.form({
      title: item ? 'Editar gasto fixo' : 'Novo gasto fixo',
      fields: [
        { name: 'name', label: 'Nome', required: true, value: item && item.name },
        { name: 'cents', label: 'Valor mensal (R$)', type: 'money', required: true, positive: true, value: item ? item.cents : null },
        { name: 'dueDay', label: 'Dia do vencimento', type: 'number', min: 1, max: 31, value: item ? item.dueDay : 10 },
      ],
      extra: item && {
        label: 'Excluir',
        onClick: async () => {
          const yes = await ui.confirm({ title: 'Excluir gasto fixo?', message: `"${item.name}" sairá do checklist de todos os meses.`, confirmLabel: 'Excluir', danger: true });
          if (yes) { store.remove('fixed', item.id); store.commit(); }
        },
      },
    });
    if (!values) return;
    store.upsert('fixed', { checks: {}, startMonth: ui.month, ...(item || {}), ...values });
    store.commit();
  }

  SAM.actions['new-fixed'] = () => fixedForm(null);
  SAM.actions['edit-fixed'] = (d) => fixedForm(store.find('fixed', d.id));
  SAM.changes['toggle-fixed'] = (d, el) => {
    const item = store.find('fixed', d.id);
    const checks = { ...(item.checks || {}) };
    if (el.checked) checks[ui.month] = { paidOn: SAM.today() };
    else delete checks[ui.month];
    store.upsert('fixed', { ...item, checks });
    store.commit();
  };
})(window.SAM);
