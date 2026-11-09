// Projetos pendentes: em que fase está o recolhimento do dinheiro e o pagamento do produto.
(function (SAM) {
  const { html, brl, store, ui } = SAM;

  function phase(done, goal, labels) {
    if (done <= 0) return { text: labels[0], tone: '' };
    if (goal > 0 && done >= goal) return { text: labels[2], tone: 'good' };
    return { text: labels[1], tone: 'warn' };
  }

  const track = (title, done, goal, labels) => {
    const p = phase(done, goal, labels);
    return html`<div class="track">
      <div class="track-head">
        <span><b>${title}</b> <span class="tag ${p.tone}">${p.text}</span></span>
        <span class="track-figures">${brl(done)} de ${brl(goal)}</span>
      </div>
      ${ui.bar(SAM.pct(done, goal), p.tone === 'good' ? 'good' : '')}
    </div>`;
  };

  function card(p) {
    const t = store.projectTotals(p);
    const receipts = p.receipts || [];
    const payments = p.payments || [];
    const remaining = Math.max(0, p.targetCents - t.collected);
    const owed = Math.max(0, p.costCents - t.paid);

    return html`<section class="card">
      <div class="card-head">
        <div>
          <h2>${p.name}</h2>
          <div class="row-sub">${p.deadline ? `Prazo: ${SAM.fmtDate(p.deadline)}` : 'Sem prazo definido'}${p.notes ? ` · ${p.notes}` : ''}</div>
        </div>
        <button type="button" class="btn btn-small" data-act="edit-project" data-id="${p.id}">Editar</button>
      </div>
      ${track('Recolhimento', t.collected, p.targetCents, ['Não iniciado', 'Em andamento', 'Concluído'])}
      ${track('Pagamento do produto', t.paid, p.costCents, ['Não pago', 'Pago em parte', 'Quitado'])}
      <p class="hint" style="margin-top:10px">
        Falta recolher ${brl(remaining)} · Falta pagar ${brl(owed)} · Reservado no saldo ${brl(t.reserved)}
      </p>
      ${p.archived ? '' : html`<div class="btn-row" style="margin-top:10px">
        <button type="button" class="btn btn-small" data-act="add-receipt" data-id="${p.id}">+ Recolhimento</button>
        <button type="button" class="btn btn-small" data-act="add-payment" data-id="${p.id}">+ Pagamento</button>
        ${remaining === 0 && owed === 0 ? html`<button type="button" class="btn btn-small btn-primary" data-act="archive-project" data-id="${p.id}">Concluir projeto</button>` : ''}
      </div>`}
      ${receipts.length || payments.length ? html`<details data-key="project-${p.id}" ${ui.isOpen(`project-${p.id}`)}>
        <summary>Histórico (${receipts.length + payments.length})</summary>
        ${receipts.length ? html`<div class="sub-title">Recolhimentos</div><ul class="rows">
          ${receipts.map((r) => html`<li>
            <div class="row-main"><div>${r.note || 'Recolhimento'}</div><div class="row-sub">${SAM.fmtDate(r.date)}${r.entryId ? ' · lançado no saldo' : ''}</div></div>
            <span class="amount">${brl(r.cents)}</span>
            <button type="button" class="btn btn-small btn-danger" data-act="del-receipt" data-id="${p.id}" data-item="${r.id}">Excluir</button>
          </li>`)}
        </ul>` : ''}
        ${payments.length ? html`<div class="sub-title">Pagamentos</div><ul class="rows">
          ${payments.map((r) => html`<li>
            <div class="row-main"><div>${r.note || 'Pagamento'}</div><div class="row-sub">${SAM.fmtDate(r.date)}</div></div>
            <span class="amount">${brl(r.cents)}</span>
            <button type="button" class="btn btn-small btn-danger" data-act="del-payment" data-id="${p.id}" data-item="${r.id}">Excluir</button>
          </li>`)}
        </ul>` : ''}
      </details>` : ''}
      ${p.archived ? html`<div class="btn-row" style="margin-top:10px"><button type="button" class="btn btn-small" data-act="unarchive-project" data-id="${p.id}">Reabrir projeto</button></div>` : ''}
    </section>`;
  }

  SAM.views.projetos = () => {
    const all = store.state.projects;
    const active = all.filter((p) => !p.archived)
      .sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));
    const archived = all.filter((p) => p.archived);
    return html`
      <div class="page-head">
        <div>
          <h1>Projetos</h1>
          <p class="page-sub">Quanto já foi recolhido e quanto já foi pago em cada um.</p>
        </div>
        <button type="button" class="btn btn-primary" data-act="new-project">+ Novo projeto</button>
      </div>
      ${active.length === 0 ? html`<section class="card empty-card"><p class="empty">Nenhum projeto pendente. Cadastre um quando começar a recolher dinheiro para uma compra, como camisetas ou um evento.</p></section>` : active.map(card)}
      ${archived.length ? html`<details data-key="archived-projects" ${ui.isOpen('archived-projects')}>
        <summary>Projetos concluídos (${archived.length})</summary>
        ${archived.map(card)}
      </details>` : ''}
    `;
  };

  async function projectForm(p) {
    const values = await ui.form({
      title: p ? 'Editar projeto' : 'Novo projeto',
      fields: [
        { name: 'name', label: 'Nome', required: true, value: p && p.name },
        { name: 'targetCents', label: 'Total a recolher (R$)', type: 'money', required: true, positive: true, value: p ? p.targetCents : null },
        { name: 'costCents', label: 'Custo do produto (R$)', type: 'money', required: true, positive: true, value: p ? p.costCents : null },
        { name: 'deadline', label: 'Prazo (opcional)', type: 'date', value: p && p.deadline },
        { name: 'notes', label: 'Observações (opcional)', value: p && p.notes },
      ],
      extra: p && {
        label: 'Excluir',
        onClick: async () => {
          const yes = await ui.confirm({
            title: 'Excluir projeto?',
            message: `"${p.name}" e seu histórico serão apagados. As entradas já lançadas continuam no saldo, pois esse dinheiro foi recebido.`,
            confirmLabel: 'Excluir',
            danger: true,
          });
          if (!yes) return;
          store.state.entries.filter((e) => e.projectId === p.id).forEach((e) => {
            const { projectId, receiptId, ...rest } = e;
            store.upsert('entries', rest);
          });
          store.remove('projects', p.id);
          store.commit();
        },
      },
    });
    if (!values) return;
    store.upsert('projects', { receipts: [], payments: [], ...(p || {}), ...values });
    store.commit();
  }

  async function addReceipt(p) {
    const startDate = store.state.settings.initialDate;
    const v = await ui.form({
      title: `Recolhimento: ${p.name}`,
      fields: [
        { name: 'cents', label: 'Valor recebido (R$)', type: 'money', required: true, positive: true },
        { name: 'date', label: 'Data', type: 'date', required: true, value: SAM.today() },
        { name: 'note', label: 'De quem / referência (opcional)' },
        { name: 'toBalance', label: 'Lançar também como entrada no saldo', type: 'checkbox', value: true },
      ],
      validate: (x) => (x.toBalance && startDate && x.date < startDate
        ? `Essa data é anterior ao saldo inicial (${SAM.fmtDate(startDate)}). Desmarque o lançamento no saldo, pois o valor já está incluído nele.`
        : ''),
    });
    if (!v) return;
    const receipt = { id: SAM.uid(), cents: v.cents, date: v.date, note: v.note };
    if (v.toBalance) {
      const entry = store.upsert('entries', {
        desc: `${p.name}${v.note ? `: ${v.note}` : ''}`,
        category: 'Recolhimento de projeto',
        cents: v.cents,
        date: v.date,
        projectId: p.id,
        receiptId: receipt.id,
      });
      receipt.entryId = entry.id;
    }
    store.upsert('projects', { ...p, receipts: [...(p.receipts || []), receipt] });
    store.commit();
    ui.toast(v.toBalance ? 'Recolhimento registrado e somado ao saldo.' : 'Recolhimento registrado.');
  }

  async function addPayment(p) {
    const v = await ui.form({
      title: `Pagamento: ${p.name}`,
      intro: 'Isto só acompanha a fase do projeto. O saldo é descontado quando a tarefa do pagamento for concluída no To Do.',
      fields: [
        { name: 'cents', label: 'Valor pago (R$)', type: 'money', required: true, positive: true },
        { name: 'date', label: 'Data', type: 'date', required: true, value: SAM.today() },
        { name: 'note', label: 'Referência (opcional)', hint: 'Exemplo: sinal, 2ª parcela, quitação.' },
      ],
    });
    if (!v) return;
    store.upsert('projects', { ...p, payments: [...(p.payments || []), { id: SAM.uid(), ...v }] });
    store.commit();
  }

  SAM.actions['new-project'] = () => projectForm(null);
  SAM.actions['edit-project'] = (d) => projectForm(store.find('projects', d.id));
  SAM.actions['add-receipt'] = (d) => addReceipt(store.find('projects', d.id));
  SAM.actions['add-payment'] = (d) => addPayment(store.find('projects', d.id));
  SAM.actions['del-receipt'] = async (d) => {
    const p = store.find('projects', d.id);
    const r = p.receipts.find((x) => x.id === d.item);
    const yes = await ui.confirm({
      title: 'Excluir recolhimento?',
      message: r.entryId ? `${brl(r.cents)} também sairá do saldo.` : `${brl(r.cents)} sairá do projeto.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!yes) return;
    if (r.entryId) store.remove('entries', r.entryId);
    store.upsert('projects', { ...p, receipts: p.receipts.filter((x) => x.id !== r.id) });
    store.commit();
  };
  SAM.actions['del-payment'] = async (d) => {
    const p = store.find('projects', d.id);
    const yes = await ui.confirm({ title: 'Excluir pagamento?', message: 'O registro sairá do projeto. O saldo não muda.', confirmLabel: 'Excluir', danger: true });
    if (!yes) return;
    store.upsert('projects', { ...p, payments: p.payments.filter((x) => x.id !== d.item) });
    store.commit();
  };
  SAM.actions['archive-project'] = (d) => {
    store.upsert('projects', { ...store.find('projects', d.id), archived: true });
    store.commit();
  };
  SAM.actions['unarchive-project'] = (d) => {
    store.upsert('projects', { ...store.find('projects', d.id), archived: false });
    store.commit();
  };
})(window.SAM);
