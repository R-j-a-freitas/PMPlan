# Feriados — origem dos dados, correcção de 2026 e revisão anual

Os feriados bloqueiam PMs no motor de conflitos, no gerador automático e no calendário.
Um feriado só se aplica a um hospital quando a sua `locality` casa **à letra** com a do
hospital. Em 30/09/2026 descobriu-se que isto falhava em quase todos os hospitais
espanhóis: foi corrigido na BD e no código, e a lista oficial de 2026 ficou registada
abaixo.

---

## Como um feriado chega a um hospital

| Âmbito | `holidays.locality` | Casa com | Origem |
|---|---|---|---|
| Nacional PT / ES | `null` | `country` do hospital | Nager.Date |
| Regional ES (Comunidade Autónoma) | código ISO, ex. `ES-AN` | `hospitals.locality` | **BOE** (2026); Nager.Date nos anos seguintes |
| Local PT (concelho) | nome do concelho, ex. `Braga` | `hospitals.locality` | regra em `holiday_rules` (`country='PT'`) |
| Local ES (cidade, *fiestas locales*) | nome da cidade, ex. `Vigo` | `hospitals.city` | regra em `holiday_rules` (`country='ES'`) |
| Fecho operacional de zona | `null` + `zone_id` | `zone_id` do hospital | manual |

A página Feriados só mostra localidades com equipamento instalado. Quando uma localidade
com equipamento não tem nenhuma regra, o cartão de regras mostra um aviso.

---

## Porque é que as cidades não apareciam

1. **79 dos 83 hospitais ES tinham a Comunidade Autónoma gravada pelo nome**
   ("Andalucía", "Comunidad de Madrid") em vez do código ("ES-AN", "ES-MD"). A importação
   por Excel gravava a coluna "Localidade" tal como vinha. Por isso nenhum feriado regional
   casava: não apareciam na tabela e **também não bloqueavam PMs**.
2. **Não havia feriados locais das cidades espanholas**, excepto os dois de Vigo,
   introduzidos à mão. O botão de regras só criava regras de PT.
3. **Uma regra nova só chegava ao ano aberto no ecrã.** `useHolidays` saía logo que o ano
   tivesse linhas na BD, e os anos já carregados nunca recebiam as regras criadas depois.
4. **Uma cidade sem feriados não aparecia em lado nenhum**, e a falta passava despercebida.

## O que foi corrigido

**Dados** (via [scripts/actualizar-feriados-es-2026.mjs](../scripts/actualizar-feriados-es-2026.mjs)):

- `hospitals.locality` dos 79 hospitais ES convertido para o código ISO;
- feriados regionais ES de 2026 substituídos pela lista do BOE (`source = 'boe'`);
- 99 regras locais ES para as 49 cidades com hospital, aplicadas a 2026 (os dois feriados
  manuais de Vigo passaram também a regra).

**Código:**

- página Feriados com secção própria "Feriados Locais de Espanha" e cartão de regras ES
  com Adicionar / Editar / Eliminar (Editar também no cartão PT);
- criar, editar ou eliminar uma regra actualiza todos os anos já carregados
  (`holidayStore.syncRuleHolidays`), e ao abrir um ano que já existe na BD são
  acrescentadas as linhas de regras em falta (`useHolidays`);
- as linhas geradas por regra não têm botão Eliminar (voltariam no carregamento seguinte):
  edita-se ou elimina-se a regra;
- a importação de hospitais converte o nome da Comunidade Autónoma para o código
  (`toSpanishRegionCode` em `lib/spanishRegions.ts`), para o problema não voltar.

**PT verificado sem alterações:** os 14 nacionais estão certos, e os concelhos com
equipamento (Braga, Coimbra, Lisboa, Porto, Santa Maria da Feira, Vila Real) já tinham o
feriado municipal correcto.

---

## Importação automática do BOE

Os feriados regionais de Espanha deixaram de depender da Nager.Date, que erra: em 2026
faltavam as passagens para segunda-feira (2/11 e 7/12), o San José em cinco comunidades, e
vinham feriados inexistentes (17/05 na Galiza, 31/05 em Castilla-La Mancha). Uma tarefa
semanal na VPS vai buscá-los à fonte oficial.

