// Prepara os ficheiros de importação a partir da lista bruta que veio da Elekta
// (DOCS/XLS/Contactos_ES.xlsx).
//
// Uso: node scripts/preparar-contactos-importacao.mjs
// Produz dois ficheiros, cada um com as colunas que o importador da app lê:
//   DOCS/XLS/contactos-importacao-ES.xlsx  → página Contactos → Importar
//   DOCS/XLS/hospitais-importacao-ES.xlsx  → página Hospitais → Importar
//
// NÃO escreve nada na base de dados — só a lê, para saber que hospitais já existem.
// Voltar a correr depois de carregar as PMs: entram hospitais novos e passam a casar mais
// linhas.
//
// O que o script resolve, e que não se resolve à mão em 161 linhas:
//   • uma linha por PESSOA — na origem há células com dois e três emails juntos
//     ("picon@iconcologia.net, fpino@iconcologia.net") e os nomes correspondentes na
//     célula ao lado, separados de maneira diferente (";", ",", "/");
//   • emparelha nome↔email pelo conteúdo do endereço e não pela ordem (em
//     "Alejandro García-Romero; Pedro Ruiz Manzano; Sheila Calvo Carrillo" com
//     "agarciarom@…; scalvoca@…; pruizm@…" a ordem está trocada), e marca para revisão
//     o que não conseguiu emparelhar com confiança;
//   • limpa o lixo de copy-paste: emails com ponto final a mais, ">" perdidos, tabs,
//     "Nome <email>" dentro da célula do nome;
//   • funde as duas linhas de cada hospital (LINACS e BRAQUI) numa só pessoa quando é a
//     mesma, e só separa por via quando o interlocutor é mesmo diferente — é isso que
//     alimenta hospital_contacts.approval_track (migração 0021);
//   • assinala os ElektaID repetidos em hospitais diferentes e deixa a célula vazia, para
//     a importação não rebentar contra o índice único de hospitals.elekta_id.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

