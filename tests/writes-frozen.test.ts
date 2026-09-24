/**
 * AE_WRITES_FROZEN proofs. The flag is set only in this process.
 * Nothing here talks to live portal.benjohnson.ai or a database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";

const root = process.cwd();

process.env.DATABASE_URL ??= "postgresql://aecoach:aecoach@127.0.0.1:1/aecoach?schema=public";
process.env.NEXTAUTH_SECRET ??= "writes-frozen-fixture-secret";
process.env.GROK_API_KEY ??= "fixture-not-a-real-key";

type CronHandler = (req: Request) => Promise<Response>;
type QuizHandler = (req: Request, ctx: { params: { token: string } }) => Promise<Response>;

let middleware: (req: NextRequest) => Promise<Response>;
let matcher: string;
let quizScheduleGet: CronHandler;
let quizSchedulePost: CronHandler;
let weeklyBriefGet: CronHandler;
let quizGet: QuizHandler;
let quizSubmit: QuizHandler;
let prisma: {
  recurringQuizSchedule: { findMany: (...args: unknown[]) => Promise<unknown> };
  adHocQuiz: {
    findUnique: (...args: unknown[]) => Promise<unknown>;
    create: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
  };
  user: {
    findMany: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
  };
  answerSet: { create: (...args: unknown[]) => Promise<unknown> };
  answer: { create: (...args: unknown[]) => Promise<unknown> };
};

const calls = {
  scheduleFind: 0,
  quizCreate: 0,
  quizFind: 0,
  quizUpdate: 0,
  userFind: 0,
  userUpdate: 0,
  answerSetCreate: 0,
  answerCreate: 0,
};

function resetCalls() {
  for (const key of Object.keys(calls) as Array<keyof typeof calls>) calls[key] = 0;
}

function installStubs() {
  prisma.recurringQuizSchedule.findMany = async () => {
    calls.scheduleFind += 1;
    return [];
  };
  prisma.adHocQuiz.findUnique = async () => {
    calls.quizFind += 1;
    return null;
  };
  prisma.adHocQuiz.create = async () => {
    calls.quizCreate += 1;
    throw new Error("frozen path inserted an AdHocQuiz");
  };
  prisma.adHocQuiz.update = async () => {
    calls.quizUpdate += 1;
    throw new Error("frozen path updated an AdHocQuiz");
  };
  prisma.user.findMany = async () => {
    calls.userFind += 1;
    return [];
  };
  prisma.user.update = async () => {
    calls.userUpdate += 1;
    throw new Error("frozen path updated a user");
  };
  prisma.answerSet.create = async () => {
    calls.answerSetCreate += 1;
    throw new Error("frozen path inserted an AnswerSet");
  };
  prisma.answer.create = async () => {
    calls.answerCreate += 1;
    throw new Error("frozen path inserted an Answer");
  };
}

const savedFlag = process.env.AE_WRITES_FROZEN;

function setFlag(value: string | undefined) {
  if (value === undefined) delete process.env.AE_WRITES_FROZEN;
  else process.env.AE_WRITES_FROZEN = value;
}

function req(url: string, method = "GET") {
  return new NextRequest(url, { method });
}

before(async () => {
  const mw = await import("../src/middleware");
  middleware = mw.middleware;
  matcher = mw.config.matcher[0];
  const schedules = await import("../src/app/api/cron/run-quiz-schedules/route");
  quizScheduleGet = schedules.GET;
  quizSchedulePost = schedules.POST;
  const briefs = await import("../src/app/api/cron/run-weekly-briefs/route");
  weeklyBriefGet = briefs.GET;
  const quiz = await import("../src/app/api/quiz/[token]/route");
  quizGet = quiz.GET;
  const submit = await import("../src/app/api/quiz/[token]/submit/route");
  quizSubmit = submit.POST;
  const db = await import("../src/lib/prisma");
  prisma = db.prisma as unknown as typeof prisma;
  installStubs();
});

after(() => {
  setFlag(savedFlag);
});

describe("AE_WRITES_FROZEN=1", { concurrency: false }, () => {
  before(() => {
    setFlag("1");
    resetCalls();
    installStubs();
  });

  it("returns 503 for non-GET handlers", async () => {
    const cases = [
      ["POST", "http://portal.local/api/intake/save"],
      ["PUT", "http://portal.local/api/questions/q1"],
      ["PATCH", "http://portal.local/api/user/profile"],
      ["DELETE", "http://portal.local/api/tasks/t1"],
      ["POST", "http://portal.local/api/set-password"],
      ["POST", "http://portal.local/api/quiz/tok/submit"],
    ] as const;
    for (const [method, url] of cases) {
      const res = await middleware(req(url, method));
      assert.equal(res.status, 503, `${method} ${url}`);
      const body = await res.json();
      assert.equal(body.error, "AE writes are frozen");
    }
  });

  it("returns 503 for cron GETs and does not insert a quiz", async () => {
    for (const url of [
      "http://portal.local/api/cron/run-quiz-schedules",
      "http://portal.local/api/cron/run-weekly-briefs",
    ]) {
      const res = await middleware(req(url, "GET"));
      assert.equal(res.status, 503, url);
    }

    resetCalls();
    const schedule = await quizScheduleGet(new Request("http://portal.local/api/cron/run-quiz-schedules"));
    assert.equal(schedule.status, 503);
    const schedulePost = await quizSchedulePost(
      new Request("http://portal.local/api/cron/run-quiz-schedules", { method: "POST" }),
    );
    assert.equal(schedulePost.status, 503);
    assert.equal(calls.scheduleFind, 0);
    assert.equal(calls.quizCreate, 0);
    assert.equal(calls.quizUpdate, 0);

    const briefs = await weeklyBriefGet(new Request("http://portal.local/api/cron/run-weekly-briefs"));
    assert.equal(briefs.status, 503);
    assert.equal(calls.userFind, 0);
    assert.equal(calls.userUpdate, 0);
  });

  it("returns 503 for quiz submit and does not insert answers", async () => {
    resetCalls();
    const viaMiddleware = await middleware(req("http://portal.local/api/quiz/tok/submit", "POST"));
    assert.equal(viaMiddleware.status, 503);

    const res = await quizSubmit(
      new Request("http://portal.local/api/quiz/tok/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: [{ questionId: "q1", value: "a" }] }),
      }),
      { params: { token: "tok" } },
    );
    assert.equal(res.status, 503);
    assert.equal(calls.quizFind, 0);
    assert.equal(calls.answerSetCreate, 0);
    assert.equal(calls.answerCreate, 0);
    assert.equal(calls.quizUpdate, 0);
    assert.equal(calls.quizCreate, 0);
  });

  it("still serves other GETs, login, and static assets", async () => {
    const quizRead = await middleware(req("http://portal.local/api/quiz/tok", "GET"));
    assert.notEqual(quizRead.status, 503);
    assert.equal(quizRead.headers.get("x-middleware-next"), "1");

    const dashboard = await middleware(req("http://portal.local/dashboard", "GET"));
    assert.notEqual(dashboard.status, 503);
    assert.equal(dashboard.status, 307);
    assert.match(dashboard.headers.get("location") ?? "", /\/login/);

    const loginGet = await middleware(req("http://portal.local/login", "GET"));
    assert.notEqual(loginGet.status, 503);
    assert.equal(loginGet.headers.get("x-middleware-next"), "1");

    const loginPost = await middleware(req("http://portal.local/api/auth/callback/credentials", "POST"));
    assert.notEqual(loginPost.status, 503);
    assert.equal(loginPost.headers.get("x-middleware-next"), "1");

    const favicon = await middleware(req("http://portal.local/favicon.ico", "GET"));
    assert.notEqual(favicon.status, 503);
    const chunk = await middleware(req("http://portal.local/_next/static/chunks/main.js", "GET"));
    assert.notEqual(chunk.status, 503);
    assert.match(matcher, /_next\/static/);
    assert.match(matcher, /favicon\.ico/);

    resetCalls();
    const directQuizGet = await quizGet(new Request("http://portal.local/api/quiz/tok"), { params: { token: "tok" } });
    assert.equal(directQuizGet.status, 404);
    assert.equal(calls.quizFind, 1);
    assert.equal(calls.quizCreate, 0);
    assert.equal(calls.answerSetCreate, 0);
  });
});

describe("AE_WRITES_FROZEN unset", { concurrency: false }, () => {
  before(() => {
    setFlag(undefined);
    resetCalls();
    installStubs();
  });

  it("does not 503, and cron and quiz handlers keep their current behavior", async () => {
    for (const value of [undefined, "", "0", "true", "yes"] as const) {
      setFlag(value);
      const post = await middleware(req("http://portal.local/api/intake/save", "POST"));
      assert.notEqual(post.status, 503, `flag ${value ?? "unset"}`);
      assert.equal(post.status, 307);
      const cron = await middleware(req("http://portal.local/api/cron/run-quiz-schedules", "GET"));
      assert.notEqual(cron.status, 503, `cron flag ${value ?? "unset"}`);
    }

    setFlag(undefined);
    process.env.CRON_SECRET = "fixture-cron-secret";
    resetCalls();
    const authed = new Request("http://portal.local/api/cron/run-quiz-schedules", {
      headers: { authorization: "Bearer fixture-cron-secret" },
    });
    const schedule = await quizScheduleGet(authed);
    assert.equal(schedule.status, 200);
    const body = await schedule.json();
    assert.equal(body.schedulesChecked, 0);
    assert.equal(calls.scheduleFind, 1);
    assert.equal(calls.quizCreate, 0);

    const briefs = await weeklyBriefGet(
      new Request("http://portal.local/api/cron/run-weekly-briefs", {
        headers: { authorization: "Bearer fixture-cron-secret" },
      }),
    );
    assert.equal(briefs.status, 200);
    const briefBody = await briefs.json();
    assert.equal(briefBody.candidates, 0);
    assert.equal(calls.userFind, 1);
    assert.equal(calls.userUpdate, 0);

    const submit = await quizSubmit(
      new Request("http://portal.local/api/quiz/missing/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: [{ questionId: "q1", value: "a" }] }),
      }),
      { params: { token: "missing" } },
    );
    assert.equal(submit.status, 404);
    assert.equal(calls.quizFind, 1);
    assert.equal(calls.answerSetCreate, 0);
    delete process.env.CRON_SECRET;
  });
});

describe("banner and operator note", () => {
  it("renders the frozen banner from the app layout", () => {
    const layout = readFileSync(path.join(root, "src/app/(app)/layout.tsx"), "utf8");
    assert.match(layout, /process\.env\["AE_WRITES_FROZEN"\] === "1"/);
    assert.match(layout, /data-writes-frozen="1"/);
    assert.match(layout, /role="status"/);
    assert.match(layout, /Writes are paused/);
  });

  it("tells the operator to stop the AE cron sidecar in the same freeze step", () => {
    const doc = readFileSync(path.join(root, "docs/CURRENT_STATE.md"), "utf8");
    assert.match(
      doc,
      /The operator stops the AE cron sidecar in the same freeze step as setting `AE_WRITES_FROZEN=1`/,
    );
  });
});