**O que faz** ([scripts/sync-boe-holidays.mjs](../scripts/sync-boe-holidays.mjs), às segundas às 08:00):

1. Para o ano corrente e o seguinte, pergunta à BD se o ano já foi importado do BOE. Se
   sim, termina.
2. Percorre o sumário diário do BOE (API de dados abertos), de 1 de Setembro do ano
   anterior até hoje, à procura da resolução "relación de fiestas laborales para el año X".
   A de 2026 saiu a 28/10/2025.
3. Lê a tabela ([scripts/lib/boeHolidays.mjs](../scripts/lib/boeHolidays.mjs)): uma data
   marcada nas 17 comunidades é nacional (continua a vir da Nager.Date), e qualquer outra
   marca é um feriado regional dessa comunidade.
4. Valida (2 a 6 regionais por comunidade, datas do ano certo, códigos conhecidos) e grava
   via `import_boe_regional_holidays` (migração 0025), que volta a validar do lado da BD.
   Substitui os regionais ES do ano vindos da Nager.Date ou de um BOE anterior (`source =
   'boe'`); os manuais ficam.
5. Envia email:
   - **importação feita**: o identificador do BOE e o lembrete para rever as *fiestas
     locales* do ano novo, com a lista das cidades com hospital;
   - **falha** (tabela com forma inesperada, BOE em baixo…): o erro. **Nada é gravado** e o
     que estava na app fica como estava;
   - **resolução não encontrada depois de 15 de Dezembro**: aviso para ir ver ao BOE (a
     publicação atrasou, ou o título mudou).

**Na app**, a secção "Feriados Regionais de Espanha" diz de onde vêm os dados do ano em
vista (BOE ou, provisoriamente, Nager.Date). Depois de uma importação, o cartão das regras
ES mostra o lembrete de rever as *fiestas locales* desse ano.

**As *fiestas locales* continuam manuais.** Não há fonte única: cada câmara publica no
seu boletim provincial. O email e o aviso na app lembram, mas a edição faz-se à mão.

**Credencial.** O mesmo modelo do keep-alive ([KEEP_ALIVE_VPS.md](KEEP_ALIVE_VPS.md)): a
VPS não recebe a `service_role`, recebe um JWT do papel `pmplan_holiday_sync`, que não lê
nem escreve tabela nenhuma e só pode executar três funções:

| Função | Para quê |
|---|---|
| `boe_holidays_imported(ano)` | Saber se o ano já está feito (evita percorrer o BOE todas as semanas) |
| `import_boe_regional_holidays(ano, boe_id, lista)` | Gravar, com validação |
| `log_holiday_sync(ano, estado, boe_id, mensagem)` | Registar "ainda não saiu" ou falha |

Cada tentativa relevante fica em `holiday_sync_runs` (leitura para utilizadores
autenticados; escrita só pelas funções). Verificado: a chave anon da app recebe `permission
denied` na função de importação e na tabela.

### Instalação na VPS

Pré-requisitos: migração `0025_boe_holiday_sync.sql` aplicada (já está) e o utilizador
`pmplan` e `/var/log/pmplan` criados pela instalação do keep-alive.

1. **Token**, numa máquina de confiança (nunca na VPS, que não deve conhecer o JWT secret):

   ```bash
   TOKEN_ROLE=pmplan_holiday_sync \
   SUPABASE_JWT_SECRET='<Project Settings → API → JWT Secret>' \
   SUPABASE_PROJECT_REF='<ref do projecto>' \
   node scripts/mint-heartbeat-token.mjs
   ```

2. **Configuração**:

   ```bash
   sudo cp $REPO/deploy/holidays/boe-holidays.env.example /etc/pmplan/boe-holidays.env
   sudo chown root:root /etc/pmplan/boe-holidays.env
   sudo chmod 600 /etc/pmplan/boe-holidays.env
   sudo nano /etc/pmplan/boe-holidays.env    # URL, anon key, token, Resend
   ```

3. **Unidades**:

   ```bash
   sudo cp $REPO/deploy/holidays/pmplan-boe-holidays.service /etc/systemd/system/
   sudo cp $REPO/deploy/holidays/pmplan-boe-holidays.timer   /etc/systemd/system/
   sudo cp $REPO/deploy/holidays/pmplan-boe-holidays.logrotate /etc/logrotate.d/pmplan-boe-holidays
   sudo systemctl daemon-reload
   ```

   Ajustar `ExecStart` e `WorkingDirectory` se o repositório não estiver em `/opt/pmplan`
   ou o Node não estiver em `/usr/bin/node`.

