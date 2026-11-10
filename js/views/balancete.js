// Balancete do mês: saídas do To Do por categoria e entradas por tipo.
// Classificar um pagamento não altera o saldo; serve só para a prestação de contas.
(function (SAM) {
  const { html, brl, store, ui } = SAM;
  const UNSET = { id: '', label: 'Sem categoria', tone: '' };

  const catSelect = (t, current) => html`<select class="btn btn-small" data-change="set-cat" data-id="${t.id}" aria-label="Categoria de ${t.title}">
    <option value="">${current ? 'Remover categoria' : 'Classificar…'}</option>
    ${SAM.EXPENSE_CATS.map((c) => html`<option value="${c.id}" ${c.id === current ? html`selected` : ''}>${c.label}</option>`)}
  </select>`;

  const row = (t) => html`<li style="flex-wrap:wrap">
    <div class="row-main" style="min-width:180px">
      <div>${t.title}</div>
      <div class="row-sub">${SAM.fmtDate(t.completedAt)}${t.group ? ` · ${t.group}` : ''}</div>
    </div>
    <span class="amount">${brl(t.cents)}</span>
    ${catSelect(t, store.categoryOf(t.id))}
  </li>`;

  // Barra de uma categoria: valor, participação no total e lista recolhível.
  function group(key, label, tone, items, total, rowFn, valueFn) {
    const value = SAM.sum(items, valueFn);
    const share = SAM.pct(value, total);
    return html`<div class="track">
      <div class="track-head">
        <span><b>${label}</b> <span class="tag">${items.length}</span></span>
        <span class="track-figures">${brl(value)} · ${share}%</span>
      </div>
      ${ui.bar(share, tone)}
      ${items.length ? html`<details data-key="${key}" ${ui.isOpen(key)}>
        <summary>Ver itens</summary>
        <ul class="rows">${items.map(rowFn)}</ul>
      </details>` : ''}
    </div>`;
  }

  SAM.views.balancete = () => {
    const { month } = ui;
    const paid = store.paidTasks()
      .filter((t) => SAM.monthOf(t.completedAt || '') === month)
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
    const entries = store.activeEntries()
      .filter((e) => SAM.monthOf(e.date) === month)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const outTotal = SAM.sum(paid, (t) => t.cents);
    const inTotal = SAM.sum(entries, (e) => e.cents);
    const result = inTotal - outTotal;

    const uncategorized = paid.filter((t) => !store.categoryOf(t.id));
    const hints = store.suggestions();
    const suggestable = uncategorized.filter((t) => hints.has(SAM.itemKey(t.title)));

    const entryTypes = [...SAM.ENTRY_TYPES];
    if (entries.some((e) => SAM.entryType(e) === 'Outras')) entryTypes.push('Outras');
    const entryRow = (e) => html`<li>
      <div class="row-main"><div>${e.desc}</div><div class="row-sub">${SAM.fmtDate(e.date)}</div></div>
      <span class="amount in">+ ${brl(e.cents)}</span>
      ${e.projectId ? '' : html`<button type="button" class="btn btn-small" data-act="edit-entry" data-id="${e.id}">Editar</button>`}
    </li>`;

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

      ${uncategorized.length ? html`<section class="card">
        <div class="card-head">
          <h2>A classificar (${uncategorized.length})</h2>
          ${suggestable.length ? html`<button type="button" class="btn btn-small btn-primary" data-act="apply-suggestions">Repetir categorias (${suggestable.length})</button>` : ''}
        </div>
        <ul class="rows" style="margin-top:6px">${uncategorized.map(row)}</ul>
      </section>` : ''}

      <section class="card">
        <h2>Saídas</h2>
        ${paid.length === 0 ? html`<p class="empty">Nenhum pagamento neste mês.</p>` : html`
          ${SAM.EXPENSE_CATS.map((c) => group(`bal-${c.id}`, c.label, c.tone, paid.filter((t) => store.categoryOf(t.id) === c.id), outTotal, row, (t) => t.cents))}
          ${uncategorized.length ? (() => {
            const value = SAM.sum(uncategorized, (t) => t.cents);
            return html`<div class="track">
              <div class="track-head">
                <span><b>${UNSET.label}</b> <span class="tag">${uncategorized.length}</span></span>
                <span class="track-figures">${brl(value)} · ${SAM.pct(value, outTotal)}%</span>
              </div>
              ${ui.bar(SAM.pct(value, outTotal), '')}
            </div>`;
          })() : ''}
        `}
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Entradas</h2>
          <button type="button" class="btn btn-small" data-act="new-entry">+ Entrada</button>
        </div>
        ${entries.length === 0 ? html`<p class="empty">Nenhuma entrada neste mês.</p>` : entryTypes.map((type) => group(
          `bal-in-${type}`, type === 'Mensalidade' ? 'Mensalidades' : type === 'Recolhimento' ? 'Recolhimentos' : type,
          'good', entries.filter((e) => SAM.entryType(e) === type), inTotal, entryRow, (e) => e.cents,
        ))}
      </section>
    `;
  };

  SAM.changes['set-cat'] = (d, el) => {
    store.setCategory(d.id, el.value);
    store.commit();
  };

  SAM.actions['apply-suggestions'] = () => {
    const hints = store.suggestions();
    let count = 0;
    store.paidTasks()
      .filter((t) => SAM.monthOf(t.completedAt || '') === ui.month && !store.categoryOf(t.id))
      .forEach((t) => {
        const hint = hints.get(SAM.itemKey(t.title));
        if (hint) { store.setCategory(t.id, hint.cat); count += 1; }
      });
    store.commit();
    ui.toast(`${count} ${count === 1 ? 'pagamento classificado' : 'pagamentos classificados'}. Confira e ajuste se precisar.`);
  };
})(window.SAM);
