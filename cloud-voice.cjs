const { execFile } = require("node:child_process");
const { mkdtemp, writeFile, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { promisify } = require("node:util");

const execute = promisify(execFile);

async function linuxSpeech(text) {
  const directory = await mkdtemp(join(tmpdir(), "jlpt-voice-"));
  const input = join(directory, "text.txt");
  const output = join(directory, "audio.wav");
  try {
    await writeFile(input, text, "utf8");
    await execute("open_jtalk", [
      "-x", "/var/lib/mecab/dic/open-jtalk/naist-jdic",
      "-m", "/usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice",
      "-s", "24000", "-p", "120", "-ow", output, input,
    ], { timeout: 15000 });
    const wav = await readFile(output);
    if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") throw new Error("Invalid Open JTalk WAV");
    return wav;
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

module.exports = {linuxSpeech};
