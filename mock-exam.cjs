const { readFileSync, writeFileSync, renameSync } = require("node:fs");
const { join } = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { profiles, labels, buildExam, scoreExam, reviewExam } = require("./mock-content.cjs");

const runFile = promisify(execFile);
const voiceScript = readFileSync(join(__dirname, "mock-voice.ps1"), "utf8");
const translations = JSON.parse(readFileSync(join(__dirname, "translations.json"), "utf8"));
const mockPage = () => readFileSync(join(__dirname, "mock.html"));
const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" });
const increaseDate = "2026-11-29";

function validDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(date + "T00:00:00Z");
  return Number.isFinite(+value) && value.toISOString().slice(0, 10) === date;
}

function limit(date) {
  return date >= increaseDate ? 3 : 1;
}

async function speech(text, voice = 0) {
  if (process.platform === "linux") return require("./cloud-voice.cjs").linuxSpeech(text);
  const input = Buffer.from(text, "utf8").toString("base64");
  const command = "& {\n" + voiceScript + "\n} -EncodedText '" + input + "' -VoiceIndex " + voice;
  const encoded = Buffer.from(command, "utf16le").toString("base64");
  const { stdout } = await runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
  const wav = Buffer.from(stdout.trim(), "base64");
  if (wav.subarray(0, 4).toString("ascii") !== "RIFF") throw new Error("Invalid WAV");
  return wav;
}

