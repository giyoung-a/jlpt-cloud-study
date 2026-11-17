const { createHash } = require("node:crypto");
const { scenarioReview, quickReview } = require("./mock-review.cjs");

const profiles = {
  N1: { minutes: [110, 55], counts: [25, 20, 26, 30], pass: 100 },
  N2: { minutes: [105, 50], counts: [32, 22, 21, 32], pass: 90 },
  N3: { minutes: [30, 70, 40], counts: [35, 23, 16, 28], pass: 95 },
  N4: { minutes: [25, 55, 35], counts: [28, 23, 10, 28], pass: 90 },
  N5: { minutes: [20, 40, 30], counts: [22, 17, 6, 24], pass: 80 },
};
const labels = { vocabulary: "어휘", grammar: "문법", reading: "독해", listening: "청해" };
const names = ["田中", "山本", "佐藤", "森", "木村", "中村", "小林", "伊藤", "鈴木", "高橋"];
const venues = ["図書館", "市民会館", "美術館", "体育館", "公民館", "博物館", "交流センター", "大学", "駅前の広場"];
const subjects = ["写真", "料理", "音楽", "読書", "工作", "映画", "園芸", "絵画", "手芸", "歴史"];
const objects = ["かばん", "ノート", "傘", "辞書", "帽子", "切符", "水筒", "地図", "封筒", "手帳"];
const changes = ["設備の点検", "工事", "雨", "職員の研修", "電気工事", "交通規制"];
const topics = [
  ["地域のバス", "利用者の利便性", "運行にかかる費用", "利用者の要望を把握する", "便数を増やす"],
  ["図書館の電子化", "資料へのアクセス", "著作権の管理", "利用者の使い方を調べる", "全資料を電子化する"],
  ["在宅勤務", "移動時間の削減", "情報共有の難しさ", "職種ごとの課題を調べる", "毎日在宅勤務にする"],
  ["食品ロス対策", "廃棄物の削減", "衛生管理の負担", "店舗ごとの廃棄の原因を調べる", "寄付の量を増やす"],
  ["観光地の混雑対策", "観光客の分散", "住民への説明", "混雑が起こる時間帯を調べる", "入場者数を制限する"],
  ["職場の研修", "技能の向上", "日常業務への負担", "現場で必要な技能を確認する", "研修時間を増やす"],
  ["商店街の再開発", "地域経済の活性化", "既存の店舗への影響", "住民と店主の意見を聞く", "大型店を誘致する"],
  ["学校のタブレット導入", "教材の共有", "機器の保守", "授業での使い方を検討する", "全児童に同じ機器を配る"],
  ["災害時の情報発信", "避難の迅速化", "情報格差", "住民が使う媒体を確かめる", "情報をアプリだけで発信する"],
  ["美術館の企画展", "新しい来館者の獲得", "展示準備の費用", "来館者が求める展示を調査する", "開館時間を延ばす"],
  ["地域の交流会", "住民同士の交流", "運営の負担", "参加しやすい時間を調べる", "会場の数を増やす"],
  ["公共施設の予約制度", "予約手続きの簡略化", "電話への問い合わせの増加", "予約を諦めた人の理由を聞く", "オンライン予約だけにする"],
];

function random(seed) {
  let state = createHash("sha256").update(seed).digest().readUInt32LE();
  return (max) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return Math.floor(state / 4294967296 * max);
  };
}

