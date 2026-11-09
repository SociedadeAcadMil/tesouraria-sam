// Mantém o To Do atualizado e o arquivo de dados no OneDrive igual em todos os aparelhos.
(function (SAM) {
  const FILE = '/me/drive/special/approot:/sam-tesouraria.json';
  const { store } = SAM;
  const ms = () => SAM.ms;

  let meta = store.readMeta('sync', { etag: null, dirty: false });
  let timer = null;
  let running = null;
  let pendingRun = false;

  const saveMeta = () => store.writeMeta('sync', meta);

  const sync = {
    status: { busy: false, error: null, syncedAt: meta.syncedAt || null },

    setStatus(patch) {
      this.status = { ...this.status, ...patch };
      if (SAM.ui) SAM.ui.renderStatus();
    },

    // Chamado a cada alteração local: junta alterações próximas em um único envio.
    schedule() {
      meta.dirty = true;
      saveMeta();
      if (store.isDemo || !ms().connected()) return;
      clearTimeout(timer);
      timer = setTimeout(() => this.run(), 1500);
    },

    // Baixa o arquivo do OneDrive, combina com o que está no aparelho e guarda.
    async pull() {
      const res = await ms().request(FILE);
      if (res.status === 404) { meta.etag = null; meta.dirty = true; return; }
      if (!res.ok) throw new Error(`OneDrive respondeu com erro ${res.status}.`);
      const item = await res.json();
      if (item.eTag === meta.etag) return;

      // Navegadores não seguem o redirecionamento de /content com token: usar downloadUrl.
      const download = await fetch(item['@microsoft.graph.downloadUrl']);
      if (!download.ok) throw new Error(`Falha ao baixar os dados (${download.status}).`);
      const remote = await download.json();
      const merged = store.merge(store.state, remote);
      if (JSON.stringify(merged) !== JSON.stringify(store.merge(remote, {}))) meta.dirty = true;
      meta.etag = item.eTag;
      store.replace(merged);
    },

    // Envia só se ninguém alterou o arquivo desde a última leitura; se alterou, combina de novo.
    async push(retry = true) {
      const revision = store.revision;
      const headers = { 'Content-Type': 'application/json' };
      if (meta.etag) headers['If-Match'] = meta.etag;
      else headers['If-None-Match'] = '*';
      const res = await ms().request(`${FILE}:/content`, {
        method: 'PUT', headers, body: JSON.stringify(store.state),
      });
      if ((res.status === 412 || res.status === 409) && retry) {
        await this.pull();
        return this.push(false);
      }
      if (!res.ok) throw new Error(`OneDrive respondeu com erro ${res.status} ao salvar.`);
      const item = await res.json();
      meta.etag = item.eTag;
      if (store.revision === revision) meta.dirty = false;
      return undefined;
    },

    async refreshTodo() {
      const { todoListId } = store.state.settings;
      if (!todoListId) return;
      store.setTodo(await ms().tasks(todoListId));
    },

    async work() {
      this.setStatus({ busy: true });
      try {
        if (store.isDemo) {
          await this.refreshTodo();
          this.setStatus({ error: null, syncedAt: Date.now() });
          return;
        }
        if (!ms().connected()) return;
        await this.pull();
        if (meta.dirty) await this.push();
        await this.refreshTodo();
        meta.syncedAt = Date.now();
        this.setStatus({ error: null, syncedAt: meta.syncedAt });
      } catch (e) {
        const offline = !navigator.onLine;
        let error = e.message || 'Falha ao sincronizar.';
        if (offline) error = 'Sem internet: mostrando os últimos dados salvos.';
        else if (e.needsLogin) error = 'Sessão Microsoft expirada. Reconecte em Configurações.';
        this.setStatus({ error });
      } finally {
        saveMeta();
        this.setStatus({ busy: false });
      }
    },

    // Só uma sincronização por vez; um pedido durante a execução roda logo em seguida.
    run() {
      if (running) { pendingRun = true; return running; }
      running = this.work().finally(() => {
        running = null;
        if (pendingRun) { pendingRun = false; this.run(); }
      });
      return running;
    },

    hasPending() { return Boolean(meta.dirty); },

    // Ao sair da conta: esquece a versão conhecida, para outra conta começar do zero.
    forget() {
      meta = { etag: null, dirty: false };
      saveMeta();
    },

    // Depois de importar um backup: o arquivo importado passa a valer sobre o do OneDrive.
    async overwriteRemote() {
      if (store.isDemo || !ms().connected()) { meta.dirty = true; saveMeta(); return; }
      const res = await ms().request(`${FILE}:/content`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store.state),
      });
      if (!res.ok) throw new Error(`OneDrive respondeu com erro ${res.status} ao salvar.`);
      const item = await res.json();
      meta.etag = item.eTag;
      meta.dirty = false;
      saveMeta();
    },
  };

  SAM.sync = sync;
})(window.SAM);
