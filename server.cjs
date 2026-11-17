const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomInt, createHash } = require("node:crypto");
const { createMockHandler } = require("./mock-exam.cjs");
const { buildReadingPractice } = require("./mock-content.cjs");

const bank = JSON.parse(readFileSync(join(__dirname, "questions.json"), "utf8"));
const page = readFileSync(join(__dirname, "index.html"));
const levels = new Set(["N1", "N2", "N3", "N4", "N5"]);
const sections = new Set(["all", "vocabulary", "grammar"]);

const dailyPage = readFileSync(join(__dirname, "daily.html"));
const readingPage = readFileSync(join(__dirname, "reading.html"));
const perSection = 25;
const translations = JSON.parse(readFileSync(join(__dirname, "translations.json"), "utf8"));
const extraVocabulary = JSON.parse(readFileSync(join(__dirname, "study-vocabulary.json"), "utf8"));
const extraGrammar = JSON.parse(readFileSync(join(__dirname, "study-grammar.json"), "utf8"));
const supplement = JSON.parse(readFileSync(join(__dirname, "study-supplement.json"), "utf8"));
const studyPage = readFileSync(join(__dirname, "study.html"));
const studySections = new Set(["vocabulary", "grammar"]);

function readDate(date) {
  const epoch = Date.parse(date + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !Number.isFinite(epoch)
      || new Date(epoch).toISOString().slice(0, 10) !== date) return null;
  return epoch / 86400000;
}

const kanjiReadings = {
  "余儀": "よぎ", "皮切り": "かわきり", "顧み": "かえりみ", "以来": "いらい",
  "先立": "さきだ", "最中": "さいちゅう", "次第": "しだい", "中心": "ちゅうしん",
  "以上": "いじょう", "反面": "はんめん", "一方": "いっぽう", "気味": "ぎみ",
  "基づ": "もとづ", "応じ": "おうじ", "即し": "そくし", "対して": "たいして",
  "関して": "かんして", "伴って": "ともなって", "相まって": "あいまって",
  "加えて": "くわえて", "比べ": "くらべ", "沿って": "そって", "反して": "はんして",
  "決まる": "きまる", "決まって": "きまって", "得る": "うる", "得ない": "えない",
  "通して": "とおして", "踏まえ": "ふまえ", "問わ": "とわ", "違い": "ちがい",
  "足る": "たる", "足": "た", "余": "あま", "禁じ": "きんじ", "限": "かぎ",
  "行く": "いく", "堪え": "たえ", "思": "おも", "報告": "ほうこく",
  "待": "ま", "済": "す", "越": "こ", "読": "よ", "至": "いた",
  "早": "はや", "抜": "ぬ", "機": "き", "際": "さい", "上": "うえ",
  "間": "あいだ", "前": "まえ", "向": "む", "経て": "へて",
  "境": "さかい", "否": "いな", "知": "し",
};

function grammarReading(text) {
  const surface = text.replace(/（[^）]*）|\([^)]*\)|\+명사|＋명사/g, "").trim();
  if (surface === "동사 사전형") return "どうしのじしょけい";
  if (surface === "동사 가능형") return "どうしのかのうけい";
  const letters = surface.replace(/[\p{Script=Han}][\p{Script=Han}\p{Script=Hiragana}]*/gu,
    word => word.replace(new RegExp(Object.keys(kanjiReadings).join("|"), "g"), part => kanjiReadings[part]));
  return letters.replace(/を/g, "お").replace(/([〜～])へ(?=$)/g, "$1え")
    .replace(/^へ$/, "え").replace(/^([〜～]?)は$/, "$1わ")
    .replace(/では/g, "でわ").replace(/てはい/g, "てわい").replace(/ことは/g, "ことわ")
    .replace(/以上は/g, "いじょうわ").replace(/いじょうは/g, "いじょうわ");
}

function studyCards(level, section, date, all) {
  const concepts = [];
  const examples = [];
  for (const [id, item] of Object.entries(bank)) {
    if (item.level !== level || item.section !== section) continue;
    if (section === "grammar" && translations[id]) {
      const card = {target: item.target, reading: grammarReading(item.target), explanation: item.explanation,
        example: item.prompt.replace("（　）", item.answer), translation: translations[id], source: item.source};
      if (id.includes("-sentence-")) {
        examples.push({...card, cardId: id, exercisePrompt: card.translation});
      } else {
        concepts.push(card);
      }
    }
    if (section === "vocabulary" && !id.endsWith("-meaning") && !id.endsWith("-kanji")) {
      concepts.push({target: item.target, reading: item.answer, meaning: item.explanation, source: item.source});
    }
  }
  const extra = section === "vocabulary" ? extraVocabulary : extraGrammar;
  for (const item of [...extra, ...supplement[section]]) {
    if (item.level !== level) continue;
    concepts.push(section === "grammar" ? {...item, reading: grammarReading(item.reading ?? item.target)} : item);
  }
  if (section === "grammar") {
    for (const card of concepts) {
      examples.push({...card, cardId: "application:" + card.target, exercisePrompt: card.translation});
    }
  }
  const items = [...concepts, ...examples];
  if (all) return items;
  const key = item => item.cardId ?? item.target;
  const pool = examples.length ? examples : concepts;
  const count = examples.length ? 150 - concepts.length : 150;
  const ordered = stableOrder(pool, "study-v2:" + level + ":" + section, key);
  const offset = ((readDate(date) * count) % ordered.length + ordered.length) % ordered.length;
  const selected = Array.from({length: count}, (_, index) => ordered[(offset + index) % ordered.length]);
  return examples.length ? [...stableOrder(concepts, date, key), ...stableOrder(selected, date, key)]
    : stableOrder(selected, date, key);
}