function shuffle(items, next) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = next(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function scenario(kind, index, level, next, includeReview) {
  const pick = (items) => items[next(items.length)];
  const [place, secondPlace, thirdPlace, fourthPlace] = shuffle(venues, next);
  const [firstName, secondName] = shuffle(names, next);
  const [subject, alternative] = shuffle(subjects, next);
  const [object, extra, other, fourthObject] = shuffle(objects, next);
  const [firstHour, secondHour, thirdHour, fourthHour] = shuffle([9,10,11,12,13,14,15,16,17,18], next);
  const hour = (n) => n + "時";
  const times = [firstHour, secondHour, thirdHour, fourthHour].map(hour);
  const [firstTime, secondTime, thirdTime, fourthTime] = times;
  const day = 1 + next(27);
  const price = 100 * (2 + next(23));
  const change = pick(changes);
  const topicRow = pick(topics);
  const [topic, benefit, concern, improve, shortcut] = topicRow;
  const advanced = level <= 2;
  const formal = level <= 3;
  const prefix = kind === "listening" ? "会話を聞いて、質問に答えてください。" : "";
  const type = index % (formal ? 9 : 7);
  const context = {place, secondPlace, thirdPlace, fourthPlace, firstName, secondName, subject,
    object, extra, other, fourthObject, firstHour, secondHour, thirdHour, fourthHour,
    day, price, change, topicIndex: topics.indexOf(topicRow), formal, advanced};
  if (kind === "listening" && index % 5 === 0) {
    const lines = `「すみません。この${object}、ここに置いてもいいですか。」|はい、そこに置いてください。|はい、もう置きました。|いいえ、ここにはありません。|はい、ここへ来ました。
「${firstName}さん、窓を閉めてもらえますか。」|はい、今閉めます。|ええ、窓を閉めましたか。|はい、風が止みました。|いいえ、まだ開きませんでした。
「${secondPlace}までどうやって行きますか。」|駅前からバスに乗ります。|昨日の午後に着きました。|あそこは五時に閉まります。|入場料は百円です。
「約束の時間に遅れてすみません。」|大丈夫です。私も今来ました。|時間はもう決めました。|約束を忘れないでくださいました。|いいえ、まだ出発しませんか。
「${object}を貸してくれませんか。」|ええ、どうぞ使ってください。|ええ、もう返しました。|いいえ、借りてくださいました。|はい、そこに置かないでください。
「この${subject}講座、あとで申し込んでも間に合いますか。」|今日中でしたら大丈夫です。|受付は二階にあります。|講座の前に申し込みました。|いいえ、講座は面白かったです。
「この書類、念のため目を通していただけますか。」|承知しました。確認しておきます。|それなら提出先を決めました。|いいえ、用紙を追加します。|ええ、先ほど印刷が終わりました。
「予定を前倒しするという話、聞いていますか。」|ええ、来週の予定が今週になったそうです。|ええ、今週の予定が来月になったそうです。|いいえ、延期の手続きが終わりました。|はい、時間は変わらないそうです。
「${firstName}さん、先ほどの提案は保留ということでよろしいですか。」|はい。次の会議で改めて検討しましょう。|はい。もう正式に決定しました。|ええ。すぐに実施してください。|はい。提案どおり準備は完了しました。
「${topic}の件、結論は性急に出さないほうがよくありませんか。」|そうですね。資料をもう少し精査しましょう。|そうですね。資料を見る前に決めましょう。|ええ。とにかく今日中に結論を出しましょう。|ええ。もうご報告は不要です。`.split("\n");
    const eligible = level >= 4 ? lines.slice(0, 6) : level === 3 ? lines.slice(2, 9) : lines.slice(5);
    const line = pick(eligible);
    const [spoken, correct, ...wrong] = line.split("|");
    return {prompt: "発言を聞いて、最もよい返事を選んでください。",
      audio: spoken, answer: correct, distractors: wrong,
      review: includeReview ? quickReview(lines.indexOf(line), context) : undefined};
  }
  let text, prompt, answer, distractors;

  switch (type) {
    case 0:
      text = formal
        ? place + "で開催予定の" + subject + "講座は、" + change + "のため、会場を" + secondPlace + "に変更します。開始時刻は予定どおり" + firstTime + "です。" + thirdPlace + "では受け付けを行いません。"
        : subject + "のクラスは" + place + "ではありません。" + change + "があるので、" + secondPlace + "でします。時間は" + firstTime + "からです。";
      prompt = "講座はどこで行われますか。";
      answer = secondPlace; distractors = [place, thirdPlace, fourthPlace];
      break;
    case 1:
      text = "「" + secondName + "さん、" + day + "日の打ち合わせですが、" + firstTime + "は空いていますか。」「すみません、" + firstTime + "から別の予定があります。" + secondTime + "以降なら大丈夫です。」「では、" + thirdTime + "ではなく、" + secondTime + "にしましょう。」";
      prompt = "二人は何時に会いますか。";
      answer = secondTime; distractors = [firstTime, thirdTime, fourthTime];
      break;
    case 2:
      text = firstName + "さんへ。" + place + "に" + object + "を忘れました。今すぐ戻れないので、受付に届いているか聞いてください。もしなければ、私に連絡してください。私の家に来る必要はありません。";
      prompt = firstName + "さんは、まず何をしますか。";
      answer = "受付に聞く"; distractors = ["家に行く", "すぐに連絡する", "新しい" + object + "を買う"];
      break;
    case 3:
      text = place + "のお知らせです。" + day + "日の" + subject + "教室は参加費が" + price + "円です。事前に申し込んだ方は" + (price - 100) + "円です。小学生は無料です。" + secondName + "さんは大人で、昨日申し込みました。";
      prompt = secondName + "さんはいくら払いますか。";
      answer = (price - 100) + "円"; distractors = [price + "円", "無料", (price + 100) + "円"];
      break;
    case 4:
      text = "「" + object + "と" + extra + "を持ってきました。」「ありがとうございます。" + object + "はこちらに置いてください。" + extra + "は後で使うので、今はかばんに入れておいてください。" + other + "は机の上にあります。」";
      prompt = "今、こちらに置くものは何ですか。";
      answer = object; distractors = [extra, other, fourthObject];
      break;
    case 5:
      text = "きのう、" + firstName + "さんは" + subject + "の会に行くつもりでした。しかし、" + change + "で会は中止になりました。そこで、家の近くの店で" + object + "を買ってから、" + secondPlace + "へ行きました。";
      prompt = firstName + "さんは、店に行った後で何をしましたか。";
      answer = secondPlace + "へ行った"; distractors = [subject + "の会に行った", object + "を買った", "すぐ家に帰った"];
      break;
    case 6:
      text = formal
        ? "今回の" + subject + "講座について、参加者からは内容よりも開催時刻についての要望が目立ちました。資料は好評でしたが、仕事の後では開始に間に合わないという声が多かったため、次回は内容と資料を維持し、開始時刻を遅らせます。"
        : "先週、" + place + "で" + subject + "のクラスがありました。先生は親切でしたが、教室は小さかったです。次は大きい部屋を使います。先生は同じです。";
      prompt = formal ? "次回、何を変えますか。" : "次のクラスで変わるものは何ですか。";
      answer = formal ? "開始時刻" : "教室"; distractors = formal ? ["講座の内容", "配布資料", "参加者の人数"] : ["先生", "勉強すること", "学校の名前"];
      break;
    case 7:
      text = topic + "の改善について、" + firstName + "氏は「" + shortcut + "ことだけを決めるのは早い」と述べた。" + benefit + "という利点は認めているが、" + concern + "も無視できない。まず" + improve + "ことを提案している。";
      prompt = firstName + "氏が最初にすべきだと考えていることは何ですか。";
      answer = improve; distractors = [shortcut, concern + "を問題にしない", "計画そのものを中止する"];
      break;
    case 8:
      text = topic + "について、" + firstName + "さんは" + benefit + "を重視しています。一方、" + secondName + "さんは" + concern + "を理由に慎重です。二人は、いずれの案を選ぶにしても、先に" + improve + "ことが必要だという点では一致しました。";
      prompt = "二人の意見が一致した点は何ですか。";
      answer = improve; distractors = [shortcut, "直ちに方針を決定する", concern + "だけを考慮する"];
      break;
  }
  if (advanced && type < 6) {
    text = "次の案内は、" + day + "日付で関係者に共有されたものです。\n" + text;
  }
  return {
    prompt: kind === "listening" ? prefix : prompt, passage: kind === "reading" ? text : undefined,
    audio: kind === "listening" ? text + "\n質問。" + prompt : undefined,
    answer, distractors, review: includeReview ? scenarioReview(type, context) : undefined,
  };
}

function buildExam(bank, level, date, slot, translations) {
  const next = random("jlpt-mock-v1|" + level + "|" + date + "|" + slot);
  const profile = profiles[level];
  const categories = ["vocabulary", "grammar", "reading", "listening"];
  const questions = Object.fromEntries(categories.map((category, i) => {
    let items;
    if (i < 2) {
      items = shuffle(Object.entries(bank).filter(([, q]) => q.level === level && q.section === category), next)
        .slice(0, profile.counts[i]).map(([id, q]) => ({...q, review: translations ? bankReview(bank, translations, id, q) : undefined}));
    } else {
      const seen = new Set();
      items = Array.from({length: profile.counts[i]}, (_, index) => {
        let item;
        let key;
        let collision = 0;
        do {
          item = scenario(category, index + slot + collision * 7, Number(level[1]), next, Boolean(translations));
          collision++;
          key = JSON.stringify([item.passage, item.audio]);
        } while (seen.has(key));
        seen.add(key);
        return item;
      });
    }
    return [category, items.map((item, index) => ({
      id: category + "-" + (index + 1), category, prompt: item.prompt, passage: item.passage,
      audio: item.audio, choices: shuffle([item.answer, ...item.distractors], next), answer: item.answer,
      review: item.review && {...item.review, choiceTranslations: item.review.choiceTranslations && Object.fromEntries([item.answer, ...item.distractors].map((choice, i) => [choice, item.review.choiceTranslations[i]]))},
    }))];
  }));
  const structure = profile.minutes.length === 2
    ? [["어휘·문법·독해", ["vocabulary", "grammar", "reading"]], ["청해", ["listening"]]]
    : [["어휘", ["vocabulary"]], ["문법·독해", ["grammar", "reading"]], ["청해", ["listening"]]];
  return structure.map(([label, groups], i) => ({
    label, minutes: profile.minutes[i], questions: groups.flatMap(group => questions[group]),
  }));
}

function scoreExam(exam, answers, level) {
  const questions = exam.flatMap(section => section.questions);
  const scoreGroups = Number(level[1]) <= 3
    ? [["언어지식", ["vocabulary", "grammar"], 60, 19],
      ["독해", ["reading"], 60, 19], ["청해", ["listening"], 60, 19]]
    : [["언어지식·독해", ["vocabulary", "grammar", "reading"], 120, 38],
      ["청해", ["listening"], 60, 19]];
  const sections = scoreGroups.map(([label, categories, max, minimum]) => {
    const items = questions.filter(item => categories.includes(item.category));
    const correct = items.filter(item => answers[item.id] === item.answer).length;
    const score = Math.round(correct / items.length * max);
    return {label, score, max, minimum, correct, count: items.length, belowMinimum: score < minimum};
  });
  const total = sections.reduce((sum, section) => sum + section.score, 0);
  const passMark = profiles[level].pass;
  const belowMinimum = sections.some(section => section.belowMinimum);
  return {sections, total, passMark, belowMinimum, passed: !belowMinimum && total >= passMark};
}

function bankReview(bank, translations, id, item) {
  if (item.section === "grammar") {
    return {
      questionTranslation: "빈칸에 들어갈 가장 알맞은 문법 표현을 고르세요.",
      translation: translations[id], completedSentence: item.prompt.replace("（　）", item.answer),
      reason: item.explanation, source: item.source,
    };
  }
  const original = bank[id.replace(/-(?:meaning|kanji)$/, "")];
  const word = original.target + "（" + original.answer + "）";
  const meaning = original.explanation;
  const questionTranslation = id.endsWith("-kanji") ? "‘" + original.answer + "’에 해당하는 한자 표기를 고르세요."
    : id.endsWith("-meaning") ? "‘" + original.target + "’의 한국어 뜻을 고르세요."
    : "‘" + original.target + "’의 읽기를 고르세요.";
  return {questionTranslation, reason: word + "는 ‘" + meaning + "’이라는 뜻입니다. 표기는 "
    + original.target + ", 읽기는 " + original.answer + "입니다.", source: item.source};
}

function reviewExam(exam, answers) {
  const groups = Object.entries(labels).map(([id, label]) => ({id, label, total: 0, correct: 0, wrong: 0, blank: 0}));
  const mistakes = [];
  for (const section of exam) {
    for (const item of section.questions) {
      const group = groups.find(entry => entry.id === item.category);
      group.total++;
      const selected = answers[item.id] ?? null;
      if (selected === item.answer) {
        group.correct++;
        continue;
      }
      if (selected === null) group.blank++;
      else group.wrong++;
      const {choiceTranslations, ...detail} = item.review;
      mistakes.push({
        id: item.id, number: group.total, category: item.category, kind: group.label, prompt: item.prompt,
        passage: item.passage, transcript: item.audio, selected, answer: item.answer,
        choices: item.choices.map(value => ({value, translation: choiceTranslations?.[value]})), ...detail,
      });
    }
  }
  return {groups, mistakes};
}

function buildReadingPractice(level, date) {
  const next = random("jlpt-reading-practice-v1|" + level + "|" + date);
  const seen = new Set();
  return Array.from({length: 20}, (_, index) => {
    let item;
    let attempt = 0;
    do {
      item = scenario("reading", index + attempt, Number(level[1]), next, true);
      attempt++;
    } while (seen.has(item.passage));
    seen.add(item.passage);
    return {...item, id: "reading-" + (index + 1),
      choices: shuffle([item.answer, ...item.distractors], next)};
  });
}

module.exports = {profiles, labels, buildExam, scoreExam, reviewExam, buildReadingPractice};
