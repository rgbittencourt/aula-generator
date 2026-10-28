// Produção audiovisual: roteiros de vídeo (Moodle e WhatsApp), apresentação de slides com
// narração (para a voz clonada) e os vídeos da UC. Tudo parte do texto JÁ APROVADO da semana
// e alimenta a planilha de produção (public/production-xlsx.js).
//
// Duas chamadas por semana, em paralelo, para caber no limite de 300 s da hospedagem:
//   1. vídeos  -> abertura da semana (Moodle) + vídeo curto de WhatsApp
//   2. slides  -> apresentação da semana + narração slide a slide
// A UC tem uma chamada própria (apresentação, WhatsApp e encerramento).

import { callJson } from "./ai-client.js";
import { buildCourseProgression, progressionForWeek } from "./curriculum.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const plain = (html) => text(html).replace(/<\/(p|li|h\d|div|tr)>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const words = (value) => (text(value).match(/\S+/g) || []).length;

// Palavras por minuto de uma fala natural em português, para estimar a duração.
export const SPEECH_WORDS_PER_MINUTE = 140;

// Cenários para variar a gravação de semana em semana (o professor pediu variedade).
export const PRODUCTION_SETTINGS = [
  "praia ao entardecer, caminhando devagar",
  "estúdio de podcast, microfone e fones, bate-papo",
  "escritório de trabalho, mesa organizada e janela ao fundo",
  "rua ao pôr do sol, caminhada filmada de frente",
  "cafeteria tranquila, mesa de canto",
  "biblioteca, estantes ao fundo",
  "varanda com plantas, luz da manhã",
  "parque ou trilha curta, passos tranquilos",
  "laboratório INOVALAB, bancada com equipamentos",
  "sala de aula vazia, quadro ao fundo"
];

export function settingForWeek(index = 0) {
  return PRODUCTION_SETTINGS[Math.abs(Number(index) || 0) % PRODUCTION_SETTINGS.length];
}

export const PRODUCTION_MODES = ["HeyGen (avatar)", "Gravação própria", "Slides + voz clonada", "A definir"];

const SYSTEM = `Você é roteirista e produtor educacional de uma unidade curricular de pós-graduação a distância (TEDPRO, IFSC). Escreve para o professor Rogério Gonçalves Bittencourt falar em primeira pessoa, em vídeo, com a voz dele: professor experiente, próximo, bem-humorado sem exagero, que conversa com colegas de profissão (docentes e gestores da educação profissional).

REGRAS DE FALA (valem para todo roteiro e narração)
- Texto para ser DITO: frases curtas e médias, ritmo de conversa, sem markdown, sem asteriscos, sem URLs, sem listas numeradas lidas em voz alta. Pode usar "né", "olha só", "bora" com parcimônia.
- Siglas e números: escreva como se fala quando houver ambiguidade (ex.: "S-U-A-P" ou "suape" conforme o uso real; "R$ 800 mil" vira "oitocentos mil reais").
- Use SOMENTE fatos, nomes, números e casos que aparecem no resumo da semana que você recebeu. Não invente dados, instituições, citações nem estatísticas. Se faltar um fato, fale do conceito.
- Nada de "como uma IA". O professor fala; o roteiro não menciona que foi gerado.
- Cada vídeo tem gancho nos primeiros segundos, um fio condutor e um convite claro à ação (ler o texto, entrar no fórum, fazer a atividade).
- Responda SOMENTE com o objeto JSON pedido, sem texto fora dele, com aspas duplas e JSON válido.`;

function digest(week, index) {
  const plan = object(week?.lessonPlan);
  const sections = list(plan.contentSections).map((section) => `- Seção ${text(section.number)} — ${text(section.title)}: ${plain(section.body).slice(0, 900)}`).join("\n");
  const refs = list(plan.references).slice(0, 8).map((ref) => `- ${plain(typeof ref === "string" ? ref : ref?.citation || ref?.title || "")}`).filter((line) => line.length > 3).join("\n");
  return `SEMANA ${index + 1}: ${text(plan.theme || week?.meta?.title)}
Boas-vindas do texto: ${plain(plan.welcome).slice(0, 700)}
Objetivos: ${list(plan.learningObjectives).map((item) => plain(typeof item === "string" ? item : item?.text || item?.objective || "")).filter(Boolean).join(" | ")}
SEÇÕES (resumo do que o texto aprovado diz):
${sections || "(sem seções)"}
Síntese: ${plain(plan.synthesis).slice(0, 900)}
Ligação com a próxima semana: ${plain(plan.nextWeekConnection).slice(0, 500)}
Referências do texto:
${refs || "(sem referências)"}`;
}