4. **Teste**, uma vez à mão:

   ```bash
   sudo systemctl start pmplan-boe-holidays.service
   sudo journalctl -u pmplan-boe-holidays.service -n 20 --no-pager
   ```

   Com o 2026 já importado e o BOE de 2027 ainda por sair, o resultado esperado é:

   ```
   … [INFO] boe-holidays: 2026: já importado do BOE — nada a fazer
   … [INFO] boe-holidays: 2027: a procurar a resolução no BOE…
   … [INFO] boe-holidays: 2027: resolução ainda não publicada
   ```

   Se aparecer `a usar SUPABASE_SERVICE_ROLE_KEY`, o token não foi lido.

5. **Activar**:

   ```bash
   sudo systemctl enable --now pmplan-boe-holidays.timer
   systemctl list-timers 'pmplan-*' --no-pager
   ```

### Operação

Correr à mão com argumentos, com o mesmo utilizador e o mesmo ficheiro de ambiente da
unidade (o token não passa pela linha de comandos, onde ficaria visível no `ps`):

```bash
# Ver o que faria, sem gravar nem enviar email
sudo systemd-run --pipe --wait -p User=pmplan -p WorkingDirectory=/opt/pmplan \
  -p EnvironmentFile=/etc/pmplan/boe-holidays.env \
  /usr/bin/node scripts/sync-boe-holidays.mjs --dry-run

# Reimportar um ano (ex: o BOE publicou uma correcção)
sudo systemd-run --pipe --wait -p User=pmplan -p WorkingDirectory=/opt/pmplan \
  -p EnvironmentFile=/etc/pmplan/boe-holidays.env \
  /usr/bin/node scripts/sync-boe-holidays.mjs --year 2027
```

Histórico, no SQL Editor:

```sql
select ran_at, target_year, status, boe_id, rows_count, message
from holiday_sync_runs order by ran_at desc limit 20;
```

**Se o BOE mudar o formato**, o email de falha chega na primeira segunda-feira depois da
publicação. O leitor tem testes com a tabela real de 2026
(`node --test scripts/lib/boeHolidays.test.mjs`): acrescentar a tabela nova como fixture,
ajustar o leitor até os testes passarem, e correr com `--year`.

---

## Revisão anual obrigatória (Espanha)

- **Feriados regionais:** automáticos (secção acima). Basta confirmar que chegou o email
  de importação no fim de Outubro/Novembro.
