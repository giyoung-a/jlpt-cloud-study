const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const { mkdirSync, readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { createMockHandler } = require("./mock-exam.cjs");

const cookieName = "jlpt_guest";
const lifetime = 30 * 24 * 60 * 60;
const maxLoginsPerWindow = 20;

function sameText(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const loginPage = `<!doctype html>
<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>JLPT 초대 코드</title>
<style>
  * {box-sizing:border-box}
  body {margin:0; padding:24px; color:#173126; font:16px/1.6 system-ui,sans-serif; background:#eef3ef}
  main {margin:12vh auto 0; padding:24px; border-radius:14px; background:white; max-width:450px}
  h1 {margin:0 0 12px; line-height:1.2}
  label {display:grid; gap:8px}
  input,button {font:inherit; min-height:44px; border-radius:8px; padding:6px 10px; border:1px solid #8ea498}
  button {background:#194b37; color:white; margin-top:12px}
</style>
<main>
  <h1>JLPT 학습</h1>
  <form id="login">
    <label>초대 코드 <input id="code" type="password" required maxlength="64" autofocus></label>
    <button>입장</button>
  </form>
  <p id="status" role="status"></p>
</main>
<script>
const form = document.getElementById("login");
form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const r = await fetch("/access", {method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({code:document.getElementById("code").value.trim()})});
    if (!r.ok) throw new Error((await r.json()).error);
    const next = new URLSearchParams(location.search).get("next");
    const destination = new URL(next ?? "/", location.origin);
    location.replace(destination.origin === location.origin ? destination.href : "/");
  } catch (error) {
    document.getElementById("status").textContent = error.message || "연결을 다시 시도해 주세요.";
  } finally {button.disabled = false;}
});
</script></html>`;

function createShareAccess(configPath, bank, sendJson, readAnswer, databaseUrl) {
  const cloud = Boolean(databaseUrl);
  const config = cloud ? {secret: process.env.JLPT_SESSION_SECRET, code: process.env.JLPT_INVITE_CODE}
    : JSON.parse(readFileSync(configPath, "utf8"));
  if (typeof config.secret !== "string" || config.secret.length < 40
      || typeof config.code !== "string" || !/^[A-Za-z0-9+/_=-]{12,64}$/.test(config.code)) {
    throw new Error("Invalid share credentials");
  }
  const guestDir = cloud ? null : join(dirname(configPath), "share-guests");
  if (guestDir) mkdirSync(guestDir, {recursive: true});
  const database = cloud ? require("./cloud-progress.cjs").createPostgresProgress(databaseUrl) : null;
  const handlers = new Map();
  const loginFailures = new Map();
  let audioRequests = 0;

  const sign = value => createHmac("sha256", config.secret).update(value).digest("base64url");

  function guest(request) {
    const cookie = (request.headers.cookie ?? "").split(";")
      .map(value => value.trim()).find(value => value.startsWith(cookieName + "="));
    const token = cookie?.slice(cookieName.length + 1);
    if (!token || token.length > 130) return null;
    const [id, expires, signature] = token.split(".");
    if (!/^[a-f0-9]{32}$/.test(id) || !/^\d{10}$/.test(expires ?? "")
        || Number(expires) <= Math.floor(Date.now() / 1000)) return null;
    return sameText(sign(id + "." + expires), signature) ? id : null;
  }

  function restrict(request, response, pathname) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    if (request.method === "POST" && request.headers.origin) {
      if (request.headers.origin !== "https://" + request.headers.host
          && request.headers.origin !== "http://" + request.headers.host) {
        sendJson(response, 403, {error: "이 사이트에서 직접 요청해 주세요."});
        return false;
      }
    }
    if (guest(request)) return true;
    if (pathname === "/access") return true;
    if (pathname.startsWith("/api/")) {
      sendJson(response, 401, {error: "초대 코드로 먼저 입장해 주세요."});
    } else {
      response.writeHead(303, {Location: "/access?next=" + encodeURIComponent(request.url)});
      response.end();
    }
    return false;
  }

  async function handleLogin(request, response) {
    if (request.method === "GET") {
      if (guest(request)) {
        response.writeHead(303, {Location: "/"});
        response.end();
        return;
      }
      response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
      response.end(loginPage);
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, {error:"지원하지 않는 요청입니다."});
      return;
    }
    const now = Date.now();
    for (const [key, entry] of loginFailures) if (entry.until <= now) loginFailures.delete(key);
    const forwarded = request.headers["x-forwarded-for"]?.split(",").at(-1)?.trim();
    const client = (cloud ? forwarded : request.headers["cf-connecting-ip"]) || request.socket.remoteAddress;
    const failure = loginFailures.get(client) ?? {count: 0, until: now + 5 * 60 * 1000};
    if (failure.count >= maxLoginsPerWindow) {
      sendJson(response, 429, {error:"잠시 후 다시 시도해 주세요."});
      return;
    }
    const data = await readAnswer(request);
    if (!sameText(data?.code, config.code)) {
      failure.count++;
      if (loginFailures.size < 1000 || loginFailures.has(client)) loginFailures.set(client, failure);
      sendJson(response, 403, {error:"초대 코드가 맞지 않습니다."});
      return;
    }
    loginFailures.delete(client);
    const token = randomBytes(16).toString("hex") + "." + (Math.floor(now / 1000) + lifetime);
    response.setHeader("Set-Cookie", cookieName + "=" + token + "." + sign(token)
      + "; Path=/; Max-Age=" + lifetime + "; HttpOnly; Secure; SameSite=Lax");
    sendJson(response, 200, {ok:true});
  }

  async function mock(request, response, pathname, query) {
    const id = guest(request);
    if (!id) {
      sendJson(response, 401, {error:"초대 코드로 먼저 입장해 주세요."});
      return;
    }
    async function dispatch() {
      if (database) {
        const staticRoute = pathname === "/mock" || pathname === "/api/mock/preview";
        const persistence = staticRoute ? {records: {}} : await database.open(id);
        return createMockHandler(bank, sendJson, {persistence})(request, response, pathname, query);
      }
      let handler = handlers.get(id);
      if (!handler) {
        handler = createMockHandler(bank, sendJson, {progressFile:join(guestDir, id + ".json")});
        handlers.set(id, handler);
      }
      return handler(request, response, pathname, query);
    }
    const audio = pathname === "/api/mock/preview" || pathname === "/api/mock/listen";
    if (!audio) return dispatch();
    if (audioRequests >= 2) {
      sendJson(response, 429, {error:"다른 청해 음성을 준비하는 중입니다. 잠시 후 다시 눌러 주세요."});
      return;
    }
    audioRequests++;
    try { await dispatch(); }
    finally { audioRequests--; }
  }

  return {restrict, handleLogin, mock};
}

module.exports = {createShareAccess};
