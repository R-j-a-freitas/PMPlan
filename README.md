# PMPlan

Planeamento de manutenções preventivas (PM) de equipamento de radioterapia.
React + TypeScript + Vite, com Supabase como base de dados.

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

Instalação e operação: **[DOCS/KEEP_ALIVE_VPS.md](DOCS/KEEP_ALIVE_VPS.md)**.

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