- **As *fiestas locales* mudam todos os anos.** Cada câmara fixa as suas duas datas
  anualmente. Muitas regras ficaram com a data exacta de 2026 (ex. Pamplona 30/11,
  Benidorm 9 e 10/11, Torrejón 22 e 23/06) e em 2027 vão cair no dia errado. As móveis
  (Corpus, Lunes de San Vicente, Carnaval, Pascua Granada…) já estão como regras relativas
  à Páscoa e acompanham o ano. O procedimento está também na nota do topo da página
  Feriados:
  1. Em Novembro/Dezembro, depois do email da importação do BOE, escolher o ano novo no
     selector "Ano" da página Feriados.
  2. No cartão "Regras dos Feriados Locais de Espanha", abrir o link **Confirmar** de cada
     cidade (calendarioslaborales.com, com a cidade e o ano já preenchidos). Para a
     Catalunha há o [calendário oficial da Generalitat](https://treball.gencat.cat/ca/ambits/relacions_laborals/ci/calendari_laboral/).
  3. Se a data mudou, **Editar**. A alteração vale **a partir do ano escolhido**: a regra
     antiga fica fechada no ano anterior e é criada uma versão nova, por isso as datas dos
     anos anteriores não mudam (migração `0027`, colunas `valid_from`/`valid_to`). Se o
     feriado depende da Páscoa, escolher "Móvel".
  4. **Eliminar** funciona da mesma forma: só a partir do ano escolhido.
  5. Cidades no aviso amarelo "Sem feriados locais definidos" têm hospital mas nenhuma
     regra: acrescentar com **Adicionar regra**, com a cidade escrita como no hospital.
- **Nomes por confirmar:** Jerez, Talavera, Alcázar de San Juan e Mérida têm as datas
  confirmadas mas nomes genéricos.
- **Cidades de hospitais de Madrid:** o Rey Juan Carlos e o Puerta del Sur ficam em
  Móstoles, o Centro de Protonterapia em Pozuelo de Alarcón, mas estão gravados como
  "Madrid" e recebem os feriados de Madrid.
- **Ao criar um hospital ES**, a cidade tem de ficar escrita exactamente como na regra
  (ex. `Cadiz`, `Jaen`, `Castellón`), senão os feriados locais não se aplicam.

---

## Lista oficial do BOE — feriados de 2026

Resolución de 17 de octubre de 2025, de la Dirección General de Trabajo, publicada no BOE
de 28/10/2025: [BOE-A-2025-21667](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-21667).

### Nacionais (toda a Espanha)

| Data | Feriado |
|---|---|
| 01/01 | Año Nuevo |
| 06/01 | Epifanía del Señor |
| 03/04 | Viernes Santo |
| 01/05 | Fiesta del Trabajo |
| 15/08 | Asunción de la Virgen |
| 12/10 | Fiesta Nacional de España |
| 08/12 | Inmaculada Concepción |
| 25/12 | Natividad del Señor |

O 01/11 (Todos los Santos) e o 06/12 (Constitución) calham a um domingo em 2026. Em
várias comunidades passam para a segunda-feira seguinte (ver tabela abaixo).

### Por Comunidade Autónoma (além dos nacionais)

| Comunidade | Código | Feriados 2026 |
|---|---|---|
| Andalucía | ES-AN | 28/02 Día de Andalucía · 02/04 Jueves Santo · 02/11 · 07/12 |
| Aragón | ES-AR | 02/04 Jueves Santo · 23/04 San Jorge / Día de Aragón · 02/11 · 07/12 |
| Principado de Asturias | ES-AS | 02/04 Jueves Santo · 08/09 Día de Asturias · 02/11 · 07/12 |
| Illes Balears | ES-IB | 02/03 Lunes siguiente al Día de les Illes Balears · 02/04 Jueves Santo · 06/04 Lunes de Pascua · 26/12 San Esteban |
| Canarias | ES-CN | 02/04 Jueves Santo · 30/05 Día de Canarias · 02/11 |
| Cantabria | ES-CB | 02/04 Jueves Santo · 28/07 Día de las Instituciones · 15/09 La Bien Aparecida · 07/12 |
| Castilla-La Mancha | ES-CM | 02/04 Jueves Santo · 06/04 Lunes de Pascua · 04/06 Corpus Christi · 02/11 |
| Castilla y León | ES-CL | 02/04 Jueves Santo · 23/04 Fiesta de Castilla y León · 02/11 · 07/12 |
| Cataluña | ES-CT | 06/04 Lunes de Pascua · 24/06 San Juan · 11/09 Fiesta Nacional de Cataluña · 26/12 San Esteban |
| Extremadura | ES-EX | 02/04 Jueves Santo · 08/09 Día de Extremadura · 02/11 · 07/12 |
| Galicia | ES-GA | 19/03 San José · 02/04 Jueves Santo · 24/06 San Juan · 25/07 Santiago Apóstol / Día Nacional de Galicia |
| Comunidad de Madrid | ES-MD | 02/04 Jueves Santo · 02/05 Fiesta de la Comunidad de Madrid · 02/11 · 07/12 |
| Región de Murcia | ES-MC | 19/03 San José · 02/04 Jueves Santo · 09/06 Día de la Región de Murcia · 07/12 |
| Comunidad Foral de Navarra | ES-NC | 19/03 San José · 02/04 Jueves Santo · 06/04 Lunes de Pascua · 02/11 |
| País Vasco | ES-PV | 19/03 San José · 02/04 Jueves Santo · 06/04 Lunes de Pascua · 25/07 Santiago Apóstol |
| La Rioja | ES-RI | 02/04 Jueves Santo · 06/04 Lunes de Pascua · 09/06 Día de La Rioja · 07/12 |
| Comunitat Valenciana | ES-VC | 19/03 San José · 06/04 Lunes de Pascua · 24/06 San Juan · 09/10 Día de la Comunitat Valenciana |
| Ciudad de Ceuta | — | 02/04 Jueves Santo · 27/05 Fiesta del Sacrificio · 02/09 Día de Ceuta |
| Ciudad de Melilla | — | 20/03 Eid Fitr · 02/04 Jueves Santo · 27/05 Fiesta del Sacrificio · 05/08 Nuestra Señora de África · 07/12 |

02/11 = Lunes siguiente a Todos los Santos · 07/12 = Lunes siguiente al Día de la
Constitución. Ceuta e Melilla não têm hospitais no PMPlan e não foram gravadas na BD.

**Notas do BOE:**

1. **Canarias:** feriados por ilha, além dos da comunidade. El Hierro 24/09 · Fuerteventura
   18/09 · Gran Canaria 08/09 (Virgen del Pino) · La Gomera 05/10 · La Palma 05/08 ·
   Lanzarote e La Graciosa 15/09 · Tenerife 02/02 (Virgen de la Candelaria). No PMPlan
   estão como regras locais de Las Palmas de Gran Canaria e de Santa Cruz de Tenerife.
2. **Cataluña:** no território de Arán, o 26/12 (Sant Esteve) é substituído pelo 17/06
   (Fiesta de Arán).

---

## Feriados locais ES de 2026 (regras em `holiday_rules`)

Duas *fiestas locales* por cidade (Palma de Mallorca tem uma; as cidades das Canárias
têm também o feriado de ilha). "Páscoa ±N" = regra móvel relativa ao Domingo de Páscoa
(05/04/2026).

| Cidade | Feriados 2026 |
|---|---|
| Albacete | 24/06 San Juan · 08/09 Virgen de Los Llanos |
| Alcazar de San Juan | 08/09 Feria y Fiestas · 28/12 Fiesta local de diciembre |
| Algeciras | 24/06 Feria Real (San Juan) · 16/07 Virgen del Carmen |
| Alzira | 13/04 San Vicente Ferrer (Páscoa +8) · 23/07 San Bernardo |
| Badajoz | 17/02 Martes de Carnaval (Páscoa −47) · 24/06 San Juan |
| Barakaldo | 16/07 Virgen del Carmen · 31/07 San Ignacio de Loyola |
| Barcelona | 25/05 Pascua Granada (Páscoa +50) · 24/09 La Mercè |
| Benidorm | 09/11 e 10/11 Fiestas Patronales |
| Cáceres | 23/04 San Jorge · 29/05 Feria de San Fernando |
| Cadiz | 16/02 Lunes de Carnaval (Páscoa −48) · 07/10 Virgen del Rosario |
| Castellón | 09/03 Lunes de Magdalena (Páscoa −27) · 29/06 San Pedro |
| Ciudad Real | 25/05 Virgen de Alarcos (Páscoa +50) · 22/08 Octava de la Virgen |
| Cordoba | 08/09 Virgen de la Fuensanta · 24/10 San Rafael |
| Cuenca | 01/06 Virgen de la Luz · 21/09 San Mateo |
| Elche | 13/04 Lunes de San Vicente (Páscoa +8) · 29/12 Venida de la Virgen |
| Gandia | 13/04 Lunes de San Vicente (Páscoa +8) · 05/10 Sant Francesc de Borja |
| Granada | 02/01 Toma de Granada · 04/06 Corpus Christi (Páscoa +60) |
| Guadalajara | 08/09 Virgen de la Antigua · 18/09 Viernes de Ferias |
| Huelva | 03/08 Fiesta Colombina · 08/09 Virgen de la Cinta |
| Huesca | 22/01 San Vicente · 10/08 San Lorenzo |
| Jaen | 11/06 Virgen de la Capilla · 25/11 Santa Catalina |
| Jerez | 11/05 Feria del Caballo · 24/09 Fiestas de Otoño |
| L'Hospitalet de Llobregat | 25/05 Pascua Granada (Páscoa +50) · 24/09 La Mercè |
| Las Palmas de Gran Canaria | 17/02 Martes de Carnaval (Páscoa −47) · 24/06 San Juan · 08/09 Virgen del Pino (ilha) |
| Logroño | 11/06 San Bernabé · 21/09 San Mateo |
| Madrid | 15/05 San Isidro · 09/11 La Almudena |
| Malaga | 19/08 Toma de Málaga · 08/09 Virgen de la Victoria |
| Manresa | 21/02 Festa de la Llum · 31/08 Festa Major |
| Merida | 21/05 Fiesta local de mayo · 10/12 Santa Eulalia |
| Murcia | 07/04 Bando de la Huerta (Páscoa +2) · 15/09 Romería de la Fuensanta |
| Oviedo | 26/05 Martes de Campo (Páscoa +51) · 21/09 San Mateo |
| Palma de Mallorca | 20/01 San Sebastián |
| Pamplona | 30/11 San Saturnino (lunes siguiente) · 03/12 Día de Navarra |
| Plasencia | 11/06 e 12/06 Feria de San Bernabé |
| Reus | 29/06 Sant Pere · 25/09 Mare de Déu de Misericòrdia |
| Salamanca | 12/06 San Juan de Sahagún · 08/09 Virgen de la Vega |
| Santa Cruz de Tenerife | 02/02 Virgen de la Candelaria (ilha) · 17/02 Martes de Carnaval (Páscoa −47) · 04/05 Lunes siguiente a la Fiesta de la Cruz |
| Santander | 25/05 Virgen del Mar (Páscoa +50) · 25/07 Santiago Apóstol |
| Sevilla | 22/04 Miércoles de Feria (Páscoa +17) · 04/06 Corpus Christi (Páscoa +60) |
| Talavera | 15/05 San Isidro · 08/09 Fiesta local de septiembre |
| Tarragona | 19/08 Sant Magí · 23/09 Santa Tecla |
| Terrassa | 02/04 Dijous Sant (Páscoa −3) · 06/07 Festa Major |
| Toledo | 23/01 San Ildefonso · 26/11 Aniversario Ciudad Patrimonio de la Humanidad |
| Torrejón de Ardoz | 22/06 e 23/06 Fiestas Populares |
| Torrevieja | 13/04 Lunes de San Vicente (Páscoa +8) · 16/07 Virgen del Carmen |
| Valencia | 22/01 San Vicente Mártir · 13/04 San Vicente Ferrer (Páscoa +8) |
| Vigo | 28/03 Festa da Reconquista · 17/08 San Roque (día seguinte) |
| Vitoria | 28/04 San Prudencio · 05/08 Virgen Blanca |
| Zaragoza | 29/01 San Valero · 05/03 Cincomarzada |

**Fontes:**
[calendário das capitais de província 2026](https://www.miquelrius.com/wp-content/uploads/2026/01/Dias-festivos-en-2026-en-las-capitales-de-provincia.pdf) ·
[festas locais da Catalunha (DOGC 17/12/2025)](https://www.laboral-social.com/sites/laboral-social.com/files/fiestas-locales-cataluna-2026.pdf) ·
[Comunitat Valenciana](https://valenciaplaza.com/valenciaplaza/comunitat-valenciana1/calendario-laboral-2026-municipios-comunitat-valenciana) ·
[Junta de Extremadura](https://www.juntaex.es/w/20251023-la-junta-de-extremadura-publica-el-calendario-laboral-oficial-de-festivos-locales) ·
[Torrejón de Ardoz](https://www.ayto-torrejon.es/noticia/nota-de-prensa/el-22-y-23-de-junio-seran-los-dias-festivos-de-torrejon-de-ardoz-en-2026) ·
[Talavera](https://www.encastillalamancha.es/castilla-la-mancha-cat/talavera/ya-se-conocen-los-dos-festivos-locales-que-habra-en-talavera-en-2026/) ·
[Alcázar de San Juan](https://calendarioslaborales.com/calendario-laboral-alcazar-de-san-juan-2026.htm) ·
[Algeciras](https://www.8directo.com/algeciras/este-es-calendario-fiestas-locales-algeciras-en-2026_625752_102.html) ·
[Jerez](https://calendariosnacionales.com/es/festivos/and/cadiz/jerez-de-la-frontera/) ·
[Barakaldo](https://calendariosnacionales.com/es/festivos/eus/vizcaya/barakaldo/) ·
[Pamplona](https://sedeelectronica.pamplona.es/Informacion.aspx?idInfo=251521VA++&cm=N)
