/* 原卡与规则来自项目现有素材；出处与文件校验值随条目保存。 */
globalThis.PROTOTYPE_CARDS = {
  thief_space_queen: {
    id: "thief_space_queen",
    name: "空间女王",
    category: "thief",
    image: "assets/thief_space_queen.webp",
    fullText:
      "交错：当另一位玩家成功解锁时，你可以从牌库顶抽1张牌。\n\n造物：任意玩家的弃牌阶段，你可以把1张手牌放置到牌库顶。\n\n解析：【造物】可以在关键时刻控制玩家抽上来的手牌。例如将1张【梦境穿梭剂】放置到牌库顶上帮助同伴，也可以用同样的方式回报对手。",
    description: "",
    timing: "",
    target: "",
    source:
      "game/packages/client/public/cards/thief/盗梦都市_角色牌_盗梦者_空间女王.webp",
    sha256: "600c8adf3896de68db42cbe6715e86ecb939f8585cac2e265b95cc956dc21f51",
  },
  thief_apollo: {
    id: "thief_apollo",
    name: "阿波罗",
    category: "thief",
    image: "assets/thief_apollo.webp",
    fullText:
      "崇拜：你的出牌阶段，你可以选择一位拥有贿赂牌的盗梦者，随机抽取该盗梦者的1张牌加入你的手牌。回合限1次\n\n日冕：在你的回合，你可以视为拥有梦主的技能。\n\n解析：【日冕】是只有在你自己的回合你才视为拥有梦主的技能，因此某些如水星·航路被动技能除非别人在你的回合抵消你的【解封】，否则几乎无法被触发的。",
    description: "",
    timing: "",
    target: "",
    source:
      "game/packages/client/public/cards/thief/盗梦都市_角色牌_盗梦者_阿波罗.webp",
    sha256: "f532081c83abf63c68a058ec184a589a25e8a07adcfe162e5c793d504027f99e",
  },
  thief_tourist: {
    id: "thief_tourist",
    name: "穿行者",
    category: "thief",
    image: "assets/thief_tourist.webp",
    fullText:
      "支助：你的出牌阶段，可以将所有手牌（最少1张）给予另一位玩家，然后你移动到该玩家的所在层。\n\n解析：假设你现在处于第一层梦境，手牌中没有【梦境穿梭剂】，你想移动到第四层梦境，可以将所有手牌给予一位处于第四层梦境的玩家，然后移动到第四层梦境。启动技能时，最少要有1张手牌，否则无法发动此技能。",
    description: "",
    timing: "",
    target: "",
    source:
      "game/packages/client/public/cards/thief/盗梦都市_角色牌_盗梦者_穿行者.webp",
    sha256: "56b13e21dac78783e67a75783916a7c9cf9741a2f2a7dff679e53c5d2f0c80d3",
  },
  thief_lord_of_war: {
    id: "thief_lord_of_war",
    name: "战争之王",
    category: "thief",
    image: "assets/thief_lord_of_war.webp",
    fullText:
      "黑市：你的出牌阶段，你可以弃掉2张手牌，然后将弃牌堆里的1张牌收为手牌。回合限1次\n\n解析：战争之王能够拥有任何想要的牌，但是必须时刻确保弃牌堆里的牌有些什么。",
    description: "",
    timing: "",
    target: "",
    source:
      "game/packages/client/public/cards/thief/盗梦都市_角色牌_盗梦者_战争之王.webp",
    sha256: "7cdfe747677aba5cb0679651bb230d25a30d250a35144a970488ffd3d142128f",
  },
  thief_capricornus: {
    id: "thief_capricornus",
    name: "摩羯",
    category: "thief",
    image: "assets/thief_capricornus.webp",
    fullText:
      "节奏：若你手牌数大于等于所在层数字，则你使用的SHOOT类牌不受层数限制且解锁的次数不受限制。\n\n解析：若你手牌数为3，在第三层梦境，即使你之前已经成功解锁一次，也可以发动【节奏】继续打出【解封】进行解锁。若依旧成功，你的手牌数为2，便不能在第3层使用【解封】，不过如果此时因为其他原因去到数字更小的层，依旧可以打出【解封】进行解锁。",
    description: "",
    timing: "",
    target: "",
    source:
      "game/packages/client/public/cards/thief/盗梦都市_角色牌_盗梦者_摩羯.webp",
    sha256: "3dd43fe9dd66823071f85121a33411dc59f85faca0884b83ecf632ec03c70f04",
  },
  dm_midsummer: {
    id: "dm_midsummer",
    name: "盛夏",
    category: "dream-master",
    image: "assets/dm_midsummer.webp",
    fullText:
      "充盈：你的抽牌阶段，你每拥有1张未派发的贿赂牌则多抽1张牌。\n\n盛夏：所有盗梦者抽牌阶段的抽牌数量加1。\n\n解析：如开始梦主拥有3张贿赂牌则抽牌阶段抽5张牌，若派发出1张给予盗梦者则减少一张，即在抽牌阶段抽4张牌。所有盗梦者，在不使用技能的情况下，同于世界观的影响，他们在抽牌阶段都能抽3张牌。\n\n梦主的四大优势\n由于梦主于游戏中，在人数对比上已经极其不利，所以必然有特殊效果来增加与盗梦者角逐的本钱。\n一．游戏中始终拥有【M4卡宾枪】，将它置于自己面前。\n【M4卡宾枪】是1个特殊效果道具，它的效果是当梦主使用SHOOT类牌时，目标玩家的掷骰结果-1。\n二．梦主的出牌阶段，可不用功能牌移动到相邻的另一层梦境，每回合仅可使用一次。\n三．梦主的回合开始时，如果梦主处于迷失层，则立刻在被击杀的所在层复活，即将梦主指示物在原地竖起。\n四．当盗梦者打开放有金币的金库，梦主可以让该盗梦者抽取1张贿赂牌。",
    description: "",
    timing: "",
    target: "",
    source:
      "game/packages/client/public/cards/dream-master/盗梦都市_角色牌_梦主_盛夏.webp",
    sha256: "96abdb1737deb9c08f564a4bf77db102ab180c240a86cfbdeeec335397e66a4f",
  },
  action_back: {
    id: "action_back",
    name: "背面",
    category: "action",
    image: "assets/action_back.webp",
    fullText:
      "行动牌背面。牌库中的卡牌内容不可查看。\n\n游戏开始前，将行动牌混洗成一叠，放在桌子中央作为牌库。",
    description: "",
    timing: "",
    target: "",
    source:
      "game/packages/client/public/cards/action/盗梦都市_行动牌_背面.webp",
    sha256: "cb4cd22df283ef42c6ede20f1aa11afb0a15c15c15fd9a35c31ca5738f5679fa",
  },
  action_shoot: {
    id: "action_shoot",
    name: "SHOOT",
    category: "action",
    image: "assets/action_shoot.webp",
    fullText:
      "数量：28张\n\n使用时机：你的出牌阶段\n\n使用目标：除你以外，与你同层梦境的另一位玩家。\n\n发动效果：目标玩家掷1颗骰子，掷骰结果对应以下效果。\n- [2点][3点][4点]：令该玩家移动到相邻的另一层梦境。\n- [1点]：该玩家死亡。\n\n解析：\n令目标玩家移动时，由你来选择移动，目标玩家必须移动。\n【SHOOT】除了有一定几率让目标玩家死亡，大多数情况下，是通过火力压制，将对方驱逐到另一层梦境。\n当然，【SHOOT】也可以对同伴使用，令同伴在危险关头激发本能，以达到帮助同伴移动的目的。\n移动到相邻的另一层梦境的效果不会让玩家进入迷失层。",
    description:
      "令同层的另一位玩家掷1颗骰子，掷骰结果对应以下效果：[2点][3点][4点]：令该玩家移动到相邻的另一层梦境。[1点]：该玩家死亡。",
    timing: "你的出牌阶段",
    target: "除你以外，与你同层梦境的另一位玩家。",
    source:
      "game/packages/client/public/cards/action/盗梦都市_行动牌_SHOOT.webp",
    sha256: "f93bd94f39c83911774fdb1d933c8b924f63504057ae8cf3addbac14d360dd25",
  },
  action_kick: {
    id: "action_kick",
    name: "KICK",
    category: "action",
    image: "assets/action_kick.webp",
    fullText:
      "数量：5张\n\n使用时机：你的出牌阶段\n\n使用目标：除你以外的另一位玩家。\n\n发动效果：你与另一位玩家交换梦境层数。\n\n解析：你可以对同层梦境的另一玩家使用，纯粹为了消耗掉这张牌。",
    description: "你与另一位玩家交换梦境层数。",
    timing: "你的出牌阶段",
    target: "除你以外的另一位玩家。",
    source:
      "game/packages/client/public/cards/action/盗梦都市_行动牌_KICK.webp",
    sha256: "67e0c1ce7f73f6e36050649b4f2be119aabc8368cfad0f802112d6944ea74f55",
  },
  action_unlock: {
    id: "action_unlock",
    name: "解封",
    category: "action",
    image: "assets/action_unlock.webp",
    fullText:
      "数量：25张\n\n使用时机：你的出牌阶段/任意玩家使用【解封】的效果①时\n\n使用目标：你同层的心锁/另一张用于解锁的【解封】。\n\n发动效果：选择以下一个效果。\n- 效果①：仅盗梦者使用，对当层梦境进行一次解锁。复活后不能在当回合使用此效果。\n- 效果②：抵消1张【解封】的解锁效果。\n\n解析：梦主不能使用【解封】效果①。任何玩家在有人使用【解封】效果①时，都可以使用【解封】效果②。【解封】效果②是不能被抵消的。例如当有玩家用以解锁的【解封】被其他玩家的【解封】抵消时，不能使用另一张【解封】来再次抵消第二张【解封】的效果。",
    description:
      "选择以下一个效果：效果①：仅盗梦者使用，对当层梦境进行一次解锁。复活后不能在当回合使用此效果。效果②：抵消1张【解封】的效果①。",
    timing: "你的出牌阶段/任意玩家使用【解封】的效果①时",
    target: "你同层的心锁/另一张用于解锁的【解封】。",
    source:
      "game/packages/client/public/cards/action/盗梦都市_行动牌_解封.webp",
    sha256: "a6d6972c20dd34444db2248737e005f7de8d2671137ee321283915882f1c8174",
  },
  action_dream_transit: {
    id: "action_dream_transit",
    name: "梦境穿梭剂",
    category: "action",
    image: "assets/action_dream_transit.webp",
    fullText:
      "数量：20张\n\n使用时机：你的出牌阶段\n\n使用目标：你\n\n发动效果：你移动到相邻的另一层梦境。\n\n解析：第1层梦境与第4层梦境是不相连的。所以当你处于第1层梦境时，你无法移动到第4层梦境，反之亦然。移动到相邻的另一层梦境的效果不会让玩家进入迷失层。",
    description: "你移动到相邻的另一层梦境。",
    timing: "你的出牌阶段",
    target: "你。",
    source:
      "game/packages/client/public/cards/action/盗梦都市_行动牌_梦境穿梭剂.webp",
    sha256: "dec22d5c7e40ffd133a828ae3d139faccde1ff8512ad8613d96b242ab2e28678",
  },
  dream_limbo: {
    id: "dream_limbo",
    name: "0-迷失层",
    category: "dream",
    image: "assets/dream_limbo.webp",
    fullText:
      "迷失层。\n\n玩家会因为死亡等原因进入迷失层。\n除了特殊说明的效果外，一般移动到相邻另一层梦境效果不会让玩家进入迷失层。\n盗梦者进入迷失层时，须将0层梦境牌面朝上盖于其余梦境牌之上。\n梦主进入迷失层时，在被击杀的所在层将梦主指示物放倒。\n在迷失层里，玩家在其出牌阶段除了复活自己（详见复活）外，不能进行任何行动。",
    description: "迷失层",
    timing: "",
    target: "",
    source:
      "game/packages/client/public/cards/dream/盗梦都市_梦境牌_0迷失层.webp",
    sha256: "b1985cc5747efd0cb87f2d33e7973f4cf3fa8555d9b738eeb76fa1fd9c9ef494",
  },
  dream_1: {
    id: "dream_1",
    name: "1层",
    category: "dream",
    image: "assets/dream_1.webp",
    fullText:
      "第1层梦境。\n\n当盗梦者从某层梦境移动到另一层梦境时，该盗梦者必须将标有对应层的梦境牌展示于自己面前，覆盖另一张梦境牌。以表示该盗梦者目前所在的梦境层次。\n当梦主从某层梦境移动到另一层梦境时，梦主将梦主指示物移动到对应的梦境牌上。\n\n第1层与第4层不相邻；通常的相邻移动不能进入迷失层。\n\n解锁\n盗梦者解锁：可使用行动牌【解封】或某些技能来进行解锁。若解锁成功，同层梦境的心锁数就减少1点，即是将心锁骰子由当前面翻转到比之小1点的面，例如由6翻转到5。\n每回合只能进行一次成功的解锁。\n一旦本回合心锁减少后，盗梦者不能再选择以技能或行动的方式进行解锁，也就是说，不能再出【解封】或启动技能减少心锁。\n\n取消解锁：\n盗梦者使用【解封】解锁时，任意玩家可再使用1张【解封】，即取消该牌的解锁效果，但【解封】依旧视为已使用。",
    description: "第1层梦境",
    timing: "",
    target: "",
    source: "game/packages/client/public/cards/dream/盗梦都市_梦境牌_1.webp",
    sha256: "e7df20fee09a33d446540c9c31bd56bdad69de7d2cb3f1442ffdfbac0c88fc42",
  },
  dream_2: {
    id: "dream_2",
    name: "2层",
    category: "dream",
    image: "assets/dream_2.webp",
    fullText:
      "第2层梦境。\n\n当盗梦者从某层梦境移动到另一层梦境时，该盗梦者必须将标有对应层的梦境牌展示于自己面前，覆盖另一张梦境牌。以表示该盗梦者目前所在的梦境层次。\n当梦主从某层梦境移动到另一层梦境时，梦主将梦主指示物移动到对应的梦境牌上。\n\n第1层与第4层不相邻；通常的相邻移动不能进入迷失层。\n\n解锁\n盗梦者解锁：可使用行动牌【解封】或某些技能来进行解锁。若解锁成功，同层梦境的心锁数就减少1点，即是将心锁骰子由当前面翻转到比之小1点的面，例如由6翻转到5。\n每回合只能进行一次成功的解锁。\n一旦本回合心锁减少后，盗梦者不能再选择以技能或行动的方式进行解锁，也就是说，不能再出【解封】或启动技能减少心锁。\n\n取消解锁：\n盗梦者使用【解封】解锁时，任意玩家可再使用1张【解封】，即取消该牌的解锁效果，但【解封】依旧视为已使用。",
    description: "第2层梦境",
    timing: "",
    target: "",
    source: "game/packages/client/public/cards/dream/盗梦都市_梦境牌_2.webp",
    sha256: "ea4f00a0b2987d6240a3dfb21300dcfa55591a458c832dd5e467b8f76d5aeaf6",
  },
  dream_3: {
    id: "dream_3",
    name: "3层",
    category: "dream",
    image: "assets/dream_3.webp",
    fullText:
      "第3层梦境。\n\n当盗梦者从某层梦境移动到另一层梦境时，该盗梦者必须将标有对应层的梦境牌展示于自己面前，覆盖另一张梦境牌。以表示该盗梦者目前所在的梦境层次。\n当梦主从某层梦境移动到另一层梦境时，梦主将梦主指示物移动到对应的梦境牌上。\n\n第1层与第4层不相邻；通常的相邻移动不能进入迷失层。\n\n解锁\n盗梦者解锁：可使用行动牌【解封】或某些技能来进行解锁。若解锁成功，同层梦境的心锁数就减少1点，即是将心锁骰子由当前面翻转到比之小1点的面，例如由6翻转到5。\n每回合只能进行一次成功的解锁。\n一旦本回合心锁减少后，盗梦者不能再选择以技能或行动的方式进行解锁，也就是说，不能再出【解封】或启动技能减少心锁。\n\n取消解锁：\n盗梦者使用【解封】解锁时，任意玩家可再使用1张【解封】，即取消该牌的解锁效果，但【解封】依旧视为已使用。",
    description: "第3层梦境",
    timing: "",
    target: "",
    source: "game/packages/client/public/cards/dream/盗梦都市_梦境牌_3.webp",
    sha256: "122ed753637a550952074a4f9928f31c25ed4fb9406eb44cf72e647698d43241",
  },
  dream_4: {
    id: "dream_4",
    name: "4层",
    category: "dream",
    image: "assets/dream_4.webp",
    fullText:
      "第4层梦境。\n\n当盗梦者从某层梦境移动到另一层梦境时，该盗梦者必须将标有对应层的梦境牌展示于自己面前，覆盖另一张梦境牌。以表示该盗梦者目前所在的梦境层次。\n当梦主从某层梦境移动到另一层梦境时，梦主将梦主指示物移动到对应的梦境牌上。\n\n第1层与第4层不相邻；通常的相邻移动不能进入迷失层。\n\n解锁\n盗梦者解锁：可使用行动牌【解封】或某些技能来进行解锁。若解锁成功，同层梦境的心锁数就减少1点，即是将心锁骰子由当前面翻转到比之小1点的面，例如由6翻转到5。\n每回合只能进行一次成功的解锁。\n一旦本回合心锁减少后，盗梦者不能再选择以技能或行动的方式进行解锁，也就是说，不能再出【解封】或启动技能减少心锁。\n\n取消解锁：\n盗梦者使用【解封】解锁时，任意玩家可再使用1张【解封】，即取消该牌的解锁效果，但【解封】依旧视为已使用。",
    description: "第4层梦境",
    timing: "",
    target: "",
    source: "game/packages/client/public/cards/dream/盗梦都市_梦境牌_4.webp",
    sha256: "5a6045df6dbce4d9e80131e66b8d68566223ae91055c8143cf5ac3845ba3da24",
  },
  vault_back: {
    id: "vault_back",
    name: "背面",
    category: "vault",
    image: "assets/vault_back.webp",
    fullText:
      "金库背面：内容未公开，不可查看其正面。\n\n当某一层的心锁全部被解开时，该层的金库便被打开，把该金库翻开。\n若打开的是金币，则梦主可以给予导致该金库打开的盗梦者1张贿赂牌（详见贿赂牌）。\n若打开的是秘密，则游戏结束，盗梦者获胜（详见游戏结束）。",
    description: "",
    timing: "",
    target: "",
    source: "game/packages/client/public/cards/vault/盗梦都市_金库牌_背面.webp",
    sha256: "c6cdfa0ce88b42c013cab66e8ea493423cf4ef2d3362710ea8766f003b300537",
  },
  action_dream_peek: {
    id: "action_dream_peek",
    name: "梦境窥视",
    category: "action",
    image: "assets/action_dream_peek.webp",
    fullText:
      "数量：11张\n\n使用时机：你的出牌阶段\n\n使用目标：任意一层梦境的金库/一名已被贿赂的盗梦者。\n\n发动效果：选择以下一个效果。\n- 效果①：仅盗梦者使用，梦主可以先给予你1张贿赂牌。你查看任意一层梦境的金库，且不得公布你看到的结果。\n- 效果②：仅梦主使用，查看一名盗梦者的所有贿赂牌。\n\n解析：当盗梦者使用【梦境窥视】的效果①时，梦主先决定是否让该盗梦者抽取1张贿赂牌，然后该盗梦者再查看任意一层梦境的金库。当梦主的贿赂牌已经派完时，你使用【梦境窥视】是不会收到贿赂牌的，也即是说盗梦者阵营接下来窥视金库都是无负担的。",
    description: "",
    timing: "你的出牌阶段",
    target: "任意一层未开启的金库（盗梦者效果）。",
    source:
      "game/packages/client/public/cards/action/盗梦都市_行动牌_梦境窥视.webp",
    sha256: "ff8ec29e94ffceb82ae68df94749fc1ac695f9b0572e621a96555ee83b0fd02d",
  },
  vault_gold: {
    id: "vault_gold",
    name: "金币",
    category: "vault",
    image: "assets/vault_gold.webp",
    fullText:
      "金币金库。\n\n当某一层的心锁全部被解开时，该层的金库便被打开，把该金库翻开。\n若打开的是金币，则梦主可以给予导致该金库打开的盗梦者1张贿赂牌。\n若打开的是秘密，则游戏结束，盗梦者获胜。",
    description: "",
    timing: "",
    target: "",
    source: "game/packages/client/public/cards/vault/盗梦都市_金库牌_金币.webp",
    sha256: "c3857843b82cc8afe0bbbe10fc01c1eddba6d9344499f53397b0f95e3de3b44e",
  },
  vault_secret: {
    id: "vault_secret",
    name: "秘密",
    category: "vault",
    image: "assets/vault_secret.webp",
    fullText:
      "秘密金库。\n\n当某一层的心锁全部被解开时，该层的金库便被打开，把该金库翻开。\n若打开的是金币，则梦主可以给予导致该金库打开的盗梦者1张贿赂牌。\n若打开的是秘密，则游戏结束，盗梦者获胜。\n\n仅通过梦境窥视看到秘密，不等于打开金库，不会结束游戏。",
    description: "",
    timing: "",
    target: "",
    source: "game/packages/client/public/cards/vault/盗梦都市_金库牌_秘密.webp",
    sha256: "d4ce3794be17f33cb92f06b957f25b417fc4097a8dd759a0c02c54bdc19d2702",
  },
};
