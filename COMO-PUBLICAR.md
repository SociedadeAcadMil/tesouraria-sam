# Tesouraria SAM: como publicar

São três etapas, feitas uma única vez e sem custo: publicar a página, registrar o app na Microsoft e colar o ID no arquivo de configuração. Depois disso, a cadete só precisa do link.

Para ver o app antes de tudo isso, abra `index.html` no computador e clique em **Abrir a demonstração**.

## 1. Publicar a página (GitHub Pages)

1. Crie uma conta em [github.com](https://github.com), se ainda não tiver.
2. Crie um repositório público, por exemplo `tesouraria-sam`.
3. Em **Add file > Upload files**, envie todo o conteúdo desta pasta. O arquivo `serve.ps1` e a pasta `.claude` são opcionais.
4. Em **Settings > Pages**, escolha **Deploy from a branch**, a branch `main` e a pasta `/ (root)`.
5. Aguarde alguns minutos. O endereço será parecido com `https://SEU-USUARIO.github.io/tesouraria-sam/`.

O repositório público expõe apenas o código. Os dados financeiros **não** ficam nele: ficam no aparelho e no OneDrive da tesoureira.

## 2. Registrar o app na Microsoft

1. Entre em [Registros de aplicativo](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) e clique em **Novo registro**.
2. Em **Nome**, use `Tesouraria SAM`. A pasta no OneDrive recebe esse nome.
3. Em **Tipos de conta**, escolha **Somente contas pessoais da Microsoft**.
4. Em **URI de redirecionamento**, escolha a plataforma **Aplicativo de página única (SPA)** e cole o endereço exato da etapa 1, com a barra no final.
5. Clique em **Registrar** e copie o **ID do aplicativo (cliente)**.
6. Em **Permissões de API > Adicionar uma permissão > Microsoft Graph > Permissões delegadas**, adicione `Tasks.Read`, `Files.ReadWrite.AppFolder` e `User.Read`.

Os nomes das opções podem variar um pouco no portal. Se ele recusar o registro alegando que a conta pessoal não tem diretório, a Microsoft está exigindo um locatário para essa conta: será preciso criar um antes de seguir.

## 3. Colar o ID no app

No GitHub, abra `js/config.js`, clique no lápis para editar e preencha:

```js
microsoftClientId: 'COLE-O-ID-AQUI',
```

Salve com **Commit changes**. O ID não é uma senha, e pode ficar visível.

## Primeiro uso da cadete

1. Abrir o link e tocar em **Conectar conta Microsoft**. No primeiro acesso, a Microsoft pede autorização e pode avisar que o app não é de um editor verificado, o que é normal em apps próprios.
2. Informar o saldo atual da conta e a data desse saldo.
3. Escolher a lista de pagamentos do To Do.
4. Instalar no celular: **Adicionar à tela inicial** no menu do navegador.

## Regras do saldo

**Saldo = saldo inicial + entradas − pagamentos marcados no To Do depois da data do saldo inicial.**

- **Formato da lista:** uma tarefa por dia, com a data no título (`09/11`, `DIA 24/06` ou `29/06 (STONE)`), e cada pagamento como uma etapa, com o valor no começo ou no fim: `2.333,23 - Salário Ruth` ou `padasam - 1078,60`.
- **Quando desconta:** a etapa marcada, ou a tarefa inteira concluída, desconta do saldo na data do título. Etapas não marcadas aparecem em **A pagar**.
- **Data de corte:** só contam pagamentos com data igual ou posterior à do saldo inicial. Um item da tarefa `08/11` marcado em 09/11 vale como pagamento de 08/11.
- **Tarefas com "pendente" no título** guardam lembretes e são sempre ignoradas.
- **Tarefa sem etapas** vale como um pagamento só, com o valor no título, como `Pagar gráfica - R$ 150,00`.
- **Sem valor claro**, como `cookie (312) 28/10 + (540) 29/10` ou `7,362,70 - Impressões`, o item fica fora do saldo e aparece em **Precisa de atenção**, até ser corrigido no To Do. Se não for pagamento, use **Não é pagamento**.
- **Checklist de gastos fixos, pagamentos de projeto e orçamento não alteram o saldo.** Assim, um pagamento nunca é descontado duas vezes.
- **Reservado a projetos** é o que foi recolhido e ainda não foi pago ao fornecedor. **Livre para uso** é o saldo sem essa reserva.

## Passagem de função

Os dados ficam no OneDrive da tesoureira atual. Na troca, ela usa **Configurações > Exportar dados** e entrega o arquivo à próxima, que o abre em **Importar dados** com a própria conta. Depois disso, a nova tesoureira precisa escolher a lista do To Do dela e atualizar o saldo inicial, porque as tarefas da tesoureira anterior deixam de ser lidas.

O registro da etapa 2 fica na conta de quem o criou. Se essa conta for encerrada, o login do app para de funcionar, e será preciso repetir as etapas 2 e 3.
