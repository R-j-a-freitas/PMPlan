# PMPlan

Planeamento de manutenções preventivas (PM) de equipamento de radioterapia.
React + TypeScript + Vite, com Supabase como base de dados.

---

## Correr e fazer deploy

Um único script por sistema. Sem opções, sem passos manuais: corre-se e no fim a
aplicação está a servir.

| Linux / macOS | Windows |
|---|---|
| `./deploy.sh` | `.\deploy.ps1` |

Cada execução faz, por esta ordem:

1. **Actualiza** a partir do GitHub (`git pull --ff-only`);
2. **Instala** dependências, se faltarem ou estiverem incompletas;
3. **Build** de produção (`npm run build`);
4. **Arranca** o servidor e imprime o endereço.

Para mudar de porta (8080 por omissão): `PORT=9000 ./deploy.sh` ou
`.\deploy.ps1 -Port 9000`.

O passo 1 é *best-effort*: sem rede, sem remote, ou com alterações locais por commitar, o
script avisa e segue com o código que está em disco. Actualizar é uma conveniência, não
deve ser aquilo que impede a aplicação de arrancar. Os passos 2–4 são o contrário: qualquer
falha aborta, para nunca servir em cima de um build falhado.

O script limpa a instância anterior que tenha ficado a segurar a porta. Se quem lá estiver
não for o PMPlan, pára e diz qual é o processo em vez de matar software alheio. O momento
em que o faz difere por sistema, e não é arbitrário: em **Windows** tem de ser antes do
build, porque o `serve` mantém abertos os ficheiros de `dist/` e o Vite começa por esvaziar
essa pasta — com o servidor antigo vivo o build falha com `EPERM`. Em **Linux** apagar
ficheiros abertos não incomoda ninguém, por isso a paragem fica para o fim e o site
continua a servir a versão antiga enquanto o build corre.

Requisitos: Node.js e um `.env` preenchido. Se não existir `.env`, o script cria-o a partir
do `.env.example` e pára a pedir as chaves — arrancar com valores de exemplo daria uma
aplicação que abre mas não autentica.

**Onde fica o processo:** em Linux, se o `pm2` estiver instalado (o caso da VPS) o servidor
fica sob a gestão dele e sobrevive ao logout; caso contrário fica em primeiro plano, com
`Ctrl+C` a parar. Em Windows fica sempre em primeiro plano — para produção a sério, registar
como serviço (NSSM ou equivalente) em vez de depender do script.

**Desenvolvimento** (Vite com hot reload) continua a ser `npm run dev` — o `deploy` serve
sempre o build de produção.

Se o PowerShell recusar correr o `.ps1` (política de execução):
`powershell -ExecutionPolicy Bypass -File .\deploy.ps1`

---

## Emails

Propostas, cartas de assinatura e o arquivo dos documentos assinados devolvidos pelos
clientes passam todos pela Resend (domínio `pmplan.net`).

- Quem recebe o quê, configuração da Resend e do DNS: **[DOCS/EMAILS_E_RESEND.md](DOCS/EMAILS_E_RESEND.md)**
- Arquivo dos documentos assinados: **[DOCS/DOCUMENTOS_ASSINADOS.md](DOCS/DOCUMENTOS_ASSINADOS.md)**
- Braquiterapia aprovada à parte do resto do hospital: **[DOCS/APROVACOES_BRAQUITERAPIA.md](DOCS/APROVACOES_BRAQUITERAPIA.md)**

---

## Continuidade da base de dados

O projecto Supabase está em **free tier**, que é pausado ao fim de **7 dias sem
actividade de base de dados**. A aplicação não faz polling nem tem subscrições realtime:
sem alguém com o browser aberto, a actividade é zero. Férias ou época baixa de planeamento
chegam para o projecto ser pausado.

Três mecanismos, deliberadamente independentes:

| | Quando | O quê |
|---|---|---|
| **Keep-alive da VPS** | diário, 04:00–07:00 UTC | Escreve em `system_heartbeat`, conta PMs, purga. Mecanismo **principal**. |
| **Keep-alive no GitHub Actions** | diário, 16:00 UTC | O mesmo script, `source=github_actions`. Rede de segurança. |
| **Verificador de falhas** | VPS 10:00 · GitHub 16:00 | Alerta por email (Resend) se o heartbeat passar das 48h, ou se o Supabase não responder. |
| **Backup** | diário, 02:00–03:00 UTC | `pg_dump` para a VPS. Retenção 7 diários / 4 semanais / 3 mensais. |

Instalação e operação: **[DOCS/KEEP_ALIVE_VPS.md](DOCS/KEEP_ALIVE_VPS.md)**.
Recuperação de desastre: **[DOCS/DISASTER_RECOVERY.md](DOCS/DISASTER_RECOVERY.md)**.

