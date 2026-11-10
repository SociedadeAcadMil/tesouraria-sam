// Modo demonstração (index.html?demo=1): dados fictícios e um To Do simulado,
// para conhecer o app sem conta Microsoft. Não grava nada no OneDrive.
(function (SAM) {
  const { store, ms } = SAM;
  if (!store.isDemo) return;

  const today = SAM.today();
  const month = SAM.monthOf(today);
  const prev = SAM.addMonths(month, -1);
  const day = (n) => SAM.dueDate(month, n);
  const clampPast = (n) => { const d = day(n); return d > today ? today : d; };

  const rawTasks = [
    ['t1', 'Pagar gráfica (banners) - R$ 180,00', day(2)],
    ['t2', 'Conta de internet da sala - R$ 99,90', day(3)],
    ['t3', 'Material de escritório - R$ 64,50', day(4)],
    ['t4', 'Sinal das camisetas da turma - R$ 900,00', day(5)],
    ['t5', 'Lanche da reunião - R$ 120,00', `${prev}-20`],
    ['t6', 'Som para o evento de fim de ano - R$ 650,00', null],
    ['t7', 'Restante das camisetas - R$ 1.200,00', null],
    ['t8', 'Comprar 3 faixas para a formatura', null],
  ].map(([id, title, completed]) => ({
    id,
    title,
    status: completed ? 'completed' : 'notStarted',
    completedDateTime: completed ? { dateTime: `${completed > today ? today : completed}T00:00:00.0000000`, timeZone: 'UTC' } : undefined,
  }));

  ms.configured = () => true;
  ms.connected = () => true;
  ms.account = { username: 'conta de demonstração' };
  ms.init = async () => {};
  ms.signIn = async () => SAM.ui.toast('Na demonstração não há login.');
  ms.signOut = async () => SAM.ui.toast('Na demonstração não há login.');
  ms.lists = async () => [{ id: 'demo', displayName: 'Pagamentos SAM' }, { id: 'outra', displayName: 'Tarefas' }];
  ms.tasks = async () => rawTasks.flatMap(ms.toPayments);

  const now = Date.now();
  const rec = (fields) => ({ id: SAM.uid(), updatedAt: now, ...fields });
  const camisetasId = 'demo-camisetas';
  const entry1 = rec({ desc: 'Mensalidades da turma', category: 'Mensalidade', cents: 240000, date: clampPast(1) });
  const receiptEntry = rec({ desc: 'Camisetas da turma: 1ª parcela', category: 'Recolhimento', cents: 180000, date: clampPast(3), projectId: camisetasId, receiptId: 'r1' });

  store.state = {
    version: 1,
    settings: { updatedAt: now, initialCents: 415000, initialDate: `${prev}-01`, todoListId: 'demo', todoListName: 'Pagamentos SAM' },
    entries: [entry1, receiptEntry, rec({ desc: 'Vendas da cantina', category: 'Faturamento de vendas', cents: 120000, date: clampPast(4) })],
    fixed: [
      rec({ name: 'Internet da sala', cents: 9990, dueDay: 5, startMonth: prev, checks: { [month]: { paidOn: clampPast(3) } } }),
      rec({ name: 'Assinatura do Canva', cents: 3500, dueDay: 8, startMonth: prev, checks: {} }),
      rec({ name: 'Taxa da conta bancária', cents: 2490, dueDay: 15, startMonth: prev, checks: {} }),
      rec({ name: 'Manutenção do site', cents: 4500, dueDay: 28, startMonth: prev, checks: {} }),
    ],
    projects: [
      {
        id: camisetasId, updatedAt: now, name: 'Camisetas da turma', notes: '80 unidades', deadline: day(28),
        targetCents: 240000, costCents: 210000,
        receipts: [{ id: 'r1', cents: 180000, date: clampPast(3), note: '1ª parcela', entryId: receiptEntry.id }],
        payments: [{ id: 'p1', cents: 90000, date: clampPast(5), note: 'Sinal' }],
      },
      {
        id: 'demo-evento', updatedAt: now, name: 'Evento de fim de ano', notes: '', deadline: SAM.dueDate(SAM.addMonths(month, 1), 12),
        targetCents: 500000, costCents: 450000, receipts: [], payments: [],
      },
    ],
    budgets: [{
      id: `budget-${month}`, month, updatedAt: now, totalCents: 150000,
      sectors: [
        { id: 's1', name: 'Eventos', plannedCents: 60000, expenses: [{ id: 'e1', desc: 'Pagar gráfica (banners)', cents: 18000, date: clampPast(2), taskId: 't1' }] },
        { id: 's2', name: 'Comunicação', plannedCents: 40000, expenses: [{ id: 'e2', desc: 'Impressões extras', cents: 43000, date: clampPast(4) }] },
        { id: 's3', name: 'Administrativo', plannedCents: 30000, expenses: [] },
      ],
    }],
    ignoredTasks: {},
    deleted: {},
    taskCategories: {
      t1: { cat: 'sem-contrapartida', at: now },
      t4: { cat: 'sem-lucro', at: now },
    },
  };
  store.setTodo(rawTasks.flatMap(ms.toPayments));
})(window.SAM);