function neighbourLines(ctx) {
  const parts = [];
  if (ctx.previousTheme) parts.push(`Semana anterior: ${ctx.previousTheme}`);
  if (ctx.nextTheme) parts.push(`Próxima semana: ${ctx.nextTheme}`);
  return parts.join("\n") || "Sem semana anterior/seguinte conhecida.";
}

const SEGMENTS_SHAPE = `[{"time":"0:00–0:20","scene":"o que aparece e o que o professor faz (enquadramento, gesto, deslocamento)","speech":"a fala exata, pronta para ler ou para o avatar","onScreen":"texto curto na tela, se houver (senão vazio)"}]`;

function videosPrompt(input, index, week, ctx) {
  const setting = ctx.setting || settingForWeek(index);
  return `CURSO/UC: ${text(input.title)}
${neighbourLines(ctx)}
CENÁRIO SUGERIDO PARA ESTA SEMANA (os dois vídeos usam o MESMO cenário; adapte se não combinar com o tema): ${setting}

${digest(week, index)}

TAREFA: escreva os dois vídeos de acompanhamento desta semana.

1) moodleVideo — vídeo de abertura da semana, para o Moodle: de 3 a 4 minutos (cerca de ${Math.round(SPEECH_WORDS_PER_MINUTE * 3.5)} palavras de fala), informal, retomando a semana anterior e abrindo a curiosidade pelo tema; apresenta a pergunta central, o que a pessoa vai encontrar no texto (sem ler o sumário), o que fazer na semana e como pedir ajuda. Para gravação própria OU avatar (HeyGen): as falas devem funcionar nos dois.
2) whatsappVideo — vídeo de cerca de 30 segundos (${Math.round(SPEECH_WORDS_PER_MINUTE * 0.5)}–${Math.round(SPEECH_WORDS_PER_MINUTE * 0.6)} palavras), muito informal, no mesmo cenário, para o grupo de WhatsApp da turma: lembra que a semana abriu, provoca com UMA ideia do tema e apresenta, com humor e convicção, TGE como a melhor UC do TEDPRO (sem desmerecer as outras).

Devolva este JSON:
{
  "moodleVideo": {
    "title": "título do vídeo (até 80 caracteres)",
    "durationMinutes": 3.5,
    "setting": "cenário final escolhido, com enquadramento e roupa sugerida",
    "description": "descrição curta (2–3 linhas) para colar no recurso de vídeo do Moodle",
    "linkToPreviousWeek": "a frase de retomada da semana anterior (vazia na primeira semana)",
    "linkToNextWeek": "a frase que deixa o gancho para a próxima semana",
    "segments": ${SEGMENTS_SHAPE},
    "postProduction": "legenda, thumbnail, música, cortes e formato (MP4 720p) em 2–4 linhas"
  },
  "whatsappVideo": {
    "title": "título interno",
    "durationSeconds": 30,
    "setting": "o mesmo cenário",
    "segments": ${SEGMENTS_SHAPE},
    "message": "texto de acompanhamento para colar no WhatsApp junto do vídeo (2–4 linhas, com um emoji no máximo por linha)"
  }
}
O moodleVideo deve ter de 7 a 12 segmentos; o whatsappVideo, de 3 a 5.`;
}

function slidesPrompt(input, index, week, ctx) {
  return `CURSO/UC: ${text(input.title)}
${neighbourLines(ctx)}

${digest(week, index)}

TAREFA: monte a apresentação de slides da semana e a narração, slide a slide, que o professor vai gravar com a voz clonada (a narração será lida por uma voz sintética: frases limpas, sem sigla solta sem explicar na primeira vez).

Estrutura: de 12 a 16 slides, de 9 a 12 minutos de fala no total (cerca de ${Math.round(SPEECH_WORDS_PER_MINUTE * 10)} a ${Math.round(SPEECH_WORDS_PER_MINUTE * 11)} palavras somadas). Slide 1 abre a semana (retoma a anterior); slides do meio acompanham a ordem das seções do texto, um conceito ou caso por slide; o penúltimo sintetiza; o último convida à leitura/atividade e prepara a próxima semana. Cada slide tem pouco texto (3 a 5 tópicos curtos, de até 12 palavras) e um visual concreto sugerido (diagrama, linha do tempo, comparação, foto de situação real) — não repita o parágrafo na tela. A narração NÃO lê os tópicos: ela conta e interpreta.

Devolva este JSON:
{
  "title": "título da apresentação (até 80 caracteres)",
  "description": "2–3 linhas para o recurso do Moodle",
  "slides": [
    {
      "number": 1,
      "title": "título do slide (até 8 palavras)",
      "bullets": ["tópico curto", "tópico curto"],
      "visual": "o que desenhar/mostrar no slide (concreto, executável no PowerPoint/Canva)",
      "narration": "a narração exata deste slide",
      "seconds": 40,
      "sectionRef": "número da seção do texto a que o slide corresponde (ou vazio)"
    }
  ],
  "ttsNotes": [{"term": "sigla ou nome difícil", "say": "como pronunciar/escrever para a voz sintética", "pause": "pausa ou ênfase útil, se houver"}]
}`;
}