O keep-alive evita a pausa; o backup protege do que a apaga. São problemas diferentes e
nenhum dos dois substitui o outro — um projecto sempre activo com um `DELETE` sem `WHERE`
fica igualmente sem dados.

### Acções manuais (ecrã *Saúde do sistema*, só admin)

Os quatro mecanismos acima são automáticos e correm fora do browser. O ecrã de saúde
acrescenta-lhes dois botões, para os momentos em que não se quer esperar pela madrugada
seguinte — antes de férias, antes de uma migração arriscada, ou com a VPS em baixo:

| Botão | O que faz | O que **não** faz |
|---|---|---|
| **Verificar agora** | Escreve em `system_heartbeat` com `source=manual`, conta PMs e purga — as mesmas etapas do keep-alive. Adia mesmo a contagem dos 7 dias. | Não põe verde o semáforo global: este só conta as origens automáticas, para um clique não mascarar uma VPS morta. |
| **Descarregar cópia** | Exporta as linhas de todas as tabelas de `public` (mais a lista de contas) num JSON gravado no computador de quem carrega, e regista-o em `system_backups` com `source=manual`. | Não leva schema, políticas de RLS, funções nem palavras-passe. **Não substitui o `pg_dump` da VPS** — é a última linha de defesa, para o caso de o projecto Supabase se perder por inteiro. |

Ambos passam por funções `security definer` que recusam quem não for admin (migração
`0018_manual_health_actions.sql`); a aplicação continua sem privilégio de escrita directa
nas duas tabelas de continuidade. O registo de uma cópia manual nunca se pode fazer passar
por uma execução da VPS — a origem é fixada dentro da função, não recebida do browser.

### Limitação conhecida do GitHub Actions

**O GitHub desactiva automaticamente os schedules em repositórios sem commits há 60
dias.** Envia um aviso por email antes de o fazer, mas o efeito prático é que um projecto
estável — sem alterações porque está a funcionar bem — perde o workflow agendado
exactamente quando deixa de haver quem esteja a olhar.

Isto não é contornável por configuração. É a razão pela qual:

- o keep-alive da **VPS é o mecanismo principal**, e o GitHub Actions a redundância, não
  o contrário;
- o **verificador corre também na VPS**, e não apenas no GitHub Actions.

Se o repositório ficar meses sem commits, verificar o separador *Actions* de vez em
quando, ou reactivar o workflow com um `workflow_dispatch` manual (o que repõe a
contagem).

O GitHub também não garante pontualidade nos schedules — atrasos de dezenas de minutos em
horas de pico são normais. Irrelevante numa janela de 7 dias.

### Quem vigia o vigilante

O verificador quebra a dependência circular óbvia (perguntar ao Supabase se o Supabase
está vivo) de três maneiras: não conseguir responder à pergunta é tratado como alarme e
não como silêncio; o email sai directamente pela API do Resend, sem passar pelas Edge
Functions, que estariam mortas no cenário que interessa reportar; e a verificação corre em
dois sítios que não dependem um do outro.

Fica um risco residual que nenhum código resolve: **se a VPS e o GitHub Actions falharem
ao mesmo tempo, ninguém verifica e ninguém alerta** — e a ausência de emails é
indistinguível de estar tudo bem. A mitigação é humana: se passar mais de uma semana sem
qualquer sinal, confirmar à mão no dashboard. Uma alternativa técnica seria um
*dead man's switch* externo (healthchecks.io ou equivalente), que alerta quando **deixa**
de receber sinal; não está implementado, por ser mais uma dependência de terceiros.

### Se o projecto for pausado apesar de tudo isto

1. **Restaurar** em <https://supabase.com/dashboard> → o projecto aparece marcado como
   *Paused* → **Restore project**. Demora alguns minutos. Nenhum script consegue reanimar
   um projecto pausado a partir de fora — a restauração é obrigatoriamente manual.
2. Confirmar que os dados voltaram: a aplicação deve carregar o calendário normalmente.
3. **Descobrir porque falhou**, antes de dar o assunto por encerrado:
   - VPS: `systemctl list-timers 'pmplan-*'` e
     `journalctl -u pmplan-keepalive.service --since "14 days ago"`
   - GitHub: separador *Actions* → o workflow foi desactivado por inactividade?
   - `/var/log/pmplan/keep-alive.log` e os ficheiros rodados
4. Se o token do heartbeat tiver expirado (validade de 5 anos), cunhar um novo — ver
   secção *Gerar o token* em [DOCS/KEEP_ALIVE_VPS.md](DOCS/KEEP_ALIVE_VPS.md).

---

## Notas do template Vite

O que se segue vem do template inicial e ainda não foi substituído por documentação do
projecto.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
