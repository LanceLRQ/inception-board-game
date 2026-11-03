import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { URL } from "node:url";
import "./state.js";
import "./cards.js";

const demo = globalThis.TabletopDemo;
test("SHOOT 必须同层、先掷骰再移动，出牌只消耗一次", () => {
  const original = demo.createState();
  assert.throws(() => demo.playCard(original, "action_shoot", "war"));
  assert.throws(() => demo.playCard(original, "action_shoot", "you"));
  const pending = demo.playCard(original, "action_shoot", "master");
  assert.equal(original.hand.length, 5);
  assert.equal(pending.hand.length, 4);
  assert.throws(() => demo.playCard(pending, "action_unlock"));
  assert.throws(() => demo.finishShot(pending, 3));
  const rolled = demo.rollShot(pending);
  assert.throws(() => demo.rollShot(rolled));
  assert.throws(() => demo.finishShot(rolled, 4));
  const settled = demo.finishShot(rolled, 3);
  assert.equal(settled.players[1].layer, 3);
  assert.equal(settled.pending, null);
  assert.equal(settled.discarded, 4);
});
test("窥视仅向本人展示内容，不减心锁、不公开，也不触发秘密胜利", () => {
  const original = demo.createState();
  assert.deepEqual(demo.vaultView(original, 3), {
    visibility: "hidden",
    content: null,
  });
  const peeked = demo.playCard(original, "action_dream_peek", 3);
  assert.deepEqual(demo.vaultView(peeked, 3), {
    visibility: "private",
    content: "secret",
  });
  assert.deepEqual(demo.vaultView(peeked, 3, "apollo"), {
    visibility: "hidden",
    content: null,
  });
  assert.equal(peeked.locks[3], original.locks[3]);
  assert.equal(peeked.winner, null);
  assert.equal(peeked.vaults[2].opened, false);
  assert.equal(peeked.hand.length, 4);
  assert.equal(original.vaults[2].seenBy.length, 0);
  assert.ok(!peeked.log[0].includes("秘密"));
  assert.throws(() => demo.playCard(original, "action_dream_peek", 0));
});
test("金币开启后公开，秘密开启后保留公开牌面并禁止继续出牌", () => {
  const gold = demo.playCard(demo.createState("gold-ready"), "action_unlock");
  assert.equal(gold.locks[2], 0);
  assert.deepEqual(demo.vaultView(gold, 2, "apollo"), {
    visibility: "public",
    content: "gold",
  });
  assert.equal(gold.winner, null);
  assert.throws(() => demo.playCard(gold, "action_dream_peek", 2));
  const secret = demo.playCard(
    demo.createState("secret-ready"),
    "action_unlock",
  );
  assert.equal(secret.locks[3], 0);
  assert.deepEqual(demo.vaultView(secret, 3, "apollo"), {
    visibility: "public",
    content: "secret",
  });
  assert.equal(secret.winner, "thieves");
  assert.throws(() => demo.playCard(secret, "action_dream_transit", 2));
  assert.equal(demo.vaultView(secret, 1).content, null);
});
test("局面切换可重置私密信息，迷失层玩家不可成为普通行动目标", () => {
  assert.equal(
    demo.vaultView(demo.createState("peeked"), 3).visibility,
    "private",
  );
  assert.equal(demo.vaultView(demo.createState(), 3).visibility, "hidden");
  const lost = demo.createState("limbo");
  assert.equal(lost.players.find((p) => p.id === "war").layer, 0);
  assert.ok(!demo.targetsFor(lost, "action_kick").includes("war"));
});
test("穿梭后目标更新，KICK 交换层数，解封只减当前层心锁", () => {
  let state = demo.playCard(demo.createState(), "action_dream_transit", 3);
  assert.deepEqual(demo.targetsFor(state, "action_shoot"), ["capricorn"]);
  state = demo.playCard(state, "action_kick", "tourist");
  assert.equal(state.players[0].layer, 1);
  assert.equal(state.players[3].layer, 3);
  state = demo.playCard(state, "action_unlock");
  assert.equal(state.locks[1], 4);
  assert.equal(state.locks[2], 4);
  assert.throws(() => demo.playCard(state, "action_unlock"));
  assert.equal(
    state.deck +
      state.discarded +
      state.players.reduce((n, p) => n + p.count, 0),
    140,
  );
});
test("所有原型卡图保持原始文件内容，全文存在且行动牌含完整解析", () => {
  for (const card of Object.values(globalThis.PROTOTYPE_CARDS)) {
    const file = new URL(card.image, import.meta.url);
    assert.ok(existsSync(file), card.image);
    assert.equal(
      createHash("sha256").update(readFileSync(file)).digest("hex"),
      card.sha256,
    );
    assert.ok(card.fullText.length > 25, card.id);
    if (card.category === "action" && card.id !== "action_back") {
      for (const field of [
        "数量：",
        "使用时机：",
        "使用目标：",
        "发动效果：",
        "解析：",
      ])
        assert.ok(card.fullText.includes(field), `${card.id}: ${field}`);
    }
  }
});