function courseDigest(input, weeks = []) {
  const progression = buildCourseProgression(input);
  const rows = Array.from({ length: Math.max(1, Number(input.weeks) || weeks.length || 1) }, (_, index) => {
    const week = weeks[index];
    const theme = text(week?.lessonPlan?.theme || week?.meta?.title || progressionForWeek(input, index, progression)?.theme);
    const objective = list(week?.lessonPlan?.learningObjectives).map((item) => plain(typeof item === "string" ? item : item?.text || "")).filter(Boolean)[0] || text(progressionForWeek(input, index, progression)?.centralQuestion);
    return `- Semana ${index + 1}: ${theme}${objective ? ` — ${objective}` : ""}`;
  });
  return `UC: ${text(input.title)}
Descrição: ${plain(input.description || input.summary || input.courseDescription).slice(0, 900) || "(não informada)"}
Público: ${plain(input.audience || input.targetAudience).slice(0, 300) || "(não informado)"}
Semanas:
${rows.join("\n")}`;
}

function coursePrompt(input, weeks) {
  return `${courseDigest(input, weeks)}
CENÁRIO SUGERIDO: ${settingForWeek(0)} para a apresentação; o encerramento pode voltar ao cenário da apresentação.

TAREFA: escreva os três vídeos da UC.

1) opening — apresentação da UC no Moodle: de 3 a 4 minutos (cerca de ${Math.round(SPEECH_WORDS_PER_MINUTE * 3.5)} palavras). Quem é o professor, o que a UC é e por que importa agora, o percurso semana a semana (uma frase por semana), como estudar (texto, vídeos, fóruns, atividades), como funciona a avaliação em linhas gerais (sem inventar números nem datas) e um convite acolhedor.
2) whatsapp — cerca de 30 segundos (${Math.round(SPEECH_WORDS_PER_MINUTE * 0.5)}–${Math.round(SPEECH_WORDS_PER_MINUTE * 0.6)} palavras), muito informal, humor leve: apresenta a UC no grupo de WhatsApp e defende, com convicção e bom humor, que TGE é a melhor UC do TEDPRO (sem desmerecer as outras).
3) closing — encerramento da UC no Moodle: de 2 a 3 minutos; retoma o percurso, celebra, lembra de avaliações/entregas finais sem inventar datas e aponta próximos passos de quem concluiu.

Devolva este JSON:
{
  "videos": [
    {
      "key": "opening",
      "title": "título",
      "platform": "Moodle",
      "durationMinutes": 3.5,
      "setting": "cenário com enquadramento",
      "description": "descrição curta para o Moodle",
      "segments": ${SEGMENTS_SHAPE},
      "message": "texto de acompanhamento (vazio se não houver)",
      "postProduction": "legenda, thumbnail, música e formato em 2–3 linhas"
    }
  ]
}
O array deve ter exatamente três itens, com key "opening", "whatsapp" e "closing" (platform "WhatsApp" no segundo). Segmentos: 7–12 na apresentação, 3–5 no WhatsApp, 5–8 no encerramento.`;
}

function normalizeSegments(value) {
  return list(value).map((segment) => {
    const item = object(segment);
    return { time: text(item.time), scene: text(item.scene), speech: text(item.speech), onScreen: text(item.onScreen) };
  }).filter((segment) => segment.speech || segment.scene);
}

const speechOf = (segments) => segments.map((segment) => segment.speech).filter(Boolean).join("\n\n");

function normalizeVideo(value, defaults = {}) {
  const item = object(value);
  const segments = normalizeSegments(item.segments);
  const speech = speechOf(segments);
  const seconds = Number(item.durationSeconds) || (Number(item.durationMinutes) ? Math.round(Number(item.durationMinutes) * 60) : 0) || Math.round(words(speech) / SPEECH_WORDS_PER_MINUTE * 60);
  return {
    title: text(item.title, defaults.title),
    platform: text(item.platform, defaults.platform),
    setting: text(item.setting, defaults.setting),
    description: text(item.description),
    linkToPreviousWeek: text(item.linkToPreviousWeek),
    linkToNextWeek: text(item.linkToNextWeek),
    message: text(item.message),
    postProduction: text(item.postProduction),
    durationSeconds: seconds,
    wordCount: words(speech),
    segments,
    speech
  };
}

