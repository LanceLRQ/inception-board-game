/**
 * Spike 11: 移动端触控交互原型
 *
 * 验证点：
 * 1. 两步点击流程（选牌→选目标→确认）状态机
 * 2. 长按查看卡牌详情（>=500ms 触发）
 * 3. 上滑展开手牌抽屉
 * 4. 触控目标 >= 44×44px 可达性
 * 5. 交互时序合理性
 */

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail: string) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name} — ${detail}`); failed++; }
}

// ============================================================
// 1. 两步点击状态机
// ============================================================

type ClickStep = 'idle' | 'card_selected' | 'target_selected' | 'confirming';

interface TwoStepClickState {
  step: ClickStep;
  selectedCardId: string | null;
  selectedTargetId: string | null;
  validTargets: string[];
}

function createTwoStepClick(): TwoStepClickState {
  return { step: 'idle', selectedCardId: null, selectedTargetId: null, validTargets: [] };
}

function selectCard(state: TwoStepClickState, cardId: string, validTargets: string[]): TwoStepClickState {
  if (state.step !== 'idle') return state;
  return { ...state, step: 'card_selected', selectedCardId: cardId, validTargets };
}

function selectTarget(state: TwoStepClickState, targetId: string): TwoStepClickState {
  if (state.step !== 'card_selected') return state;
  if (!state.validTargets.includes(targetId)) return state; // 无效目标忽略
  return { ...state, step: 'target_selected', selectedTargetId: targetId };
}

function confirm(state: TwoStepClickState): { cardId: string; targetId: string } | null {
  if (state.step !== 'target_selected') return null;
  return { cardId: state.selectedCardId!, targetId: state.selectedTargetId! };
}

function cancel(state: TwoStepClickState): TwoStepClickState {
  return createTwoStepClick();
}

// ============================================================
// 2. 长按检测器
// ============================================================

interface LongPressState {
  isPressed: boolean;
  startTime: number;
  triggered: boolean;
  thresholdMs: number;
}

function createLongPress(thresholdMs = 500): LongPressState {
  return { isPressed: false, startTime: 0, triggered: false, thresholdMs };
}

function onPressStart(state: LongPressState, now: number): LongPressState {
  return { ...state, isPressed: true, startTime: now, triggered: false };
}

function onPressEnd(state: LongPressState, now: number): { state: LongPressState; wasLongPress: boolean } {
  if (!state.isPressed) return { state, wasLongPress: false };
  const duration = now - state.startTime;
  const wasLongPress = duration >= state.thresholdMs && !state.triggered;
  return {
    state: { ...state, isPressed: false, triggered: wasLongPress },
    wasLongPress,
  };
}

// ============================================================
// 3. 上滑抽屉检测
// ============================================================

interface SwipeState {
  startY: number;
  currentY: number;
  threshold: number;
  isOpen: boolean;
}

function createSwipeDetector(threshold = 80): SwipeState {
  return { startY: 0, currentY: 0, threshold, isOpen: false };
}

function onSwipeStart(state: SwipeState, y: number): SwipeState {
  return { ...state, startY: y, currentY: y };
}

function onSwipeMove(state: SwipeState, y: number): SwipeState {
  return { ...state, currentY: y };
}

function onSwipeEnd(state: SwipeState): { state: SwipeState; shouldOpen: boolean; shouldClose: boolean } {
  const delta = state.startY - state.currentY; // 正值=上滑
  const shouldOpen = delta > state.threshold && !state.isOpen;
  const shouldClose = delta < -state.threshold && state.isOpen;
  return {
    state: { ...state, isOpen: shouldOpen ? true : shouldClose ? false : state.isOpen },
    shouldOpen,
    shouldClose,
  };
}

// ============================================================
// 4. 触控目标尺寸检查
// ============================================================

interface TouchTarget {
  x: number; y: number; width: number; height: number;
}

function isTargetSufficient(target: TouchTarget, minSize = 44): boolean {
  return target.width >= minSize && target.height >= minSize;
}

function hitTest(targets: TouchTarget[], point: { x: number; y: number }): TouchTarget | null {
  return targets.find(t =>
    point.x >= t.x && point.x <= t.x + t.width &&
    point.y >= t.y && point.y <= t.y + t.height
  ) || null;
}

// ============================================================
// 测试
// ============================================================

function main() {
  console.log('\n🧪 Spike 11: 移动端触控交互原型\n');
  console.log('='.repeat(60));

  // 测试 1：两步点击状态机
  console.log('\n📋 测试 1：两步点击流程（选牌→选目标→确认）');
  {
    let state = createTwoStepClick();
    check(state.step === 'idle', '初始状态=idle', `step: ${state.step}`);

    // 试图直接选目标（非法）
    state = selectTarget(state, 'p1');
    check(state.step === 'idle', '未选牌时不能选目标', `step: ${state.step}`);

    // 选牌
    state = selectCard(state, 'shoot-1', ['p1', 'p2']);
    check(state.step === 'card_selected', '选牌后=card_selected', `step: ${state.step}`);
    check(state.selectedCardId === 'shoot-1', '选中 shoot-1', `card: ${state.selectedCardId}`);

    // 选无效目标
    state = selectTarget(state, 'p3');
    check(state.step === 'card_selected', '无效目标被忽略', `step: ${state.step}`);

    // 选有效目标
    state = selectTarget(state, 'p1');
    check(state.step === 'target_selected', '选目标后=target_selected', `step: ${state.step}`);

    // 确认
    const result = confirm(state);
    check(result?.cardId === 'shoot-1' && result?.targetId === 'p1', '确认返回正确', JSON.stringify(result));

    // 取消流程
    let state2 = selectCard(createTwoStepClick(), 'unlock-1', []);
    state2 = cancel(state2);
    check(state2.step === 'idle', '取消回到 idle', `step: ${state2.step}`);
  }

  // 测试 2：长按检测
  console.log('\n📋 测试 2：长按检测（>=500ms）');
  {
    let lp = createLongPress(500);

    // 短按
    lp = onPressStart(lp, 0);
    const shortResult = onPressEnd(lp, 300);
    check(!shortResult.wasLongPress, '300ms 短按不触发', `triggered: ${shortResult.wasLongPress}`);

    // 长按
    lp = createLongPress(500);
    lp = onPressStart(lp, 0);
    const longResult = onPressEnd(lp, 600);
    check(longResult.wasLongPress, '600ms 长按触发', `triggered: ${longResult.wasLongPress}`);

    // 边界值
    lp = createLongPress(500);
    lp = onPressStart(lp, 0);
    const edgeResult = onPressEnd(lp, 499);
    check(!edgeResult.wasLongPress, '499ms 不触发', '');
    lp = createLongPress(500);
    lp = onPressStart(lp, 0);
    const edgeResult2 = onPressEnd(lp, 500);
    check(edgeResult2.wasLongPress, '500ms 触发', '');
  }

  // 测试 3：上滑抽屉
  console.log('\n📋 测试 3：上滑展开/下滑收起');
  {
    let swipe = createSwipeDetector(80);
    swipe = onSwipeStart(swipe, 500);

    // 小幅移动不触发
    swipe = onSwipeMove(swipe, 460);
    const r1 = onSwipeEnd(swipe);
    check(!r1.shouldOpen, '上滑 40px 不触发', '');

    // 大幅上滑触发
    swipe = createSwipeDetector(80);
    swipe = onSwipeStart(swipe, 500);
    swipe = onSwipeMove(swipe, 400);
    const r2 = onSwipeEnd(swipe);
    check(r2.shouldOpen, '上滑 100px 触发展开', '');
    check(r2.state.isOpen, '状态=isOpen', '');

    // 已展开时下滑收起
    swipe = onSwipeStart(r2.state, 400);
    swipe = onSwipeMove(swipe, 520);
    const r3 = onSwipeEnd(swipe);
    check(r3.shouldClose, '下滑 120px 触发收起', '');
  }

  // 测试 4：触控目标尺寸
  console.log('\n📋 测试 4：触控目标 >= 44×44 可达性');
  {
    const goodTarget: TouchTarget = { x: 0, y: 0, width: 44, height: 44 };
    const smallTarget: TouchTarget = { x: 0, y: 0, width: 40, height: 40 };
    const cardTarget: TouchTarget = { x: 10, y: 200, width: 80, height: 120 };

    check(isTargetSufficient(goodTarget), '44×44 通过', '');
    check(!isTargetSufficient(smallTarget), '40×40 不通过', '');
    check(isTargetSufficient(cardTarget), '卡牌 80×120 通过', '');

    // iPhone SE (375×667) 布局：5 张手牌，每张宽 60px
    const seWidth = 375;
    const cardWidth = 60;
    const cardHeight = 90;
    const gap = (seWidth - 5 * cardWidth) / 6;
    const handTargets: TouchTarget[] = Array.from({ length: 5 }, (_, i) => ({
      x: gap + i * (cardWidth + gap),
      y: 200,
      width: cardWidth,
      height: cardHeight,
    }));
    const allSufficient = handTargets.every(t => isTargetSufficient(t));
    check(allSufficient, `iPhone SE 5张手牌全部 >= 44px (gap=${gap.toFixed(0)}px)`, '');
  }

  // 测试 5：命中测试
  console.log('\n📋 测试 5：命中测试');
  {
    const targets: TouchTarget[] = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 120, y: 0, width: 100, height: 100 },
    ];
    check(hitTest(targets, { x: 50, y: 50 }) !== null, '命中第一个', '');
    check(hitTest(targets, { x: 150, y: 50 }) !== null, '命中第二个', '');
    check(hitTest(targets, { x: 110, y: 50 }) === null, '间隙不命中', '');
  }

  // 测试 6：@use-gesture/react 导入验证
  console.log('\n📋 测试 6：@use-gesture/react 库可用性');
  {
    try {
      // 验证库能被导入
      const gesture = require('@use-gesture/react');
      check(!!gesture, '@use-gesture/react 导入成功', '');
      const hooks = Object.keys(gesture);
      check(hooks.includes('useDrag') || hooks.some(h => h.includes('Drag')), `含 Drag hook`, '');
      check(hooks.includes('useGesture'), `含 useGesture（长按可用 useGesture + delay）`, '');
      console.log(`  可用 hooks: ${hooks.filter(h => h.startsWith('use')).join(', ')}`);
      console.log('  长按实现: useGesture({ onDragStart: handler, delay: 500 })');
    } catch (e: any) {
      check(false, '@use-gesture/react 导入', e.message);
    }
  }

  // === 结论 ===
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 结果：✅ ${passed} 通过 / ❌ ${failed} 失败 / 共 ${passed + failed} 项\n`);
  console.log('📝 结论：两步点击/长按/上滑状态机 **设计可行**，@use-gesture/react 提供完整手势支持。\n');
}

main();
