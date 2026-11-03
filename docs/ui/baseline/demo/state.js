/* 固定六人演示局面，仅用于交互原型，不连接正式规则引擎。 */
globalThis.TabletopDemo = {
  createState(scene = "normal") {
    const state = {
      hand: [
        "action_shoot",
        "action_unlock",
        "action_dream_transit",
        "action_kick",
        "action_dream_peek",
      ],
      players: [
        {
          id: "you",
          nickname: "你",
          card: "thief_space_queen",
          layer: 2,
          count: 5,
        },
        {
          id: "master",
          nickname: "暮雨",
          card: "dm_midsummer",
          layer: 2,
          count: 3,
        },
        {
          id: "apollo",
          nickname: "林间",
          card: "thief_apollo",
          layer: 2,
          count: 3,
        },
        {
          id: "tourist",
          nickname: "北辰",
          card: "thief_tourist",
          layer: 1,
          count: 4,
        },
        {
          id: "capricorn",
          nickname: "南山",
          card: "thief_capricornus",
          layer: 3,
          count: 3,
        },
        {
          id: "war",
          nickname: "星河",
          card: "thief_lord_of_war",
          layer: 4,
          count: 2,
        },
      ],
      locks: [0, 5, 4, 3, 2],
      deck: 117,
      vaults: [1, 2, 3, 4].map((layer) => ({
        layer,
        content: layer === 3 ? "secret" : "gold",
        opened: false,
        seenBy: [],
      })),
      phase: "play",
      activePlayer: "you",
      round: 5,
      winner: null,
      discarded: 3,
      played: [],
      pending: null,
      unlocked: false,
      log: ["第 5 回合，空间女王的出牌阶段。"],
    };
    if (scene === "peeked") state.vaults[2].seenBy.push("you");
    if (scene === "gold-ready") state.locks[2] = 1;
    if (scene === "secret-ready") {
      state.players[0].layer = 3;
      state.locks[3] = 1;
    }
    if (scene === "limbo") state.players[5].layer = 0;
    if (scene === "discard-ready") {
      state.phase = "discard";
      state.hand.push("action_shoot", "action_unlock");
      state.players[0].count = state.hand.length;
      state.deck -= 2;
    }
    return state;
  },

  advanceTurn(state) {
    if (state.pending || state.winner || state.phase === "discard")
      throw new Error("当前不能切换行动者");
    const next = structuredClone(state);
    next.phase = "play";
    const index = next.players.findIndex((p) => p.id === next.activePlayer);
    next.activePlayer = next.players[(index + 1) % next.players.length].id;
    if (next.activePlayer === "you") {
      next.round += 1;
      next.unlocked = false;
    }
    return next;
  },

  vaultView(state, layer, viewer = "you") {
    const vault = state.vaults.find((v) => v.layer === layer);
    if (!vault) throw new Error("不存在的梦境层");
    const visibility = vault.opened
      ? "public"
      : vault.seenBy.includes(viewer) || viewer === "master"
        ? "private"
        : "hidden";
    return {
      visibility,
      content: visibility === "hidden" ? null : vault.content,
    };
  },

  targetsFor(state, cardId) {
    const self = state.players[0];
    if (cardId === "action_shoot") {
      return state.players
        .filter((p) => p.id !== "you" && p.layer === self.layer)
        .map((p) => p.id);
    }
    if (cardId === "action_kick")
      return state.players
        .filter((p) => p.id !== "you" && p.layer > 0)
        .map((p) => p.id);
    if (cardId === "action_dream_peek")
      return state.vaults.filter((v) => !v.opened).map((v) => v.layer);
    if (cardId === "action_dream_transit")
      return [self.layer - 1, self.layer + 1].filter((l) => l >= 1 && l <= 4);
    return [];
  },

  playCard(state, cardId, target, handIndex = state.hand.indexOf(cardId)) {
    if (
      state.winner ||
      state.pending ||
      state.activePlayer !== "you" ||
      state.phase !== "play" ||
      !Number.isInteger(handIndex) ||
      state.hand[handIndex] !== cardId
    )
      throw new Error("当前不能打出这张牌");
    if (
      cardId !== "action_unlock" &&
      !this.targetsFor(state, cardId).includes(target)
    )
      throw new Error("目标不合法");
    if (
      cardId === "action_unlock" &&
      (state.unlocked || state.locks[state.players[0].layer] === 0)
    )
      throw new Error("本回合不能再次解锁");
    const next = structuredClone(state);
    next.hand.splice(handIndex, 1);
    next.players[0].count = next.hand.length;
    next.discarded += 1;
    next.played.push(cardId);
    if (cardId === "action_shoot") {
      next.pending = { target, rolled: false };
      next.log.unshift(
        `你对${next.players.find((p) => p.id === target).nickname}打出 SHOOT。`,
      );
    } else if (cardId === "action_unlock") {
      next.locks[next.players[0].layer] -= 1;
      next.unlocked = true;
      next.log.unshift(
        `无人抵消解封，第 ${next.players[0].layer} 层心锁减少至 ${next.locks[next.players[0].layer]}。`,
      );
      if (next.locks[next.players[0].layer] === 0) {
        const vault = next.vaults.find(
          (v) => v.layer === next.players[0].layer,
        );
        vault.opened = true;
        if (vault.content === "secret") next.winner = "thieves";
        next.log.unshift(
          vault.content === "secret"
            ? `第 ${vault.layer} 层秘密已开启，盗梦者阵营胜利。`
            : `第 ${vault.layer} 层金币金库已开启。演示中梦主放弃派发贿赂牌与发动梦魇。`,
        );
      }
    } else if (cardId === "action_dream_peek") {
      const vault = next.vaults.find((v) => v.layer === target);
      if (!vault.seenBy.includes("you")) vault.seenBy.push("you");
      next.log.unshift(
        `你已查看第 ${target} 层金库，仅你可见；演示中梦主放弃派发贿赂牌。`,
      );
    } else if (cardId === "action_dream_transit") {
      next.players[0].layer = target;
      next.log.unshift(`你使用梦境穿梭剂，移动到第 ${target} 层。`);
    } else {
      const other = next.players.find((p) => p.id === target);
      [next.players[0].layer, other.layer] = [
        other.layer,
        next.players[0].layer,
      ];
      next.log.unshift(`你使用 KICK，与${other.nickname}交换梦境层数。`);
    }
    return next;
  },

  discardCards(state, indexes) {
    const required = Math.max(0, state.hand.length - 5);
    if (
      state.phase !== "discard" ||
      state.activePlayer !== "you" ||
      state.winner ||
      state.pending ||
      !required
    )
      throw new Error("当前不能弃牌");
    if (
      indexes.length !== required ||
      new Set(indexes).size !== required ||
      indexes.some(
        (index) =>
          !Number.isInteger(index) || index < 0 || index >= state.hand.length,
      )
    )
      throw new Error("请选择恰好需要弃掉的牌");
    const next = structuredClone(state);
    next.hand = next.hand.filter((_, index) => !indexes.includes(index));
    next.players[0].count = next.hand.length;
    next.discarded += required;
    next.phase = "complete";
    next.log.unshift(
      `你弃掉了 ${required} 张牌，剩余 5 张手牌。弃牌阶段完成。`,
    );
    return next;
  },

  rollShot(state) {
    if (!state.pending || state.pending.rolled)
      throw new Error("当前没有等待掷骰的 SHOOT");
    const next = structuredClone(state);
    next.pending.rolled = true;
    next.log.unshift("演示掷骰结果为 4，出牌者选择目标移动到的相邻层。");
    return next;
  },

  finishShot(state, layer) {
    if (!state.pending?.rolled) throw new Error("需要先掷骰");
    const target = state.players.find((p) => p.id === state.pending.target);
    if (Math.abs(target.layer - layer) !== 1 || layer < 1 || layer > 4)
      throw new Error("只能移动到相邻梦境层");
    const next = structuredClone(state);
    next.players.find((p) => p.id === target.id).layer = layer;
    next.pending = null;
    next.log.unshift(
      `${target.nickname}移动到第 ${layer} 层。SHOOT 结算完成。`,
    );
    return next;
  },
};