function sendAudio(response, audio) {
  response.writeHead(200, {"Content-Type": "audio/wav", "Content-Length": audio.length, "Cache-Control": "no-store"});
  response.end(audio);
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) return null;
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function createMockHandler(bank, sendJson, {progressFile = join(__dirname, "mock-progress.json"), now = Date.now, persistence} = {}) {
  let records;
  try {
    records = persistence ? persistence.records : JSON.parse(readFileSync(progressFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    records = {};
  }
  const pendingAudio = new Set();

  async function store(record) {
    const key = record.date + "/" + record.slot;
    if (persistence) {
      await persistence.save(key, record);
      records[key] = record;
      return record;
    }
    const updated = {...records, [key]: record};
    const temporary = progressFile + ".tmp";
    writeFileSync(temporary, JSON.stringify(updated, null, 2) + "\n");
    renameSync(temporary, progressFile);
    records = updated;
    return record;
  }

  function finishSection(record, exam) {
    const next = record.section + 1;
    if (next < exam.length) {
      return store({...record, section: next, deadline: null});
    }
    return store({...record, deadline: null, result: scoreExam(exam, record.answers, record.level)});
  }

  function refresh(record, exam) {
    if (record.deadline !== null && record.deadline <= now()) return finishSection(record, exam);
    return record;
  }

  function view(record, exam) {
    const metadata = exam.map(({label, minutes, questions}) => ({label, minutes, count: questions.length}));
    const summary = {date: record.date, slot: record.slot, level: record.level,
      section: record.section, deadline: record.deadline, setup: metadata, result: record.result,
      serverTime: now()};
    if (record.result || record.deadline === null) return summary;
    const questions = exam[record.section].questions.map(({id, prompt, category, passage, choices}) =>
      ({id, prompt, kind: labels[category], listening: category === "listening", passage, choices,
        choice: record.answers[id], played: Boolean(record.played[id])}));
    return {...summary, questions};
  }

  function lookup(date, slot) {
    return records[date + "/" + slot];
  }

  function currentDay() {
    return dateFormat.format(new Date(now()));
  }

  async function dayView(date) {
    const attempts = await Promise.all(Array.from({length: limit(date)}, async (_, i) => {
      const record = lookup(date, i + 1);
      if (!record) return {slot: i + 1};
      const exam = buildExam(bank, record.level, date, i + 1);
      return view(await refresh(record, exam), exam);
    }));
    return {date, today: currentDay(), attempts, profiles,
      history: Object.values(records).filter(record => record.result)
        .sort((a, b) => b.date.localeCompare(a.date) || b.slot - a.slot)
        .map(({date: day, slot, level, result}) => ({date: day, slot, level, result}))};
  }

  return async function handleMock(request, response, pathname, query) {
    const send = (code, data) => sendJson(response, code, data);
    if (request.method === "GET" && pathname === "/mock") {
      response.writeHead(200, {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache"});
      response.end(mockPage());
      return;
    }
    const today = currentDay();
    if (request.method === "GET" && pathname === "/api/mock/preview") {
      try {
        sendAudio(response, await speech("これから日本語の聞き取りを始めます。はっきり聞こえますか。"));
      } catch (error) {
        console.error(error.message);
        send(503, {error: "일본어 음성을 만들 수 없습니다. 서버 PC의 일본어 음성을 확인해 주세요."});
      }
      return;
    }
    if (request.method === "GET" && pathname === "/api/mock") {
      const date = new URLSearchParams(query).get("date") ?? today;
      if (!validDate(date) || date > today) {
        send(400, {error: "오늘 또는 이전 날짜를 선택해 주세요."});
        return;
      }
      send(200, await dayView(date));
      return;
    }
    if (request.method === "GET" && pathname === "/api/mock/review") {
      const params = new URLSearchParams(query);
      const date = params.get("date");
      const slot = Number(params.get("slot"));
      if (!validDate(date) || date > today || !Number.isInteger(slot) || slot < 1 || slot > limit(date)) {
        send(400, {error: "복습할 날짜와 회차를 확인해 주세요."});
        return;
      }
      const record = lookup(date, slot);
      if (!record?.result) {
        send(409, {error: "시험을 제출한 뒤 오답을 볼 수 있습니다."});
        return;
      }
      send(200, reviewExam(buildExam(bank, record.level, date, slot, translations), record.answers));
      return;
    }
    if (request.method !== "POST") {
      send(404, {error: "요청을 찾을 수 없습니다."});
      return;
    }

    const body = await readBody(request);
    if (!body || !validDate(body.date) || body.date > today || !Number.isInteger(body.slot)
      || body.slot < 1 || body.slot > limit(body.date)) {
      send(400, {error: "날짜나 회차를 확인해 주세요."});
      return;
    }
    const {date, slot} = body;
    let record = lookup(date, slot);
    if (pathname === "/api/mock/start") {
      if (date !== today || typeof body.level !== "string" || !Object.hasOwn(profiles, body.level)) {
        send(400, {error: "오늘 날짜와 응시 급수를 선택해 주세요."});
        return;
      }
      if (record) {
        send(409, {error: "이미 시작한 회차입니다."});
        return;
      }
      const exam = buildExam(bank, body.level, date, slot);
      record = await store({date, slot, level: body.level, section: 0, deadline: now() + exam[0].minutes * 60000,
        answers: {}, played: {}, result: null});
      send(200, view(record, exam));
      return;
    }
    if (!record) {
      send(404, {error: "먼저 모의고사를 시작해 주세요."});
      return;
    }
    const exam = buildExam(bank, record.level, date, slot);
    record = await refresh(record, exam);
    if (pathname === "/api/mock/advance") {
      if (record.result || record.deadline !== null || body.section !== record.section) {
        send(409, {error: "다음 교시를 시작할 수 없습니다."});
        return;
      }
      record = await store({...record, deadline: now() + exam[record.section].minutes * 60000});
      send(200, view(record, exam));
      return;
    }
    if (record.result || record.deadline === null || body.section !== record.section) {
      send(409, {error: "해당 교시가 이미 종료되었습니다."});
      return;
    }
    if (pathname === "/api/mock/submit") {
      send(200, view(await finishSection(record, exam), exam));
      return;
    }

    const item = exam[record.section].questions.find(question => question.id === body.id);
    if (!item) {
      send(400, {error: "현재 교시의 문항을 선택해 주세요."});
      return;
    }
    if (pathname === "/api/mock/answer") {
      if (!item.choices.includes(body.choice) || (item.audio && !record.played[item.id])) {
        send(400, {error: "보기를 확인해 주세요. 청해는 먼저 음성을 들어야 합니다."});
        return;
      }
      const answers = {...record.answers, [item.id]: body.choice};
      await store({...record, answers});
      send(200, {choice: body.choice});
      return;
    }
    if (pathname === "/api/mock/listen") {
      const key = date + "/" + slot + "/" + item.id;
      if (!item.audio || record.played[item.id] || pendingAudio.has(key)) {
        send(409, {error: "이 문항은 더 이상 재생할 수 없습니다."});
        return;
      }
      pendingAudio.add(key);
      try {
        const wav = await speech(item.audio, Number(item.id.split("-")[1]));
        const latest = await refresh(lookup(date, slot), exam);
        if (latest.section !== record.section || latest.deadline === null || latest.result) {
          send(409, {error: "청해 교시가 종료되었습니다."});
          return;
        }
        await store({...latest, played: {...latest.played, [item.id]: true}});
        sendAudio(response, wav);
      } catch (error) {
        console.error(error.message);
        send(503, {error: "청해 음성을 만들지 못했습니다. 다시 재생해 주세요."});
      } finally {
        pendingAudio.delete(key);
      }
      return;
    }
    send(404, {error: "요청을 찾을 수 없습니다."});
  };
}

module.exports = {createMockHandler};