test("行动轮转循环回到本人，等待结算及终局不能换人，他人回合不能出牌", () => {
  const original = demo.createState();
  let next = demo.advanceTurn(original);
  assert.equal(original.activePlayer, "you");
  assert.equal(next.activePlayer, "master");
  assert.throws(() => demo.playCard(next, "action_unlock"));
  const ids = [next.activePlayer];
  for (let i = 0; i < 5; i++) {
    next = demo.advanceTurn(next);
    ids.push(next.activePlayer);
  }
  assert.deepEqual(ids, [
    "master",
    "apollo",
    "tourist",
    "capricorn",
    "war",
    "you",
  ]);
  assert.deepEqual(next.players, original.players);
  assert.deepEqual(next.hand, original.hand);
  assert.deepEqual(next.vaults, original.vaults);
  assert.equal(next.round, 6);
  assert.throws(() =>
    demo.advanceTurn(demo.playCard(original, "action_shoot", "master")),
  );
  assert.throws(() =>
    demo.advanceTurn(
      demo.playCard(demo.createState("secret-ready"), "action_unlock"),
    ),
  );
});

test("分类图鉴覆盖全部原版牌面和九章说明书，原图与源文件逐字节相同", async () => {
  await import("./guide.js");
  const guide = globalThis.TABLETOP_GUIDE;
  const source = JSON.parse(
    readFileSync(
      new URL("../../reference/assets/cards-data.json", import.meta.url),
      "utf8",
    ),
  );
  const expected = new Set(
    Object.values(source.cards).flatMap((group) =>
      group.flatMap((card) =>
        (card.sides ?? [card]).map(
          (side) =>
            `game/packages/client/public/${side.image.replace(/\.jpg$/, ".webp")}`,
        ),
      ),
    ),
  );
  assert.deepEqual(
    new Set(Object.values(guide.cards).map((card) => card.source)),
    expected,
  );
  assert.equal(Object.keys(guide.cards).length, 103);
  for (const card of Object.values(guide.cards)) {
    const bytes = readFileSync(new URL(card.image, import.meta.url));
    assert.deepEqual(
      bytes,
      readFileSync(new URL(`../../../../${card.source}`, import.meta.url)),
      card.name,
    );
    assert.ok(card.fullText.trim().length > 0, card.name);
  }
  assert.equal(guide.chapters.length, 9);
  for (const chapter of guide.chapters)
    assert.ok(chapter.text.length > 100, chapter.name);
});

test("弃牌阶段按具体牌位多选，必须恰好弃至五张且不触发牌效", () => {
  const original = demo.createState("discard-ready");
  assert.equal(original.phase, "discard");
  assert.equal(original.hand.length, 7);
  assert.equal(
    original.deck +
      original.discarded +
      original.players.reduce((n, p) => n + p.count, 0),
    140,
  );
  for (const indexes of [[], [0], [0, 1, 2], [0, 0], [-1, 1], [0, 7], [0, 1.5]])
    assert.throws(() => demo.discardCards(original, indexes));
  assert.throws(() => demo.playCard(original, "action_unlock"));
  assert.throws(() => demo.advanceTurn(original));
  const next = demo.discardCards(original, [5, 6]);
  assert.equal(original.hand.length, 7);
  assert.deepEqual(next.hand, original.hand.slice(0, 5));
  assert.equal(next.players[0].count, 5);
  assert.equal(next.discarded, original.discarded + 2);
  assert.deepEqual(next.locks, original.locks);
  assert.deepEqual(next.played, []);
  assert.equal(next.phase, "complete");
  assert.throws(() => demo.discardCards(next, [0, 1]));
  assert.throws(() => demo.playCard(next, "action_unlock"));
  assert.equal(demo.advanceTurn(next).phase, "play");
});

test("同名牌独立选择和消耗，弃牌动作受阶段、回合与终局限制", () => {
  const hand = demo.createState("discard-ready");
  const play = { ...hand, phase: "play" };
  const next = demo.playCard(play, "action_shoot", "master", 5);
  assert.deepEqual(
    next.hand,
    play.hand.filter((_, index) => index !== 5),
  );
  assert.throws(() => demo.playCard(play, "action_shoot", "master", 1));
  assert.throws(() => demo.discardCards(play, [0, 1]));
  assert.throws(() =>
    demo.discardCards({ ...hand, activePlayer: "master" }, [0, 1]),
  );
  assert.throws(() =>
    demo.discardCards({ ...hand, winner: "thieves" }, [0, 1]),
  );
  assert.throws(() =>
    demo.discardCards({ ...hand, pending: { target: "master" } }, [0, 1]),
  );
});