function answerDetails(id, item) {
  if (item.section === "grammar") {
    return {patternReading: grammarReading(item.target), answerReading: grammarReading(item.answer),
      translation: translations[id], completedSentence: item.prompt.replace("（　）", item.answer),
      questionMeaning: "문장의 빈칸에 들어갈 가장 알맞은 표현을 고르는 문제입니다."};
  }
  const original = bank[id.replace(/-(?:meaning|kanji)$/, "")];
  const reading = original.answer;
  const questionMeaning = id.endsWith("-kanji") ? "「" + reading + "」에 해당하는 한자 표기를 고르는 문제입니다."
    : id.endsWith("-meaning") ? "「" + item.target + "」의 한국어 뜻을 고르는 문제입니다."
    : "「" + item.target + "」를 어떻게 읽는지 묻는 문제입니다.";
  return {questionMeaning, reading, meaning: original.explanation};
}


function stableOrder(items, seed, key) {
  return items.map((item) => ({
    item,
    rank: createHash("sha256").update(JSON.stringify([seed, key(item)])).digest("hex"),
  })).sort((a, b) => a.rank.localeCompare(b.rank)).map(({item}) => item);
}

function dailyQuestions(level, date) {
  const epoch = Date.parse(date + "T00:00:00Z");
  const day = epoch / 86400000;
  const pool = Object.entries(bank).filter(([, item]) => item.level === level);
  const selected = [];
  for (const section of ["vocabulary", "grammar"]) {
    const items = stableOrder(pool.filter(([, item]) => item.section === section),
      "daily-v1:" + level + ":" + section, ([id]) => id);
    if (items.length < perSection) return null;
    const offset = ((day * perSection) % items.length + items.length) % items.length;
    for (let index = 0; index < perSection; index++) {
      selected.push(items[(offset + index) % items.length]);
    }
  }
  return stableOrder(selected, date, ([id]) => id).map(([id, item]) => ({
    id,
    section: item.section,
    prompt: item.prompt,
    choices: stableOrder([item.answer, ...item.distractors], date + ":" + id, (choice) => choice),
  }));
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

async function grade(request, response) {
  const length = Number(request.headers["content-length"]);
  if (!Number.isInteger(length) || length < 1 || length > 4096) {
    request.resume();
    sendJson(response, 400, { error: "답안을 확인해 주세요." });
    return;
  }

  let payload;
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    sendJson(response, 400, { error: "답안을 확인해 주세요." });
    return;
  }
  const { id, choice } = payload ?? {};
  if (typeof id !== "string" || !Object.hasOwn(bank, id)) {
    sendJson(response, 400, { error: "문항을 확인해 주세요." });
    return;
  }
  const item = bank[id];
  if (![item.answer, ...item.distractors].includes(choice)) {
    sendJson(response, 400, { error: "답안을 확인해 주세요." });
    return;
  }

  const { answer, target, explanation, source } = item;
  sendJson(response, 200, { correct: answer === choice, answer, target, explanation, source, ...answerDetails(id, item) });
}

async function readAnswer(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) return null;
    chunks.push(chunk);
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

const cloud = process.env.JLPT_CLOUD === "1";
const database = cloud ? process.env.DATABASE_URL : undefined;
if (cloud && !database) throw new Error("DATABASE_URL is required for cloud deployment");
const share = cloud || process.env.JLPT_SHARE_CONFIG
  ? require("./share-access.cjs").createShareAccess(process.env.JLPT_SHARE_CONFIG, bank, sendJson, readAnswer, database)
  : null;
