// Balancete do mês: saídas do To Do por categoria e entradas por tipo
// (entradas lançadas no app e entradas das listas "Entradas ..." do To Do).
// Classificar não altera o saldo; serve só para a prestação de contas.
(function (SAM) {
  const { html, brl, store, ui } = SAM;
  const OUT_OPTIONS = SAM.EXPENSE_CATS.map((c) => ({ value: c.id, label: c.label }));
  const IN_OPTIONS = SAM.ENTRY_TYPES.map((t) => ({ value: t, label: t }));
  const plural = { Mensalidade: 'Mensalidades', Recolhimento: 'Recolhimentos' };

  const catSelect = (t, current) => html`<select class="btn btn-small" data-change="set-cat" data-id="${t.id}" aria-label="Categoria de ${t.title}">
    <option value="">${current ? 'Remover categoria' : 'Classificar…'}</option>
    ${(t.kind === 'in' ? IN_OPTIONS : OUT_OPTIONS).map((o) => html`<option value="${o.value}" ${o.value === current ? html`selected` : ''}>${o.label}</option>`)}
  </select>`;

  // Linha de item do To Do (pagamento ou entrada), com a categoria editável.
  const todoRow = (t) => html`<li style="flex-wrap:wrap">
    <div class="row-main" style="min-width:180px">
      <div>${t.title}</div>
      <div class="row-sub">${SAM.fmtDate(t.completedAt)}${t.group ? ` · ${t.group}` : ''}</div>
    </div>
    <span class="amount ${t.kind === 'in' ? 'in' : ''}">${t.kind === 'in' ? '+ ' : ''}${brl(t.cents)}</span>
    ${catSelect(t, store.categoryOf(t.id))}
  </li>`;

  // Linha de entrada lançada no app.
  const entryRow = (e) => html`<li>
    <div class="row-main"><div>${e.desc}</div><div class="row-sub">${SAM.fmtDate(e.date)}</div></div>
    <span class="amount in">+ ${brl(e.cents)}</span>
    ${e.projectId ? '' : html`<button type="button" class="btn btn-small" data-act="edit-entry" data-id="${e.id}">Editar</button>`}
  </li>`;
  const anyRow = (x) => ('desc' in x ? entryRow(x) : todoRow(x));
  const centsOf = (x) => x.cents;

  // Barra de uma categoria: valor, participação no total e lista recolhível.
  function group(key, label, tone, items, total, listable = true) {
    const value = SAM.sum(items, centsOf);
    const share = SAM.pct(value, total);
    return html`<div class="track">
      <div class="track-head">
        <span><b>${label}</b> <span class="tag">${items.length}</span></span>
        <span class="track-figures">${brl(value)} · ${share}%</span>
      </div>
      ${ui.bar(share, tone)}
      ${listable && items.length ? html`<details data-key="${key}" ${ui.isOpen(key)}>
        <summary>Ver itens</summary>
        <ul class="rows">${items.map(anyRow)}</ul>
      </details>` : ''}
    </div>`;
  }

  const inMonth = (list) => list
    .filter((t) => SAM.monthOf(t.completedAt || '') === ui.month)
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));

  // Itens ainda sem categoria que já têm uma categoria anterior com a mesma descrição.
  function suggestable(items, kind) {
    const hints = store.suggestions(kind);
    return items.filter((t) => hints.has(SAM.itemKey(t.title)));
  }

  SAM.views.balancete = () => {
    const { month } = ui;
    const paid = inMonth(store.paidTasks());
    const received = inMonth(store.receivedIncomes());
    const entries = store.activeEntries()
      .filter((e) => SAM.monthOf(e.date) === month)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const outTotal = SAM.sum(paid, centsOf);
    const inTotal = SAM.sum(entries, centsOf) + SAM.sum(received, centsOf);
    const result = inTotal - outTotal;

    const outPending = paid.filter((t) => !store.categoryOf(t.id));
    const inPending = received.filter((t) => !store.categoryOf(t.id));
    const toClassify = [...inPending, ...outPending];
    const repeatable = suggestable(outPending, 'out').length + suggestable(inPending, 'in').length;

    const entryTypes = [...SAM.ENTRY_TYPES];
    if (entries.some((e) => SAM.entryType(e) === 'Outras')) entryTypes.push('Outras');
    const inOfType = (type) => [
      ...entries.filter((e) => SAM.entryType(e) === type),
      ...received.filter((t) => store.categoryOf(t.id) === type),
    ];

    return html`
      <div class="page-head"><h1>Balancete</h1></div>
      ${ui.monthNav()}

      <section class="card">
        <div class="stats">
          <div><div class="stat-label">Entradas</div><div class="stat-value good">${brl(inTotal)}</div></div>
          <div><div class="stat-label">Saídas</div><div class="stat-value bad">${brl(outTotal)}</div></div>
          <div><div class="stat-label">Resultado</div><div class="stat-value ${result < 0 ? 'bad' : 'good'}">${result < 0 ? '−' : ''} ${brl(Math.abs(result))}</div></div>
        </div>
        ${store.state.settings.initialDate && SAM.monthOf(store.state.settings.initialDate) === month
          ? html`<p class="hint" style="margin-top:8px">Desde ${SAM.fmtDate(store.state.settings.initialDate)}</p>` : ''}
      </section>

      ${toClassify.length ? html`<section class="card">
        <div class="card-head">
          <h2>A classificar (${toClassify.length})</h2>
          ${repeatable ? html`<button type="button" class="btn btn-small btn-primary" data-act="apply-suggestions">Repetir categorias (${repeatable})</button>` : ''}
        </div>
        ${inPending.length ? html`<div class="sub-title">Entradas</div><ul class="rows">${inPending.map(todoRow)}</ul>` : ''}
        ${outPending.length ? html`<div class="sub-title">Saídas</div><ul class="rows">${outPending.map(todoRow)}</ul>` : ''}
      </section>` : ''}

      <section class="card">
        <h2>Saídas</h2>
        ${paid.length === 0 ? html`<p class="empty">Nenhum pagamento neste mês.</p>` : html`
          ${SAM.EXPENSE_CATS.map((c) => group(`bal-${c.id}`, c.label, c.tone, paid.filter((t) => store.categoryOf(t.id) === c.id), outTotal))}
          ${outPending.length ? group('bal-out-none', 'Sem categoria', '', outPending, outTotal, false) : ''}
        `}
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Entradas</h2>
          <button type="button" class="btn btn-small" data-act="new-entry">+ Entrada</button>
        </div>
        ${inTotal === 0 && !received.length ? html`<p class="empty">Nenhuma entrada neste mês.</p>` : html`
          ${entryTypes.map((type) => group(`bal-in-${type}`, plural[type] || type, 'good', inOfType(type), inTotal))}
          ${inPending.length ? group('bal-in-none', 'Sem categoria', '', inPending, inTotal, false) : ''}
        `}
      </section>
    `;
  };

  SAM.changes['set-cat'] = (d, el) => {
    store.setCategory(d.id, el.value);
    store.commit();
  };

  SAM.actions['apply-suggestions'] = () => {
    let count = 0;
    [['out', store.paidTasks()], ['in', store.receivedIncomes()]].forEach(([kind, list]) => {
      const hints = store.suggestions(kind);
      inMonth(list).filter((t) => !store.categoryOf(t.id)).forEach((t) => {
        const hint = hints.get(SAM.itemKey(t.title));
        if (hint) { store.setCategory(t.id, hint.cat); count += 1; }
      });
    });
    store.commit();
    ui.toast(`${count} ${count === 1 ? 'item classificado' : 'itens classificados'}. Confira e ajuste se precisar.`);
  };
})(window.SAM);
