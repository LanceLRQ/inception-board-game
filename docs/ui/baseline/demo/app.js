(() => {
  const guide = globalThis.TABLETOP_GUIDE;
  const cards = { ...guide.cards, ...globalThis.PROTOTYPE_CARDS };
  const categories = {
    tutorial: "入门与规则",
    action: "行动牌",
    thief: "盗梦者",
    "dream-master": "梦主",
    dream: "梦境牌",
    vault: "金库牌",
    bribe: "贿赂牌",
    nightmare: "梦魇牌",
    other: "道具与配置",
  };
  let guideCategory = "tutorial";
  let guideCurrent = null;
  let guideListScroll = 0;
  let guideZoomScroll = 0;
  const demo = globalThis.TabletopDemo;
  const $ = (selector) => document.querySelector(selector);
  const layerNames = ["迷失层", "第一层", "第二层", "第三层", "第四层"];
  const shortDescriptions = {
    action_shoot: "向同层的另一位玩家发起攻击，由目标玩家掷骰决定结果。",
    action_unlock: "解开所在层的一道心锁，或抵消另一张用于解锁的解封。",
    action_dream_transit: "穿过梦境的边界，移动到相邻的另一层。",
    action_kick: "与另一位玩家交换所在的梦境层。",
    action_dream_peek:
      "查看任意未开启的金库，结果仅你可见；演示中梦主不派发贿赂牌。",
  };
  let state = demo.createState();
  let selected = null;
  let selectedIndexes = [];
  let target = null;
  let busy = false;
  let dicePreview = false;
  let flipped = {};
  let tooltipAnchor = null;
  let touchTip = null;
  const systemMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactScreen = window.matchMedia(
    "(max-width: 600px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)",
  );
  let reduced = systemMotion.matches;

  function setMotion(value) {
    reduced = value;
    document.documentElement.dataset.reduced = String(value);
    $("#motion-toggle").setAttribute("aria-pressed", String(value));
    if (value)
      document.getAnimations().forEach((animation) => animation.finish());
  }

  function setBusy(value) {
    busy = value;
    $("#reset").disabled = value;
    $("#dice-preview").disabled = value;
    $("#board-demo").disabled = value;
    $("#next-turn").disabled =
      value ||
      Boolean(state.pending) ||
      Boolean(state.winner) ||
      state.phase === "discard";
    $("#play-card").disabled =
      value ||
      Boolean(state.winner) ||
      state.activePlayer !== "you" ||
      state.phase === "complete" ||
      (!state.pending &&
        (!selected ||
          (state.phase === "discard"
            ? selectedIndexes.length !== Math.max(0, state.hand.length - 5)
            : selected === "action_unlock" &&
              (state.unlocked || state.locks[state.players[0].layer] === 0))));
    $("#inspect-card").disabled = value || !selected;

    document.querySelectorAll(".hand-card").forEach((button) => {
      button.disabled =
        value || Boolean(state.pending) || Boolean(state.winner);
    });
  }

  async function playMotion(element, frames, duration) {
    if (reduced || document.hidden) return;
    await element.animate(frames, {
      duration,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "none",
    }).finished;
  }

  function render() {
    hidePlayerTip();
    const self = state.players[0];
    const activeIndex = state.players.findIndex(
      (p) => p.id === state.activePlayer,
    );
    const orderedPlayers = [
      ...state.players.slice(activeIndex),
      ...state.players.slice(0, activeIndex),
    ];
    $("#players").innerHTML = orderedPlayers
      .map(
        (p) =>
          `<button class="player" data-active="${p.id === state.activePlayer && !state.winner}" data-self="${p.id === "you"}" data-master="${p.id === "master"}" data-detail="${p.card}" aria-label="查看${p.nickname}的${cards[p.card].name}完整说明"><img src="${cards[p.card].image}" alt="${cards[p.card].name}原版角色牌" width="42" height="58" /><span class="player-copy"><span class="player-name">${p.nickname}${p.id === "master" ? "·梦主" : ""}${p.id === state.activePlayer && !state.winner ? '<small class="turn-label">行动中</small>' : ""}</span><span class="player-role">${cards[p.card].name}</span><span class="player-meta"><span>${p.layer} 层</span><span>手牌 ${p.count}</span></span></span></button>`,
      )
      .join("");
    $("#board-subtitle").textContent = state.winner
      ? "秘密已开启 · 对局结束"
      : `你在${layerNames[self.layer]}`;
    $("#game-result").hidden = !state.winner;
    $("#game-result").innerHTML = state.winner
      ? "<strong>秘密已开启 · 盗梦者阵营胜利</strong><span>终局牌桌保留，可继续翻看金库。</span>"
      : "";
    $(".round-status").innerHTML = state.winner
      ? '<span class="status-dot"></span>对局结束<span class="muted">盗梦者阵营胜利</span>'
      : `<span class="status-dot"></span>${orderedPlayers[0].nickname}的回合<span class="muted">第 ${state.round} 回合<span class="round-phase"> · ${state.activePlayer === "you" ? (state.phase === "discard" ? "弃牌阶段" : state.phase === "complete" ? "弃牌完成" : "出牌阶段") : "轮转演示"}</span></span>`;
    $("#layers").innerHTML = [1, 2, 3, 4]
      .map((layer) => {
        const occupants = state.players.filter((p) => p.layer === layer);
        const view = demo.vaultView(state, layer);
        const visible = Boolean(flipped[layer]) && !compactScreen.matches;
        const status =
          view.visibility === "public"
            ? "已开启 · 公开"
            : view.visibility === "private"
              ? "已查看 · 仅你可见"
              : "未查看";
        const cardId = view.content ? `vault_${view.content}` : "vault_back";
        const count = state.locks[layer];
        const shortStatus =
          view.visibility === "public"
            ? "已公开"
            : view.visibility === "private"
              ? "仅你可见"
              : "未查看";
        return `<div class="layer" data-layer="${layer}" data-current="${self.layer === layer}" data-vault-state="${view.visibility}">
          <button class="layer-art" data-vault-layer="${layer}" data-flipped="${visible}" ${compactScreen.matches ? 'aria-haspopup="dialog"' : `aria-pressed="${visible}"`} aria-label="查看${layerNames[layer]}金库：${status}；剩余 ${count} 道心锁">
          <span class="layer-flipper">
          <span class="card-face layer-surface" aria-hidden="${visible}"><span class="layer-texture" aria-hidden="true">${"<span></span>".repeat(8)}</span><span class="layer-number"><img src="assets/layers/number-${layer}.webp" alt="${layerNames[layer]}" /></span></span>
          <span class="card-face card-reverse" aria-hidden="${!visible}"><img src="${cards[cardId].image}" alt="${view.content ? cards[cardId].name : "未查看的金库背面"}" width="745" height="1040" /></span></span></button>
          <span class="heart-lock" role="img" aria-label="${layerNames[layer]}剩余 ${count} 道心锁"><span class="lock-die" data-count="${count}">${count ? facePips[count].map((position) => `<i style="grid-area:${Math.floor((position - 1) / 3) + 1}/${((position - 1) % 3) + 1}"></i>`).join("") : "0"}</span></span>
          <span class="vault-status" title="${status}"><span class="mobile-vault-name">${view.content ? cards[cardId].name : "金库"}</span>${shortStatus}</span><button class="layer-info" data-detail="${view.content ? cardId : `dream_${layer}`}" aria-label="查看${layerNames[layer]}${view.content ? "金库说明" : "梦境规则"}">说明</button>
          <div class="layer-occupants">${occupants.map((p) => `<button class="occupant" data-self="${p.id === "you"}" data-player="${p.id}" aria-label="${p.nickname}，${cards[p.card].name}，位于${layerNames[layer]}${p.id === state.activePlayer && !state.winner ? "，当前行动者" : ""}"><img class="portrait" src="${p.id === "master" ? cards[p.card].image : `assets/portraits/${p.card}.webp`}" alt="" />${p.id === state.activePlayer && !state.winner ? '<span class="active-player-dot" aria-hidden="true"></span>' : ""}</button>`).join("")}</div></div>`;
      })
      .join("");
    const lost = state.players.filter((p) => p.layer === 0);
    $("#limbo-players").hidden = !lost.length;
    $("#limbo-players").innerHTML =
      `<strong>迷失层 · 待复活</strong>${lost.map((p) => `<button class="occupant" data-player="${p.id}" aria-label="${p.nickname}，迷失层，待复活"><img class="portrait" src="assets/portraits/${p.card}.webp" alt="" /></button>`).join("")}`;
    $("#hand").innerHTML = state.hand.length
      ? state.hand
          .map(
            (id, index) =>
              `<button class="hand-card" data-select="${id}" data-hand-index="${index}" aria-pressed="${selectedIndexes.includes(index)}" aria-label="选择第 ${index + 1} 张手牌：${cards[id].name}，再次点击取消" style="--tilt:${(index - (state.hand.length - 1) / 2) * 2}deg"><img src="${cards[id].image}" alt="${cards[id].name}原版行动牌" width="745" height="1040" /><span class="card-label">${cards[id].name}</span></button>`,
          )
          .join("")
      : '<div class="hand-empty"><strong>手牌已打完</strong><span>重置演示，再体验一次牌桌。</span><button class="secondary-button" data-reset>重置演示</button></div>';
    $("#hand-count").textContent = `${state.hand.length} 张`;
    $("#hand").dataset.wrapped = String(state.hand.length > 5);
    $(".pile strong").innerHTML = `${state.deck} <small>/ 140</small>`;
    $("#discard-count").innerHTML = `${state.discarded} <small>张</small>`;
    $("#played-cards").innerHTML = state.played.length
      ? state.played
          .map(
            (id) =>
              `<button class="played-thumbnail" data-detail="${id}" aria-label="查看已打出的${cards[id].name}"><img src="${cards[id].image}" alt="${cards[id].name}" /></button>`,
          )
          .join("")
      : '<span class="empty-caption">尚未出牌</span>';
    updateSelection();
    centerCurrentLayer();
  }

  function centerCurrentLayer() {
    if (compactScreen.matches) {
      $("#layers").scrollLeft = 0;
      return;
    }
    const current = $(".layer[data-current='true']");
    if (current)
      $("#layers").scrollLeft =
        current.offsetLeft -
        ($("#layers").clientWidth - current.offsetWidth) / 2;
  }

  function updateSelection() {
    selected = state.hand[selectedIndexes.at(-1)] ?? null;
    document
      .querySelectorAll("[data-hand-index]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(selectedIndexes.includes(Number(button.dataset.handIndex))),
        ),
      );
    const card = cards[selected];
    const discarding = state.phase === "discard";
    const required = Math.max(0, state.hand.length - 5);
    $("#selection-content").innerHTML = card
      ? `<button class="selection-art" data-detail="${selected}" aria-label="查看${card.name}原卡与完整解析"><img src="${card.image}" alt="${card.name}原卡" /><span>点击解析</span></button><h3 class="selected-name">${card.name}</h3><p class="selected-description">${shortDescriptions[selected]}</p><span class="rule-label">使用目标</span><p class="rule-value">${card.target}</p>${selected === "action_shoot" ? '<dl class="dice-outcomes"><dt>1 点</dt><dd>目标死亡</dd><dt>2–4 点</dt><dd>移动到相邻层</dd><dt>5–6 点</dt><dd>无效果</dd></dl>' : `<span class="rule-label">使用时机</span><p class="rule-value">${card.timing}</p>`}`
      : '<h3 class="selected-name">选一张手牌</h3><p class="selected-description">这里显示卡牌介绍与完整解析。游戏流程和全部卡牌可在下方说明书中查阅。</p>';
    $("#selection-type").textContent = card ? "行动牌" : "尚未选择";
    $("#hand-phase").textContent = discarding
      ? `弃牌阶段 · 需弃 ${required} 张`
      : state.phase === "complete"
        ? "弃牌完成"
        : "出牌阶段";
    $("#hand-selection-actions").hidden = !selected && !state.pending;
    $("#inspect-card").hidden = !selected;
    $("#play-card").textContent = state.winner
      ? "对局已结束"
      : state.phase === "complete"
        ? "本回合已结束"
        : state.activePlayer !== "you"
          ? "等待你的回合"
          : state.pending
            ? state.pending.rolled
              ? "选择移动层"
              : "继续掷骰"
            : discarding
              ? `弃掉所选 ${selectedIndexes.length} 张`
              : card
                ? `打出 ${card.name}`
                : "打出";
    $("#action-help").textContent = state.winner
      ? "秘密已公开，可以继续查阅牌桌。"
      : state.activePlayer !== "you"
        ? "当前为其他玩家行动。"
        : state.pending
          ? "SHOOT 尚未结算，请继续掷骰或选择移动层。"
          : state.phase === "complete"
            ? "已保留 5 张手牌，弃牌完成。"
            : discarding
              ? `需弃 ${required} 张 · 已选 ${selectedIndexes.length} 张${selectedIndexes.length > required ? "，请取消多选的牌" : ""}`
              : !card
                ? "点选手牌后操作，再点一次取消。"
                : selected === "action_unlock"
                  ? state.unlocked
                    ? "本回合已经成功解锁过。"
                    : state.locks[state.players[0].layer] === 0
                      ? "本层金库已经开启。"
                      : "心锁减少 1；归零后公开金库。"
                  : selected === "action_dream_peek"
                    ? "选择未开启的金库，查看结果仅你可见。"
                    : selected === "action_dream_transit"
                      ? "选择相邻的梦境层。"
                      : "选择目标玩家后确认出牌。";
    setBusy(busy);
  }

  function renderGuide() {
    if (!$("#guide-categories").children.length) {
      for (const [id, name] of Object.entries(categories)) {
        const count =
          id === "tutorial"
            ? guide.chapters.length
            : Object.values(guide.cards).filter((card) => card.category === id)
                .length;
        $("#guide-categories").insertAdjacentHTML(
          "beforeend",
          `<button class="text-button" data-category="${id}" aria-pressed="false"><span>${name}</span><small>${count}</small></button>`,
        );
        $("#guide-category").add(new Option(`${name} · ${count}`, id));
      }
    }
    document
      .querySelectorAll("#guide-categories [data-category]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.category === guideCategory),
        ),
      );
    $("#guide-category").value = guideCategory;
    const query = $("#guide-search").value.trim().toLocaleLowerCase();
    const chapters = guideCategory === "tutorial";
    const kind = chapters ? "chapter" : "card";
    const matches = (
      chapters
        ? guide.chapters
        : Object.values(guide.cards)
            .sort(
              (a, b) => Number(a.name === "背面") - Number(b.name === "背面"),
            )
            .filter((card) => card.category === guideCategory)
    ).filter((item) =>
      `${item.name} ${chapters ? item.text : item.fullText}`
        .toLocaleLowerCase()
        .includes(query),
    );
    $("#guide-list").innerHTML = matches.length
      ? matches
          .map(
            (item) =>
              `<button class="guide-item" data-guide-item="${item.id}" data-guide-kind="${kind}" aria-pressed="false" aria-label="阅读${item.name}${chapters ? "章节" : "完整解析"}">${chapters ? `<span class="guide-item-number">${guide.chapters.indexOf(item) + 1}</span>` : `<img loading="lazy" src="${item.image}" alt="" width="38" height="54" />`}<span class="guide-item-copy">${item.name}${chapters ? "" : `<small>${item.fullText.match(/所属角色：([^\n]+)/)?.[1] || categories[item.category]}</small>`}</span></button>`,
          )
          .join("")
      : '<div class="guide-empty"><strong>没有匹配内容</strong>试试其他关键词，或切换分类。</div>';
    $("#guide-count").textContent =
      `${matches.length} 个${chapters ? "章节" : "牌面"}${query ? " · 搜索结果" : ""}`;
    $("#guide-list").scrollTop = 0;
    guideListScroll = 0;
    $("#guide-dialog").dataset.view = "list";
    if (matches.length) {
      const current = matches.find(
        (item) => guideCurrent?.kind === kind && item.id === guideCurrent.id,
      );
      readGuideItem((current || matches[0]).id, kind, false);
    } else {
      guideCurrent = null;
      $("#guide-content").innerHTML =
        '<div class="guide-empty"><strong>没有匹配内容</strong>搜索范围为当前分类，原版规则和其他卡牌仍可从分类中查阅。</div>';
      $("#guide-location").textContent = categories[guideCategory];
      $("#guide-zoom").hidden = true;
    }
  }

  function readGuideItem(id, kind, openReader = true) {
    const content = $("#guide-content");
    if (guideCurrent?.id !== id || guideCurrent.kind !== kind) {
      const item =
        kind === "chapter"
          ? guide.chapters.find((chapter) => chapter.id === id)
          : cards[id];
      guideCurrent = { id, kind };
      content.replaceChildren();
      content.dataset.zoomed = "false";
      const title = document.createElement("h2");
      title.id = "guide-reader-title";
      title.tabIndex = -1;
      title.textContent = item.name;
      const body = document.createElement("div");
      body.className = "guide-reader-body";
      if (kind === "card") {
        const art = document.createElement("figure");
        art.className = "guide-reader-art";
        const image = document.createElement("img");
        image.src = item.image;
        image.alt = `${item.name}完整原版卡图`;
        art.append(image);
        const text = document.createElement("div");
        text.className = "full-rules";
        text.textContent = item.fullText;
        body.append(art, text);
      } else {
        const article = document.createElement("article");
        article.className = "full-rules guide-chapter";
        for (const block of item.text.split(/\n\s*\n/)) {
          if (block.trim().startsWith("|")) {
            const wrap = document.createElement("div");
            wrap.className = "guide-table";
            wrap.tabIndex = 0;
            wrap.setAttribute("aria-label", "规则表格，可横向滚动");
            const table = document.createElement("table");
            for (const line of block
              .split("\n")
              .filter((line) => !/^[\s|:-]+$/.test(line))) {
              const row = table.insertRow();
              for (const cell of line
                .trim()
                .replace(/^\||\|$/g, "")
                .split("|"))
                row.insertCell().textContent = cell.trim();
            }
            wrap.append(table);
            article.append(wrap);
          } else {
            const paragraph = document.createElement(
              /^#{1,4} /.test(block) ? "h3" : "p",
            );
            paragraph.textContent = block.replace(/^#{1,4} /, "");
            article.append(paragraph);
          }
        }
        body.append(article);
      }
      const note = document.createElement("p");
      note.className = "source-note";
      note.textContent =
        "文字与原卡来自项目保存的说明书和卡牌资料。图鉴不显示本局隐藏牌的分布。";
      content.append(title, body, note);
      $("#guide-location").textContent =
        `${categories[guideCategory]} · ${item.name}`;
      $("#guide-zoom").hidden = kind !== "card";
      $("#guide-zoom").textContent = "放大原卡";
      $("#guide-zoom").setAttribute("aria-pressed", "false");
      content.scrollTop = 0;
    }
    document
      .querySelectorAll(".guide-item")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.guideItem === id),
        ),
      );
    if (openReader) {
      guideListScroll = $("#guide-list").scrollTop;
      $("#guide-dialog").dataset.view = "read";
      $("#guide-reader-title").focus({ preventScroll: true });
    }
  }

  function openDetails(id) {
    hidePlayerTip();
    const card = cards[id];
    $("#detail-name").textContent = card.name;
    $("#detail-category").textContent = categories[card.category];
    $("#detail-text").textContent = card.fullText;
    $("#detail-image").src = card.image;
    $("#detail-image").alt = `${card.name}完整原版卡图`;
    $(".detail-art").classList.remove("zoomed");
    $("#zoom-card").textContent = "放大原卡";
    $("#zoom-card").setAttribute("aria-pressed", "false");
    $("#detail-dialog").showModal();
    $("#detail-dialog").scrollTop = 0;
  }

  function showPlayerTip(button) {
    const player = state.players.find((p) => p.id === button.dataset.player);
    const tip = $("#player-tooltip");
    if (tooltipAnchor && tooltipAnchor !== button)
      tooltipAnchor.removeAttribute("aria-describedby");
    tooltipAnchor = button;
    button.setAttribute("aria-describedby", "player-tooltip");
    tip.textContent = `${player.nickname} · ${cards[player.card].name}${player.id === "master" ? "（梦主）" : ""}\n${layerNames[player.layer]} · 手牌 ${player.count}${player.layer === 0 ? " · 待复活" : player.id === state.activePlayer && !state.winner ? " · 行动中" : ""}${window.matchMedia("(hover: none)").matches ? "\n再次点按头像查看完整原卡" : "\n点击查看完整原卡"}`;
    tip.hidden = false;
    const rect = button.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, rect.left + rect.width / 2 - tip.offsetWidth / 2))}px`;
    tip.style.top = `${Math.max(8, rect.top - tip.offsetHeight - 8)}px`;
  }

  function hidePlayerTip() {
    $("#player-tooltip").hidden = true;
    tooltipAnchor?.removeAttribute("aria-describedby");
    tooltipAnchor = null;
    touchTip = null;
  }

  function preparePlay() {
    if (busy || state.winner || state.activePlayer !== "you") return;
    if (state.pending) {
      openDice(false);
      return;
    }
    if (!selected || state.phase === "complete") return;
    if (state.phase === "discard") {
      if (selectedIndexes.length !== Math.max(0, state.hand.length - 5)) return;
      state = demo.discardCards(state, selectedIndexes);
      selectedIndexes = [];
      render();
      $("#event-text").textContent = state.log[0];
      $("#hand-title").focus({ preventScroll: true });
      return;
    }
    if (selected === "action_unlock") {
      commitPlay(undefined);
      return;
    }
    target = null;
    const targets = demo.targetsFor(state, selected);
    const transit = selected === "action_dream_transit";
    const peek = selected === "action_dream_peek";
    $("#target-title").textContent = peek
      ? "选择要窥视的金库"
      : transit
        ? "选择要前往的梦境"
        : "选择出牌目标";
    $("#target-description").textContent =
      `${cards[selected].name} · ${cards[selected].target}`;
    $("#target-options").innerHTML =
      transit || peek
        ? targets
            .map(
              (layer) =>
                `<button class="target-option" data-target-layer="${layer}" aria-pressed="false"><img src="assets/dream_${layer}.webp" alt="${layerNames[layer]}原卡" /><span>${layerNames[layer]}<small>${peek ? "查看金库，仅你可见" : "与当前层相邻"}</small></span></button>`,
            )
            .join("")
        : state.players
            .filter((p) => p.id !== "you")
            .map(
              (p) =>
                `<button class="target-option" data-target-player="${p.id}" aria-pressed="false" ${targets.includes(p.id) ? "" : "disabled"}><img src="${cards[p.card].image}" alt="${cards[p.card].name}" /><span>${p.nickname} · ${cards[p.card].name}<small>${layerNames[p.layer]}${targets.includes(p.id) ? " · 可选择" : " · 不同层，不能选择"}</small></span></button>`,
            )
            .join("");
    $("#confirm-target").disabled = true;
    $("#target-dialog").showModal();
  }

  async function commitPlay(chosenTarget) {
    if (busy || state.winner || state.activePlayer !== "you" || !selected)
      return;
    const id = selected;
    const cardElement = document.querySelector(
      `[data-hand-index="${selectedIndexes[0]}"] img`,
    );
    const start = cardElement.getBoundingClientRect();
    if ($("#target-dialog").open) $("#target-dialog").close();
    const next = demo.playCard(state, id, chosenTarget, selectedIndexes[0]);
    setBusy(true);
    $("#event-text").textContent = `你打出了 ${cards[id].name}。`;
    const end = $("#played-area").getBoundingClientRect();
    const flight = document.createElement("img");
    flight.src = cards[id].image;
    flight.alt = "";
    flight.className = "flying-card";
    flight.style.cssText = `left:${start.left}px;top:${start.top}px;width:${start.width}px;height:${start.height}px`;
    document.body.append(flight);
    const dx = end.left + end.width / 2 - start.left - start.width / 2;
    const dy = end.top + end.height / 2 - start.top - start.height / 2;
    await playMotion(
      flight,
      [
        { transform: "translate(0,0) rotateY(0) scale(1)", opacity: 1 },
        {
          transform: `translate(${dx * 0.65}px,${dy * 0.6}px) rotateY(-12deg) scale(1.15)`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: `translate(${dx}px,${dy}px) rotateY(0) scale(.35)`,
          opacity: 0.65,
        },
      ],
      650,
    );
    flight.remove();
    const revealLayer =
      id === "action_dream_peek"
        ? chosenTarget
        : next.vaults.find(
            (vault, index) => vault.opened && !state.vaults[index].opened,
          )?.layer;
    if (revealLayer) flipped[revealLayer] = true;
    state = next;
    selectedIndexes = [];
    busy = false;
    render();
    $("#event-text").textContent = state.log[0];
    if (revealLayer && !compactScreen.matches)
      await playMotion(
        document.querySelector(`[data-layer="${revealLayer}"] .layer-flipper`),
        [{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }],
        420,
      );
    if (state.pending) openDice(false);
    else {
      const currentLayer = document.querySelector(
        `[data-layer="${state.players[0].layer}"]`,
      );
      await playMotion(
        currentLayer,
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-8px)" },
          { transform: "translateY(0)" },
        ],
        360,
      );
      $("#hand-title").focus({
        preventScroll: true,
      });
    }
  }

  function openDice(preview) {
    if (busy) return;
    dicePreview = preview;
    const pending = !preview && state.pending;
    const player = pending
      ? state.players.find((p) => p.id === pending.target)
      : null;
    $("#dice-title").textContent = player
      ? `${player.nickname}的掷骰`
      : "掷一次，进入梦境";
    $("#dice-description").textContent = player
      ? "SHOOT 已打出，由目标玩家掷骰。"
      : "体验立体翻滚与结果停留。";
    $("#die").style.transform = "rotateX(-16deg) rotateY(24deg)";
    $("#die").setAttribute("aria-label", "立体骰子，等待掷骰");
    $("#dice-result").textContent = "准备掷骰";
    $("#dice-destinations").innerHTML = "";
    $("#roll-dice").hidden = false;
    $("#roll-dice").disabled = false;
    $("#roll-dice").textContent = "掷骰";
    $("#dice-dialog").showModal();
    if (pending?.rolled) showDiceResult();
  }

  function showDiceResult() {
    $("#die").style.transform = "rotateX(0deg) rotateY(90deg)";
    $("#die").setAttribute("aria-label", "骰子结果：4 点");
    $("#dice-result").textContent = "4 点";
    $("#roll-dice").hidden = !dicePreview;
    if (dicePreview) {
      $("#dice-description").textContent = "演示结果已停留，可再次播放。";
      $("#roll-dice").textContent = "再掷一次";
    } else {
      const player = state.players.find((p) => p.id === state.pending.target);
      $("#dice-description").textContent =
        `由你选择${player.nickname}移动到的相邻层。`;
      $("#dice-destinations").innerHTML = [player.layer - 1, player.layer + 1]
        .filter((layer) => layer >= 1 && layer <= 4)
        .map(
          (layer) =>
            `<button class="secondary-button" data-shot-layer="${layer}">前往${layerNames[layer]}</button>`,
        )
        .join("");
    }
  }

  async function rollDice() {
    if (busy) return;
    setBusy(true);
    $("#roll-dice").disabled = true;
    $("#dice-result").textContent = "骰子翻滚中";
    const close = $("#dice-dialog [data-close]");
    close.disabled = true;
    await playMotion(
      $("#die"),
      [
        { transform: "translateY(0) rotateX(-16deg) rotateY(24deg)" },
        {
          transform: "translateY(-28px) rotateX(290deg) rotateY(325deg)",
          offset: 0.35,
        },
        { transform: "translateY(0) rotateX(720deg) rotateY(810deg)" },
      ],
      1050,
    );
    if (!dicePreview) state = demo.rollShot(state);
    showDiceResult();
    close.disabled = false;
    setBusy(false);
    $("#roll-dice").disabled = false;
    updateSelection();
  }

  async function finishShot(layer) {
    state = demo.finishShot(state, layer);
    $("#dice-dialog").close();
    render();
    $("#event-text").textContent = state.log[0];
    await playMotion(
      document.querySelector(`[data-layer="${layer}"]`),
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-8px)" },
        { transform: "translateY(0)" },
      ],
      360,
    );
    $("#hand-title").focus({
      preventScroll: true,
    });
  }

  function reset(scene = "normal") {
    if (busy) return;
    document
      .querySelectorAll("dialog[open]")
      .forEach((dialog) => dialog.close());
    state = demo.createState(scene);
    flipped = {};
    selectedIndexes = [];
    render();
    $("#event-text").textContent =
      scene === "discard-ready"
        ? "从 7 张手牌中选出 2 张弃掉，保留 5 张。"
        : scene === "peeked"
          ? "你已查看第三层金库，点击层数卡翻看；其他玩家仍看不到内容。"
          : scene === "gold-ready" || scene === "secret-ready"
            ? "本层只剩 1 道心锁，打出解封查看金库开启效果。"
            : "点击层数卡翻看金库；头像表示所在玩家。";
    $(".board-panel").scrollTop = 0;
  }

  const facePips = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };
  $("#die").innerHTML = Object.entries(facePips)
    .map(
      ([face, pips]) =>
        `<span class="die-face" data-face="${face}" aria-hidden="true">${pips.map((position) => `<span class="pip" style="grid-area:${Math.floor((position - 1) / 3) + 1}/${((position - 1) % 3) + 1}"></span>`).join("")}</span>`,
    )
    .join("");
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) {
      hidePlayerTip();
      return;
    }
    if (button.dataset.player) {
      if (window.matchMedia("(hover: none)").matches && touchTip !== button) {
        touchTip = button;
        showPlayerTip(button);
      } else {
        openDetails(
          state.players.find((p) => p.id === button.dataset.player).card,
        );
      }
      return;
    }
    hidePlayerTip();
    if (button.dataset.detail) openDetails(button.dataset.detail);
    if (button.dataset.category && button.dataset.category !== guideCategory) {
      guideCategory = button.dataset.category;
      $("#guide-search").value = "";
      renderGuide();
    }
    if (button.dataset.guideItem)
      readGuideItem(button.dataset.guideItem, button.dataset.guideKind);
    if (button.dataset.select && !busy && !state.pending && !state.winner) {
      const index = Number(button.dataset.handIndex);
      selectedIndexes = selectedIndexes.includes(index)
        ? selectedIndexes.filter((value) => value !== index)
        : state.phase === "discard"
          ? [...selectedIndexes, index]
          : [index];
      updateSelection();
      $("#event-text").textContent = selected
        ? state.phase === "discard"
          ? `已选择 ${selectedIndexes.length} 张待弃手牌。`
          : `已选择 ${cards[selected].name}。${compactScreen.matches ? "" : shortDescriptions[selected]}`
        : "已取消选牌。";
    }
    if (button.dataset.close) $(`#${button.dataset.close}`).close();
    if (button.hasAttribute("data-reset")) reset();
    if (button.dataset.scene) reset(button.dataset.scene);
    if (button.dataset.vaultLayer && !busy) {
      const layer = Number(button.dataset.vaultLayer);
      const view = demo.vaultView(state, layer);
      if (compactScreen.matches) {
        openDetails(view.content ? `vault_${view.content}` : "vault_back");
        $("#detail-category").textContent =
          `${layerNames[layer]} · ${view.visibility === "hidden" ? "未查看，只展示背面" : view.visibility === "private" ? "梦境窥视 · 仅你可见" : "金库已公开"}`;
        return;
      }
      flipped[layer] = !flipped[layer];
      button.dataset.flipped = String(flipped[layer]);
      button.setAttribute("aria-pressed", String(flipped[layer]));
      button
        .querySelector(".card-face")
        .setAttribute("aria-hidden", String(flipped[layer]));
      button
        .querySelector(".card-reverse")
        .setAttribute("aria-hidden", String(!flipped[layer]));
      $("#event-text").textContent =
        view.visibility === "hidden"
          ? "你尚未查看此金库，翻面只能看到背面。可使用梦境窥视。"
          : view.visibility === "private"
            ? "这是你通过梦境窥视记住的金库内容，仅你可见，不代表已经开启。"
            : "该金库已公开开启，所有玩家可见。";
    }
    if (button.dataset.targetPlayer || button.dataset.targetLayer) {
      target =
        button.dataset.targetPlayer ?? Number(button.dataset.targetLayer);
      document
        .querySelectorAll(".target-option")
        .forEach((option) =>
          option.setAttribute("aria-pressed", String(option === button)),
        );
      $("#confirm-target").disabled = false;
    }
    if (button.dataset.shotLayer) finishShot(Number(button.dataset.shotLayer));
  });
  document.addEventListener("pointerover", (event) => {
    const button = event.target.closest("[data-player]");
    if (button && event.pointerType !== "touch") showPlayerTip(button);
  });
  document.addEventListener("pointerout", (event) => {
    if (
      tooltipAnchor &&
      !tooltipAnchor.contains(event.relatedTarget) &&
      event.pointerType !== "touch"
    )
      hidePlayerTip();
  });
  document.addEventListener("focusin", (event) => {
    const button = event.target.closest("[data-player]");
    if (button) showPlayerTip(button);
  });
  document.addEventListener("focusout", hidePlayerTip);
  document.addEventListener("scroll", hidePlayerTip, true);
  window.addEventListener("resize", () => {
    hidePlayerTip();
    centerCurrentLayer();
  });
  compactScreen.addEventListener("change", () => {
    document.querySelectorAll("[data-vault-layer]").forEach((button) => {
      const visible =
        !compactScreen.matches && Boolean(flipped[button.dataset.vaultLayer]);
      button.dataset.flipped = String(visible);
      button
        .querySelector(".card-face")
        .setAttribute("aria-hidden", String(visible));
      button
        .querySelector(".card-reverse")
        .setAttribute("aria-hidden", String(!visible));
      if (compactScreen.matches) {
        button.removeAttribute("aria-pressed");
        button.setAttribute("aria-haspopup", "dialog");
      } else {
        button.removeAttribute("aria-haspopup");
        button.setAttribute("aria-pressed", String(visible));
      }
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hidePlayerTip();
  });
  $("#play-card").addEventListener("click", preparePlay);
  $("#inspect-card").addEventListener("click", () => {
    if (selected) openDetails(selected);
  });
  $("#confirm-target").addEventListener("click", () => commitPlay(target));
  for (const id of ["#read-card", "#mobile-read"]) {
    $(id).addEventListener("click", () => {
      if (!$("#guide-categories").children.length) renderGuide();
      $("#guide-dialog").showModal();
    });
  }
  $("#guide-search").addEventListener("input", renderGuide);
  $("#guide-category").addEventListener("change", (event) => {
    guideCategory = event.target.value;
    $("#guide-search").value = "";
    renderGuide();
  });
  $("#guide-back").addEventListener("click", () => {
    $("#guide-dialog").dataset.view = "list";
    $("#guide-list").scrollTop = guideListScroll;
    $(".guide-item[aria-pressed='true']")?.focus({ preventScroll: true });
  });
  $("#guide-zoom").addEventListener("click", () => {
    const content = $("#guide-content");
    const zoomed = content.dataset.zoomed !== "true";
    if (zoomed) guideZoomScroll = content.scrollTop;
    content.dataset.zoomed = String(zoomed);
    $("#guide-zoom").textContent = zoomed ? "还原原卡" : "放大原卡";
    $("#guide-zoom").setAttribute("aria-pressed", String(zoomed));
    content.scrollTop = zoomed ? 0 : guideZoomScroll;
  });
  $("#next-turn").addEventListener("click", async () => {
    if (busy || state.pending || state.winner) return;
    setBusy(true);
    hidePlayerTip();
    const list = $("#players");
    const first = list.firstElementChild;
    const distance = list.children[1].offsetTop - first.offsetTop;
    const copy = first.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    copy.tabIndex = -1;
    list.append(copy);
    $(".players-window").scrollTop = 0;
    await playMotion(
      list,
      [
        { transform: "translateY(0)" },
        { transform: `translateY(-${distance}px)` },
      ],
      480,
    );
    state = demo.advanceTurn(state);
    selectedIndexes = [];
    busy = false;
    render();
    $("#event-text").textContent =
      `轮到${state.players.find((p) => p.id === state.activePlayer).nickname}行动。轮转演示不执行自动出牌或抽牌。`;
  });
  $("#reset").addEventListener("click", () => reset());
  $("#board-demo").addEventListener("click", () =>
    $("#scene-dialog").showModal(),
  );
  $("#dice-preview").addEventListener("click", () => openDice(!state.pending));
  $("#roll-dice").addEventListener("click", rollDice);
  $("#motion-toggle").addEventListener("click", () => setMotion(!reduced));
  systemMotion.addEventListener("change", (event) => setMotion(event.matches));
  $("#zoom-card").addEventListener("click", () => {
    const zoomed = $(".detail-art").classList.toggle("zoomed");
    $("#zoom-card").textContent = zoomed ? "还原原卡" : "放大原卡";
    $("#zoom-card").setAttribute("aria-pressed", String(zoomed));
  });
  $("#dice-dialog").addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden)
      document.getAnimations().forEach((animation) => animation.finish());
  });
  document.addEventListener(
    "error",
    (event) => {
      if (event.target instanceof HTMLImageElement) {
        event.target.alt = `${event.target.alt}（图片未加载，可阅读完整说明）`;
      }
    },
    true,
  );
  setMotion(reduced);
  render();
  if (window.location.hash === "#guide") {
    renderGuide();
    $("#guide-dialog").showModal();
  }
})();