const handleMock = share ? share.mock : createMockHandler(bank, sendJson);
async function handleRequest(request, response) {
  const [pathname, query] = request.url.split("?", 2);
  if (cloud && request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, {ok:true});
    return;
  }
  if (share && !share.restrict(request, response, pathname)) return;
  if (share && pathname === "/access") {
    await share.handleLogin(request, response);
    return;
  }
  if (pathname === "/mock" || pathname === "/api/mock" || pathname.startsWith("/api/mock/")) {
    try {
      await handleMock(request, response, pathname, query);
    } catch (error) {
      if (error.code === "JLPT_CONFLICT" && !response.headersSent) {
        sendJson(response, 409, {error: "다른 창에서 응시 상태가 바뀌었습니다. 새로고침해 주세요."});
        return;
      }
      console.error("Mock exam request:", error.code ?? error.name);
      if (!response.headersSent) sendJson(response, 500, {error: "모의고사 요청을 처리하지 못했습니다."});
      else response.destroy();
    }
    return;
  }
  if (request.method === "GET" && (pathname === "/" || pathname === "/practice" || pathname === "/reading")) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(pathname === "/" ? dailyPage : pathname === "/reading" ? readingPage : page);
    return;
  }
  if (request.method === "GET" && pathname === "/api/study") {
    const params = new URLSearchParams(query);
    const level = params.get("level");
    const section = params.get("section");
    const date = params.get("date");
    if (!levels.has(level) || !studySections.has(section) || readDate(date) === null) {
      sendJson(response, 400, {error: "급수, 영역과 날짜를 확인해 주세요."});
      return;
    }
    sendJson(response, 200, {cards: studyCards(level, section, date, params.get("all") === "1")});
    return;
  }
  if (request.method === "GET" && (pathname === "/vocabulary" || pathname === "/grammar")) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    response.end(studyPage);
    return;
  }
  if (pathname === "/api/reading" && request.method === "GET") {
    const params = new URLSearchParams(query);
    const level = params.get("level");
    const date = params.get("date");
    if (!levels.has(level) || readDate(date) === null) {
      sendJson(response, 400, {error: "급수와 날짜를 확인해 주세요."});
      return;
    }
    const questions = buildReadingPractice(level, date)
      .map(({id, passage, prompt, choices}) => ({id, passage, prompt, choices}));
    sendJson(response, 200, {questions});
    return;
  }
  if (pathname === "/api/reading/grade" && request.method === "POST") {
    const payload = await readAnswer(request);
    if (!payload || !levels.has(payload.level) || typeof payload.date !== "string" || readDate(payload.date) === null) {
      sendJson(response, 400, {error: "급수, 날짜와 답안을 확인해 주세요."});
      return;
    }
    const {level, date, id, choice} = payload;
    const item = buildReadingPractice(level, date).find(question => question.id === id);
    if (!item?.choices.includes(choice)) {
      sendJson(response, 400, {error: "문항과 답안을 확인해 주세요."});
      return;
    }
    const {translation, questionTranslation, reason, choiceTranslations} = item.review;
    const meanings = Object.fromEntries([item.answer, ...item.distractors].map((value, i) => [value, choiceTranslations[i]]));
    sendJson(response, 200, {correct: item.answer === choice, answer: item.answer, translation,
      questionTranslation, reason, meanings});
    return;
  }

  if (request.method === "GET" && pathname === "/api/daily") {
    const params = new URLSearchParams(query);
    const level = params.get("level");
    const date = params.get("date");
    const epoch = Date.parse(date + "T00:00:00Z");
    if (!levels.has(level) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")
        || !Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== date) {
      sendJson(response, 400, {error: "급수와 날짜를 확인해 주세요."});
      return;
    }
    const questions = dailyQuestions(level, date);
    if (!questions) {
      sendJson(response, 503, {error: "이 급수의 일일 문항이 부족합니다."});
      return;
    }
    sendJson(response, 200, {level, date, questions});
    return;
  }

  if (request.method === "GET" && pathname === "/api/questions") {
    const params = new URLSearchParams(query);
    const level = params.get("level") ?? "N5";
    const section = params.get("section") ?? "all";
    if (!levels.has(level) || !sections.has(section)) {
      sendJson(response, 400, { error: "급수나 영역을 확인해 주세요." });
      return;
    }
    const questions = [];
    for (const [id, item] of Object.entries(bank)) {
      if (item.level !== level || (section !== "all" && item.section !== section)) continue;
      questions.push({
        id,
        section: item.section,
        prompt: item.prompt,
        choices: shuffle([item.answer, ...item.distractors]),
      });
    }
    sendJson(response, 200, { questions: shuffle(questions) });
    return;
  }
  if (request.method === "POST" && pathname === "/api/grade") {
    await grade(request, response);
    return;
  }
  sendJson(response, 404, { error: "페이지를 찾을 수 없습니다." });
}

const port = Number(process.env.PORT ?? 8000);
const local = createServer(handleRequest);
local.listen(port, cloud ? "0.0.0.0" : "127.0.0.1", () => {
  const actualPort = local.address().port;
  console.log("http://127.0.0.1:" + actualPort);
  const lanAddress = process.env.JLPT_LAN_ADDRESS;
  if (share || !lanAddress || lanAddress === "127.0.0.1") return;
  const lan = createServer(handleRequest);
  lan.on("error", error => console.error("LAN 접속을 시작하지 못했습니다. " + error.message));
  lan.listen(actualPort, lanAddress, () => console.log("http://" + lanAddress + ":" + actualPort));
});