for (const line of readFileSync('.env.service-role', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.service-role.');
  process.exit(1);
}

const ORIGEM = 'DOCS/XLS/Contactos_ES.xlsx';
const DESTINO_CONTACTOS = 'DOCS/XLS/contactos-importacao-ES.xlsx';
const DESTINO_HOSPITAIS = 'DOCS/XLS/hospitais-importacao-ES.xlsx';

// ─── Normalização e limpeza ──────────────────────────────────────────────────

const TITULOS = /^(d\.|dª|dna\.?|dña\.?|don|doña|dr\.?a?\.?|sr\.?a?\.?|sra\.?|prof\.?)$/i;

function semAcentos(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Chave de comparação de nomes de hospital: sem acentos, sem pontuação e sem as palavras
 *  que aparecem em toda a gente ("hospital", "universitario", "de", "la"…), que de outra
 *  forma fazem qualquer hospital parecer-se com qualquer outro. */
function chaveHospital(value) {
  return semAcentos(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(hospital|hospitalar|hospitales|universitario|universitari|universitaria|clinica|clinico|clinic|centro|centre|complejo|instituto|institut|fundacion|fundacao|de|del|da|do|la|el|los|las|i|y|e|sa|sl|epe|s|a|p)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensNome(nome) {
  return semAcentos(nome)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !TITULOS.test(token));
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Extrai todos os endereços válidos de uma célula, pela ordem em que aparecem. */
function extrairEmails(value) {
  const encontrados = String(value ?? '').match(EMAIL_RE) ?? [];
  const vistos = new Set();
  const saida = [];
  for (const bruto of encontrados) {
    const email = bruto.replace(/\.+$/, '').trim();
    const chave = email.toLowerCase();
    if (email && !vistos.has(chave)) {
      vistos.add(chave);
      saida.push(email);
    }
  }
  return saida;
}

/** Parte a célula do nome em pessoas. Os separadores são ";", "/" e "," — nesta lista as
 *  vírgulas separam sempre pessoas ("D. Agustin Santos, D. Carlos Ferrer"), nunca
 *  "Apelido, Nome". Endereços escritos dentro da célula do nome são retirados daqui e
 *  tratados como emails. */
function extrairNomes(value) {
  const semEmails = String(value ?? '').replace(EMAIL_RE, ' ');
  return semEmails
    .split(/[;/,]| y (?=[A-ZÁÉÍÓÚÑ])/)
    .map((parte) => parte.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((parte) => parte.length > 1);
}

/** Quão provável é que este email seja desta pessoa, olhando para a parte antes do "@".
 *  "scalvoca" pontua alto com "Sheila Calvo Carrillo" (calvo inteiro + iniciais), zero com
 *  "Pedro Ruiz Manzano". É isto que evita emparelhar por ordem quando a ordem está trocada. */
function pontuar(nome, email) {
  const local = semAcentos(email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokens = tokensNome(nome);
  if (tokens.length === 0 || local.length === 0) return 0;
  let pontos = 0;
  for (const token of tokens) {
    if (local.includes(token)) pontos += 4;
    else if (token.length >= 5 && local.includes(token.slice(0, 4))) pontos += 2;
    else if (local.includes(token.slice(0, 3))) pontos += 1;
  }
  if (local.startsWith(tokens[0][0])) pontos += 1;
  return pontos;
}

/** Emparelha n nomes com m emails. Primeiro os pares com sinal forte no endereço; o que
 *  sobrar é distribuído por ordem e marcado para revisão. Casos de contas partilhadas
 *  (dois nomes, um email de serviço) ficam com o mesmo email nas duas pessoas. */
function emparelhar(nomes, emails) {
  const pares = [];
  const revisao = [];

  if (nomes.length === 0 && emails.length === 0) return { pares, revisao };
  if (nomes.length === 0) {
    for (const email of emails) pares.push({ nome: '', email });
    revisao.push('sem nome na origem');
    return { pares, revisao };
  }
  if (emails.length === 0) {
    for (const nome of nomes) pares.push({ nome, email: '' });
    revisao.push('sem email na origem');
    return { pares, revisao };
  }
  if (emails.length === 1 && nomes.length > 1) {
    for (const nome of nomes) pares.push({ nome, email: emails[0] });
    revisao.push('email partilhado pelos dois nomes — confirmar');
    return { pares, revisao };
  }

  const candidatos = [];
  nomes.forEach((nome, i) => emails.forEach((email, j) => candidatos.push({ i, j, pontos: pontuar(nome, email) })));
  candidatos.sort((a, b) => b.pontos - a.pontos);

  const nomeUsado = new Set();
  const emailUsado = new Set();
  for (const candidato of candidatos) {
    if (candidato.pontos < 4) break;
    if (nomeUsado.has(candidato.i) || emailUsado.has(candidato.j)) continue;
    nomeUsado.add(candidato.i);
    emailUsado.add(candidato.j);
    pares.push({ nome: nomes[candidato.i], email: emails[candidato.j] });
  }

  const nomesSobra = nomes.filter((_, i) => !nomeUsado.has(i));
  const emailsSobra = emails.filter((_, j) => !emailUsado.has(j));
  if (nomesSobra.length > 0 || emailsSobra.length > 0) {
    const total = Math.max(nomesSobra.length, emailsSobra.length);
    for (let k = 0; k < total; k += 1) pares.push({ nome: nomesSobra[k] ?? '', email: emailsSobra[k] ?? '' });
    if (nomes.length > 1 || emails.length > 1) revisao.push('emparelhamento nome/email por ordem — confirmar');
  }
  return { pares, revisao };
}

// ─── Leitura da origem ───────────────────────────────────────────────────────

const livro = XLSX.readFile(ORIGEM);
const linhas = XLSX.utils
  .sheet_to_json(livro.Sheets['Contactos activos'], { header: 1, raw: false, defval: '' })
  .filter((linha) => linha.some((celula) => String(celula).trim() !== ''));

const brutos = linhas.slice(1).map((linha) => ({
  via: String(linha[0] ?? '').trim().toUpperCase(),
  pais: String(linha[2] ?? '').trim().toUpperCase(),
  elektaId: String(linha[3] ?? '').trim(),
  nomeFicheiro: String(linha[4] ?? '').trim(),
  nomeCarta: String(linha[5] ?? '').trim(),
  morada: String(linha[6] ?? '').trim(),
  cidade: String(linha[7] ?? '').trim(),
  codigoPostal: String(linha[8] ?? '').trim(),
  nome: String(linha[9] ?? '').trim(),
  telefone: String(linha[10] ?? '').trim(),
  movel: String(linha[11] ?? '').trim(),
  fax: String(linha[12] ?? '').trim(),
  email: String(linha[13] ?? '').trim(),
}));

// ─── Hospitais: agrupar as linhas por hospital ───────────────────────────────
// A chave natural é o ElektaID, mas há IDs reaproveitados em hospitais diferentes (o 12560
// aparece no Duques del Infantado e no Virgen del Rocío). Por isso, dentro de cada ID,
// separa-se ainda por nome: nomes parecidos ("CROASA-1"/"CROASA", "Oncosur"/"GenesisCare
// Málaga (Oncología del Sur)") são o mesmo hospital escrito de duas maneiras; nomes sem
// nada em comum são hospitais distintos e ficam à parte.
function parecidos(a, b) {
  const ta = new Set(chaveHospital(a).split(' ').filter(Boolean));
  const tb = new Set(chaveHospital(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return false;
  let comuns = 0;
  for (const token of ta) if (tb.has(token)) comuns += 1;
  return comuns / Math.min(ta.size, tb.size) >= 0.5;
}

const porId = new Map();
for (const bruto of brutos) {
  if (!porId.has(bruto.elektaId)) porId.set(bruto.elektaId, []);
  porId.get(bruto.elektaId).push(bruto);
}

const hospitais = [];
for (const [elektaId, grupo] of porId) {
  const clusters = [];
  for (const linha of grupo) {
    const alvo = clusters.find((cluster) => cluster.some((outra) => parecidos(outra.nomeFicheiro, linha.nomeFicheiro)));
    if (alvo) alvo.push(linha);
    else clusters.push([linha]);
  }
  for (const cluster of clusters) {
    // O registo mais completo do cluster manda nos dados do hospital (há linhas da mesma
    // instituição com a morada em branco numa das vias).
    const melhor = [...cluster].sort(
      (a, b) =>
        [b.morada, b.cidade, b.codigoPostal].filter(Boolean).length -
        [a.morada, a.cidade, a.codigoPostal].filter(Boolean).length,
    )[0];
    hospitais.push({
      elektaId,
      // Mais do que um hospital com este ID: a base de dados só aceita um (índice único em
      // hospitals.elekta_id), por isso a célula sai vazia e o aviso fica na revisão.
      idPartilhado: clusters.length > 1,
      nomeFicheiro: melhor.nomeFicheiro,
      nomeCarta: melhor.nomeCarta,
      morada: melhor.morada,
      cidade: melhor.cidade,
      codigoPostal: melhor.codigoPostal,
      pais: melhor.pais === 'PT' ? 'PT' : 'ES',
      linhas: cluster,
    });
  }
}

// ─── Correspondência com os hospitais que já estão na base de dados ──────────

const resposta = await fetch(`${URL}/rest/v1/hospitals?select=id,name,short_name,country&limit=2000`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!resposta.ok) {
  console.error(`✗ Falha ao ler hospitais (${resposta.status}):`, (await resposta.text()).slice(0, 300));
  process.exit(1);
}
const hospitaisBD = (await resposta.json()).map((hospital) => ({
  ...hospital,
  chaveNome: chaveHospital(hospital.name),
  chaveCurto: chaveHospital(hospital.short_name),
}));

function corresponder(hospital) {
  const chaves = [chaveHospital(hospital.nomeFicheiro), chaveHospital(hospital.nomeCarta)].filter(Boolean);
  for (const chave of chaves) {
    const exacto = hospitaisBD.find((bd) => bd.chaveNome === chave || (bd.chaveCurto && bd.chaveCurto === chave));
    if (exacto) return { nome: exacto.name, confianca: 'exacta' };
  }
  let melhor = null;
  for (const bd of hospitaisBD) {
    for (const chave of chaves) {
      const ta = new Set(chave.split(' ').filter(Boolean));
      const tb = new Set(bd.chaveNome.split(' ').filter(Boolean));
      if (ta.size === 0 || tb.size === 0) continue;
      let comuns = 0;
      for (const token of ta) if (tb.has(token)) comuns += 1;
      const razao = comuns / Math.min(ta.size, tb.size);
      if (razao >= 0.6 && (!melhor || razao > melhor.razao)) melhor = { nome: bd.name, razao };
    }
  }
  return melhor ? { nome: melhor.nome, confianca: 'aproximada' } : { nome: '', confianca: 'nenhuma' };
}

// ─── Linhas de saída ─────────────────────────────────────────────────────────
// As colunas são as que os importadores da app lêem (ver lib/importers/*ImportExport.ts).
// As colunas a mais — "Hospital (ficheiro)", "Correspondência", "Revisão" — são ignoradas
// pela importação e existem para quem revê o ficheiro.

const VIA_LABEL = { AMBAS: 'Ambas', LINACS: 'Geral', BRAQUI: 'Braquiterapia' };

const contactos = [];
const fichaHospitais = [];

for (const hospital of hospitais) {
  const match = corresponder(hospital);
  // O nome que vai na coluna "Hospital"/"Nome": o da base de dados quando casou (é assim
  // que o importador o encontra), senão o da lista — que passa a ser um hospital novo, ou
  // uma correspondência a escolher à mão na pré-visualização.
  const nomeParaImportar = match.nome || hospital.nomeFicheiro;
  const avisosHospital = [];
  if (match.confianca === 'nenhuma') avisosHospital.push('hospital não encontrado na base de dados');
  if (match.confianca === 'aproximada') avisosHospital.push('correspondência aproximada — confirmar');
  if (hospital.idPartilhado) {
    avisosHospital.push(`ElektaID ${hospital.elektaId} repetido em hospitais diferentes — deixado em branco`);
  }

  // Pessoas por via, com os dados de contacto de cada uma.
  const porVia = new Map();
  for (const linha of hospital.linhas) {
    const emails = [...new Set([...extrairEmails(linha.email), ...extrairEmails(linha.nome)])];
    const nomes = extrairNomes(linha.nome);
    const { pares, revisao } = emparelhar(nomes, emails);
    const via = linha.via === 'BRAQUI' ? 'BRAQUI' : 'LINACS';
    if (!porVia.has(via)) porVia.set(via, []);
    for (const par of pares) {
      if (!par.nome && !par.email) continue;
      porVia.get(via).push({
        nome: par.nome,
        email: par.email,
        telefone: linha.telefone,
        movel: linha.movel,
        fax: linha.fax,
        revisao: [...revisao],
      });
    }
  }

  // Fundir as vias: a mesma pessoa nas duas passa a uma linha "Ambas". Só quando o
  // interlocutor difere é que ficam duas linhas com via explícita — é esse o único caso em
  // que approval_track deixa de ser null na base de dados.
  const identidade = (pessoa) =>
    `${semAcentos(pessoa.nome).toLowerCase().replace(/[^a-z0-9]/g, '')}|${pessoa.email.toLowerCase()}`;
  const vias = [...porVia.keys()];
  const pessoas = new Map();
  for (const via of vias) {
    for (const pessoa of porVia.get(via)) {
      const chave = identidade(pessoa);
      if (!pessoas.has(chave)) pessoas.set(chave, { ...pessoa, vias: new Set() });
      pessoas.get(chave).vias.add(via);
    }
  }

  const lista = [...pessoas.values()];
  const umaViaSo = vias.length === 1;
  lista.forEach((pessoa, indice) => {
    // Uma pessoa que apareça nas duas vias, ou um hospital que só tenha uma via na lista,
    // fica com "Ambas": não há informação que justifique restringir o contacto, e é o
    // comportamento que a app já tem hoje.
    const cobreTudo = umaViaSo || pessoa.vias.size === 2;
    const via = cobreTudo ? 'AMBAS' : [...pessoa.vias][0];
    const avisos = [...new Set([...avisosHospital, ...pessoa.revisao])];
    // hospital_contacts.name é not null: uma linha sem nome não entra como está.
    if (!pessoa.nome) avisos.push('nome em falta — obrigatório para importar');
    contactos.push({
      Hospital: nomeParaImportar,
      Nome: pessoa.nome,
      Cargo: '',
      Email: pessoa.email,
      Telefone: pessoa.telefone,
      Móvel: pessoa.movel,
      Fax: pessoa.fax,
      Via: VIA_LABEL[via],
      // O primeiro contacto de cada hospital fica como principal — é uma sugestão, muda-se
      // na app ou aqui antes de importar.
      Principal: indice === 0 ? 'Sim' : 'Não',
      Activo: 'Sim',
      Notas: '',
      'Hospital (ficheiro)': hospital.nomeFicheiro,
      ElektaID: hospital.elektaId,
      Correspondência: match.confianca,
      Revisão: avisos.join('; '),
    });
  });

  fichaHospitais.push({
    Nome: nomeParaImportar,
    'Nome carta': hospital.nomeCarta,
    Morada: hospital.morada,
    'Código postal': hospital.codigoPostal,
    País: hospital.pais,
    // Cidade só se usa em ES (em PT o campo equivalente é a localidade/concelho).
    Cidade: hospital.pais === 'ES' ? hospital.cidade : '',
    // Vazia de propósito: numa actualização mantém a zona que o hospital já tem; num
    // hospital novo é obrigatória, e é aqui que se escreve antes de importar.
    Zona: '',
    ElektaID: hospital.idPartilhado ? '' : hospital.elektaId,
    'Hospital (ficheiro)': hospital.nomeFicheiro,
    Correspondência: match.confianca,
    Contactos: lista.length,
    Revisão: avisosHospital.join('; '),
  });
}

contactos.sort((a, b) => a.Hospital.localeCompare(b.Hospital, 'pt') || a.Nome.localeCompare(b.Nome, 'pt'));
fichaHospitais.sort((a, b) => a.Nome.localeCompare(b.Nome, 'pt'));

// ─── Escrita ─────────────────────────────────────────────────────────────────
// Um ficheiro por página de destino, e uma folha por ficheiro: a importação da app lê
// sempre a PRIMEIRA folha do ficheiro (ver lib/spreadsheet.ts).

function escrever(destino, linhasSaida, nomeFolha, larguras) {
  const livroSaida = XLSX.utils.book_new();
  const folha = XLSX.utils.json_to_sheet(linhasSaida);
  folha['!cols'] = larguras.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(livroSaida, folha, nomeFolha);
  XLSX.writeFile(livroSaida, destino);
}

escrever(DESTINO_CONTACTOS, contactos, 'Contactos', [42, 30, 14, 38, 16, 12, 16, 14, 10, 8, 18, 42, 10, 14, 52]);
escrever(DESTINO_HOSPITAIS, fichaHospitais, 'Hospitais', [42, 42, 40, 14, 6, 20, 14, 10, 42, 14, 10, 52]);

const semHospital = contactos.filter((linha) => linha.Correspondência === 'nenhuma').length;
const porRever = contactos.filter((linha) => linha['Revisão']).length;
const porVia = contactos.reduce((acc, linha) => ({ ...acc, [linha.Via]: (acc[linha.Via] ?? 0) + 1 }), {});
const novos = fichaHospitais.filter((linha) => linha.Correspondência === 'nenhuma').length;

console.log(`✓ ${DESTINO_CONTACTOS} — ${contactos.length} contactos`);
console.log(`   Via: ${Object.entries(porVia).map(([via, n]) => `${via}=${n}`).join(', ')}`);
console.log(`   Marcados para revisão: ${porRever} · sem hospital na base de dados: ${semHospital}`);
console.log(`✓ ${DESTINO_HOSPITAIS} — ${fichaHospitais.length} hospitais`);
console.log(`   ${fichaHospitais.length - novos} actualizam um hospital existente · ${novos} seriam novos (falta a Zona)`);
