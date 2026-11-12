// Configurações: conta Microsoft, lista do To Do, saldo inicial e backup.
(function (SAM) {
  const { html, brl, store, ui } = SAM;

  function microsoftCard() {
    const { ms } = SAM;
    let body;
    if (!ms.configured()) {
      body = html`<p class="hint">ID do aplicativo não configurado (ver <span class="code">COMO-PUBLICAR.md</span>). <a href="?demo=1">Ver demonstração</a></p>`;
    } else if (!ms.connected()) {
      body = html`<div class="btn-row"><button type="button" class="btn btn-primary" data-act="sign-in">Conectar</button></div>`;
    } else {
      body = html`<p><strong>${ms.account.username}</strong></p>
        ${ms.needsLogin ? html`<p class="hint" style="color:var(--bad)">Sessão expirada.</p>` : ''}
        <div class="btn-row" style="margin-top:10px">
          ${ms.needsLogin ? html`<button type="button" class="btn btn-primary" data-act="sign-in">Reconectar</button>` : ''}
          <button type="button" class="btn" data-act="sign-out">Sair</button>
        </div>`;
    }
    return html`<section class="card"><h2>Conta Microsoft</h2>${body}</section>`;
  }

  SAM.views.config = () => {
    const { settings } = store.state;
    return html`
      <div class="page-head"><h1>Configurações</h1></div>
      ${microsoftCard()}
      <section class="card">
        <h2>Listas do To Do</h2>
        <p>Pagamentos: ${settings.todoListName ? html`<strong>${settings.todoListName}</strong>` : 'nenhuma lista escolhida'}</p>
        <p style="margin-top:4px">Entradas: ${(store.todo.incomeLists || []).length ? html`<strong>${store.todo.incomeLists.join(', ')}</strong>` : 'nenhuma tarefa "Entradas …" na lista'}</p>
        <p class="hint" style="margin-top:4px">Etapas no formato <span class="code">150,00 - Gráfica</span></p>
        ${SAM.ms.connected() ? html`<div class="btn-row" style="margin-top:10px"><button type="button" class="btn" data-act="pick-list">${settings.todoListId ? 'Trocar' : 'Escolher'}</button></div>` : ''}
      </section>
      <section class="card">
        <h2>Saldo inicial</h2>
        <p>${settings.initialDate ? html`<strong>${brl(settings.initialCents)}</strong> em ${SAM.fmtDate(settings.initialDate)}` : 'Não informado'}</p>
        <div class="btn-row" style="margin-top:10px"><button type="button" class="btn" data-act="edit-initial">${settings.initialDate ? 'Alterar' : 'Informar'}</button></div>
      </section>
      <section class="card">
        <h2>Backup</h2>
        <div class="btn-row" style="margin-top:10px">
          <button type="button" class="btn" data-act="export-data">Exportar</button>
          <button type="button" class="btn" data-act="import-data">Importar</button>
        </div>
      </section>
    `;
  };

  SAM.actions['sign-in'] = async () => {
    try { await SAM.ms.signIn(); } catch (e) { ui.toast(e.message || 'Não foi possível abrir o login.'); }
  };

  SAM.actions['sign-out'] = async () => {
    await SAM.sync.run();
    const pending = SAM.sync.hasPending();
    const yes = await ui.confirm({
      title: 'Sair da conta?',
      message: pending
        ? 'ATENÇÃO: há alterações que ainda não chegaram ao OneDrive e serão perdidas. Exporte um backup antes, se precisar delas.'
        : 'Os dados serão removidos deste aparelho e continuam guardados no OneDrive da conta.',
      confirmLabel: 'Sair',
      danger: true,
    });
    if (!yes) return;
    if (!store.isDemo) {
      store.clearLocal();
      SAM.sync.forget();
    }
    try { await SAM.ms.signOut(); } catch (e) { ui.toast(e.message || 'Não foi possível sair.'); }
  };

  SAM.actions['pick-list'] = async () => {
    let lists;
    try {
      lists = await SAM.ms.lists();
    } catch (e) {
      ui.toast(e.needsLogin ? 'Sessão expirada. Reconecte em Configurações.' : 'Não foi possível ler as listas do To Do.');
      return;
    }
    if (!lists.length) { ui.toast('Nenhuma lista encontrada no To Do.'); return; }
    const { settings } = store.state;
    const v = await ui.form({
      title: 'Lista de pagamentos',
      fields: [{
        name: 'listId',
        label: 'Lista',
        type: 'select',
        value: settings.todoListId || lists[0].id,
        options: lists.map((l) => ({ value: l.id, label: l.displayName })),
      }],
    });
    if (!v) return;
    const list = lists.find((l) => l.id === v.listId);
    store.updateSettings({ todoListId: list.id, todoListName: list.displayName });
    store.setTodo([]);
    store.commit();
    SAM.sync.run();
  };

  SAM.actions['edit-initial'] = async () => {
    const { settings } = store.state;
    const v = await ui.form({
      title: 'Saldo inicial',
      intro: 'Valor do extrato na data. O que for anterior a ela não entra no cálculo.',
      fields: [
        { name: 'initialCents', label: 'Saldo na data (R$)', type: 'money', required: true, value: settings.initialDate ? settings.initialCents : null },
        { name: 'initialDate', label: 'Data', type: 'date', required: true, value: settings.initialDate || SAM.today() },
      ],
    });
    if (!v) return;
    store.updateSettings(v);
    store.commit();
  };

  SAM.actions['export-data'] = () => {
    const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sam-tesouraria-backup-${SAM.today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  SAM.actions['import-data'] = () => document.getElementById('import-file').click();

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (!data || !data.settings || !Array.isArray(data.entries)) throw new Error('formato');
    } catch (err) {
      ui.toast('Este arquivo não é um backup válido da tesouraria.');
      return;
    }
    const yes = await ui.confirm({
      title: 'Importar backup?',
      message: `Todos os dados atuais serão substituídos pelos do arquivo "${file.name}". Isso não pode ser desfeito.`,
      confirmLabel: 'Substituir dados',
      danger: true,
    });
    if (!yes) return;
    store.replace(data);
    store.revision += 1;
    try {
      await SAM.sync.overwriteRemote();
      ui.toast('Backup importado.');
      SAM.sync.run();
    } catch (err) {
      ui.toast('Backup importado, mas ainda não enviado ao OneDrive.');
    }
  });
})(window.SAM);
