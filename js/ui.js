// Navegação, formulários em janela, avisos e auxiliares de desenho das telas.
(function (SAM) {
  const { html, store } = SAM;
  SAM.views = {};
  SAM.actions = {};
  SAM.changes = {};

  const openKeys = new Set();
  const $ = (sel) => document.querySelector(sel);

  const ui = {
    tab: 'inicio',
    month: SAM.monthOf(SAM.today()),

    render() {
      const view = $('#view');
      const activeId = document.activeElement && document.activeElement.id;
      view.innerHTML = SAM.views[this.tab]().s;
      document.querySelectorAll('.tab').forEach((t) => {
        if (t.dataset.tab === this.tab) t.setAttribute('aria-current', 'page');
        else t.removeAttribute('aria-current');
      });
      if (activeId) {
        const again = document.getElementById(activeId);
        if (again && view.contains(again)) again.focus();
      }
      this.renderStatus();
    },

    go(tab, { push = true } = {}) {
      this.tab = tab;
      if (push) history.pushState({ tab }, '');
      this.render();
      window.scrollTo(0, 0);
    },

    renderStatus() {
      const line = $('#status-line');
      const button = $('[data-act="refresh"]');
      if (!line) return;
      const { busy, error, syncedAt } = SAM.sync.status;
      button.classList.toggle('is-busy', Boolean(busy));
      line.classList.toggle('is-bad', Boolean(error));
      if (busy) line.textContent = 'Atualizando…';
      else if (error) line.textContent = error;
      else if (!SAM.ms.connected()) line.textContent = 'Microsoft não conectada';
      else if (syncedAt) line.textContent = `Atualizado em ${SAM.fmtStamp(syncedAt)}`;
      else line.textContent = 'Conectado';
    },

    toast(message) {
      const el = $('#toast');
      el.textContent = message;
      el.hidden = false;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
    },

    bar(percent, tone = '') {
      const width = Math.max(0, Math.min(100, percent));
      return html`<div class="bar ${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width}"><span style="width:${width}%"></span></div>`;
    },

    // <details> que continua aberto quando a tela é redesenhada.
    isOpen(key) { return openKeys.has(key) ? html`open` : ''; },

    monthNav() {
      return html`<div class="month-nav">
        <button type="button" class="icon-btn small" data-act="month" data-delta="-1" aria-label="Mês anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <strong>${SAM.monthLabel(this.month)}</strong>
        <button type="button" class="icon-btn small" data-act="month" data-delta="1" aria-label="Próximo mês"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>`;
    },

    // Abre um formulário e devolve os valores, ou null se for cancelado.
    form({ title, intro, fields, submitLabel = 'Salvar', extra, validate }) {
      const modal = $('#modal');
      const inputFor = (f) => {
        const value = f.type === 'money' && f.value != null
          ? (f.value / 100).toFixed(2).replace('.', ',')
          : (f.value == null ? '' : f.value);
        const id = `f-${f.name}`;
        if (f.type === 'select') {
          return html`<select id="${id}" name="${f.name}">${f.options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(value) ? html`selected` : ''}>${o.label}</option>`)}</select>`;
        }
        if (f.type === 'textarea') return html`<textarea id="${id}" name="${f.name}">${value}</textarea>`;
        if (f.type === 'money') return html`<input id="${id}" name="${f.name}" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${value}">`;
        if (f.type === 'number') return html`<input id="${id}" name="${f.name}" type="number" inputmode="numeric" min="${f.min}" max="${f.max}" value="${value}">`;
        return html`<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${value}" autocomplete="off">`;
      };
      const fieldHtml = (f) => (f.type === 'checkbox'
        ? html`<div class="field is-check"><input id="f-${f.name}" name="${f.name}" type="checkbox" ${f.value ? html`checked` : ''}><label for="f-${f.name}">${f.label}</label></div>`
        : html`<div class="field"><label for="f-${f.name}">${f.label}</label>${inputFor(f)}${f.hint ? html`<span class="hint">${f.hint}</span>` : ''}<span class="field-error" data-error="${f.name}" hidden></span></div>`);

      modal.innerHTML = html`<form novalidate>
        <h2>${title}</h2>
        ${intro ? html`<p class="hint">${intro}</p>` : ''}
        ${fields.map(fieldHtml)}
        <p class="field-error" data-error="_form" hidden></p>
        <div class="modal-actions">
          ${extra ? html`<button type="button" class="btn btn-danger" data-extra>${extra.label}</button><span class="spacer"></span>` : ''}
          <button type="button" class="btn" data-cancel>Cancelar</button>
          <button type="submit" class="btn btn-primary">${submitLabel}</button>
        </div>
      </form>`.s;

      return new Promise((resolve) => {
        const form = modal.querySelector('form');
        const close = (result) => { modal.close(); resolve(result); };
        const showError = (name, message) => {
          const el = modal.querySelector(`[data-error="${name}"]`);
          el.textContent = message;
          el.hidden = !message;
        };
        modal.querySelector('[data-cancel]').onclick = () => close(null);
        modal.oncancel = (e) => { e.preventDefault(); close(null); };
        if (extra) {
          modal.querySelector('[data-extra]').onclick = () => { close(null); extra.onClick(); };
        }
        form.onsubmit = (e) => {
          e.preventDefault();
          const values = {};
          let ok = true;
          fields.forEach((f) => {
            const input = form.elements[f.name];
            let message = '';
            let value = f.type === 'checkbox' ? input.checked : input.value.trim();
            if (f.type === 'money') {
              const cents = SAM.parseMoneyInput(value);
              if (value === '') {
                if (f.required) message = 'Informe o valor.';
                value = f.required ? null : 0;
              } else if (cents === null) {
                message = 'Valor inválido. Exemplo: 1.250,50';
              } else if (cents === 0 && f.positive) {
                message = 'O valor precisa ser maior que zero.';
              } else {
                value = cents;
              }
            } else if (f.type === 'number') {
              const n = Number(value);
              if (!Number.isInteger(n) || n < f.min || n > f.max) message = `Informe um número de ${f.min} a ${f.max}.`;
              value = n;
            } else if (f.required && !value) {
              message = 'Campo obrigatório.';
            }
            if (f.type !== 'checkbox') showError(f.name, message);
            if (message) ok = false;
            values[f.name] = value;
          });
          const formError = ok && validate ? validate(values) : '';
          showError('_form', formError || '');
          if (ok && !formError) close(values);
        };
        modal.showModal();
      });
    },

    confirm({ title, message, confirmLabel = 'Confirmar', danger = false }) {
      const modal = $('#modal');
      modal.innerHTML = html`<div class="modal-body">
        <h2>${title}</h2>
        <p>${message}</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-cancel>Cancelar</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmLabel}</button>
        </div>
      </div>`.s;
      return new Promise((resolve) => {
        const close = (result) => { modal.close(); resolve(result); };
        modal.querySelector('[data-cancel]').onclick = () => close(false);
        modal.querySelector('[data-ok]').onclick = () => close(true);
        modal.oncancel = (e) => { e.preventDefault(); close(false); };
        modal.showModal();
      });
    },
  };

  // ---------- Eventos ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = SAM.actions[el.dataset.act];
    if (fn) fn(el.dataset, el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = SAM.changes[el.dataset.change];
    if (fn) fn(el.dataset, el, e);
  });
  // "toggle" não se propaga: é preciso escutar na fase de captura.
  document.addEventListener('toggle', (e) => {
    const key = e.target.dataset && e.target.dataset.key;
    if (!key) return;
    if (e.target.open) openKeys.add(key); else openKeys.delete(key);
  }, true);

  SAM.actions.go = (d) => ui.go(d.tab);
  SAM.actions.refresh = () => SAM.sync.run();
  SAM.actions.month = (d) => { ui.month = SAM.addMonths(ui.month, Number(d.delta)); ui.render(); };

  store.onChange(() => { if (document.getElementById('view')) ui.render(); });
  SAM.ui = ui;
})(window.SAM);