function normalizeSlides(value) {
  const item = object(value);
  const slides = list(item.slides).map((slide, position) => {
    const entry = object(slide);
    const narration = text(entry.narration);
    return {
      number: Number(entry.number) || position + 1,
      title: text(entry.title, `Slide ${position + 1}`),
      bullets: list(entry.bullets).map((bullet) => text(bullet)).filter(Boolean),
      visual: text(entry.visual),
      narration,
      seconds: Number(entry.seconds) || Math.round(words(narration) / SPEECH_WORDS_PER_MINUTE * 60),
      sectionRef: text(entry.sectionRef)
    };
  }).filter((slide) => slide.title || slide.narration);
  slides.forEach((slide, position) => { slide.number = position + 1; });
  const narrationText = slides.map((slide) => slide.narration).filter(Boolean).join("\n\n");
  return {
    title: text(item.title),
    description: text(item.description),
    slides,
    narrationText,
    wordCount: words(narrationText),
    estimatedMinutes: Math.round(words(narrationText) / SPEECH_WORDS_PER_MINUTE * 10) / 10,
    ttsNotes: list(item.ttsNotes).map((note) => {
      const entry = object(note);
      return { term: text(entry.term), say: text(entry.say), pause: text(entry.pause) };
    }).filter((note) => note.term)
  };
}

// `ask` tem a mesma assinatura de callJson(messages, options); os testes injetam um simulado.
const run = (ask, prompt, label, maxTokens) => ask([
  { role: "system", content: SYSTEM },
  { role: "user", content: prompt }
], {
  temperature: 0.6,
  maxTokens,
  retryMaxTokens: maxTokens,
  label,
  cacheSystem: true,
  formatRetryInstruction: "A resposta anterior foi truncada ou inválida. Devolva novamente somente o objeto JSON pedido, completo e válido."
});

export function validateProductionWeek(week) {
  const plan = object(week?.lessonPlan);
  if (!list(plan.contentSections).length) {
    const error = new Error("Envie a semana já escrita para gerar os roteiros e os slides.");
    error.code = "PRODUCTION_WEEK_MISSING";
    throw error;
  }
}

export async function produceWeek(input, index, week, ctx = {}, ask = callJson) {
  validateProductionWeek(week);
  const context = { ...ctx, setting: text(ctx.setting) || settingForWeek(index) };
  const [videos, slides] = await Promise.allSettled([
    run(ask, videosPrompt(input, index, week, context), "production:videos", 12000),
    run(ask, slidesPrompt(input, index, week, context), "production:slides", 16000)
  ]);
  if (videos.status === "rejected" && slides.status === "rejected") throw videos.reason;
  const plan = object(week?.lessonPlan);
  const theme = text(plan.theme || week?.meta?.title);
  const number = index + 1;
  const production = {
    version: 1,
    weekNumber: number,
    theme,
    generatedAt: new Date().toISOString(),
    setting: context.setting,
    missing: []
  };
  if (videos.status === "fulfilled") {
    const data = object(videos.value);
    production.moodleVideo = normalizeVideo(data.moodleVideo, { title: `Semana ${number}: abertura`, platform: "Moodle", setting: context.setting });
    production.whatsappVideo = normalizeVideo(data.whatsappVideo, { title: `Semana ${number}: WhatsApp`, platform: "WhatsApp", setting: context.setting });
    if (!production.moodleVideo.segments.length) production.missing.push("vídeo do Moodle");
    if (!production.whatsappVideo.segments.length) production.missing.push("vídeo de WhatsApp");
  } else production.missing.push("vídeo do Moodle", "vídeo de WhatsApp");
  if (slides.status === "fulfilled") {
    production.slides = normalizeSlides(slides.value);
    if (!production.slides.slides.length) production.missing.push("slides e narração");
  } else production.missing.push("slides e narração");
  production.errors = [videos, slides].filter((result) => result.status === "rejected").map((result) => result.reason?.message || "falha");
  return production;
}

export async function produceCourse(input, weeks = [], ask = callJson) {
  const data = object(await run(ask, coursePrompt(input, weeks), "production:course", 14000));
  const defaults = { opening: { title: "Apresentação da UC", platform: "Moodle" }, whatsapp: { title: "UC no WhatsApp", platform: "WhatsApp" }, closing: { title: "Encerramento da UC", platform: "Moodle" } };
  const videos = list(data.videos).map((video) => ({ key: text(object(video).key), ...normalizeVideo(video, defaults[text(object(video).key)] || {}) }));
  const byKey = Object.fromEntries(videos.map((video) => [video.key, video]));
  const ordered = ["opening", "whatsapp", "closing"].map((key) => byKey[key] ? { ...byKey[key], platform: byKey[key].platform || defaults[key].platform } : null).filter((video) => video && video.segments.length);
  if (!ordered.length) {
    const error = new Error("A IA não devolveu os roteiros da UC. Tente novamente.");
    error.code = "PRODUCTION_FAILED";
    error.retryable = true;
    throw error;
  }
  return { version: 1, generatedAt: new Date().toISOString(), title: text(input.title), videos: ordered };
}
