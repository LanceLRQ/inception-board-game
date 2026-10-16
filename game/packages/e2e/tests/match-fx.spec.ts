// 对局动画层 E2E：事件驱动的动作逐个播放、每个动作配一行说明；「减少动效」时只显示说明。
// 固定场景 ?fx=1 循环播放一组覆盖全部动作的示例事件，本地对局里由真实的 Bot 回合产生事件。

import {
  LOCAL_MATCH_URL,
  test,
  expect,
  createConsoleErrorRecorder,
  waitForAppReady,
} from './fixtures/index.js';

const FX = '[data-testid="match-fx"]';
/** 飞行的牌、闪烁的光圈与徽标：减少动效时一个都不该出现 */
const MOVING = '.ms-fx-card, .ms-fx-ring, .ms-fx-badge';

test.describe('对局动画层', () => {
  test('固定场景 ?fx=1：动作逐个播放，配说明与飞行的牌，整页不出现滚动条', async ({ page }) => {
    const { errors } = createConsoleErrorRecorder(page);
    await page.goto('/game/debug?fx=1');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

    const layer = page.locator(FX);
    await expect(layer).toHaveAttribute('data-cue', /.+/, { timeout: 10_000 });
    await expect(page.getByTestId('fx-caption')).not.toBeEmpty();
    await expect(page.locator(MOVING).first()).toBeAttached();

    // 依次播过几种不同的动作
    const seen = new Set<string>();
    await expect
      .poll(
        async () => {
          const cue = await layer.getAttribute('data-cue');
          if (cue) seen.add(cue);
          return seen.size;
        },
        { timeout: 15_000, intervals: [100] },
      )
      .toBeGreaterThanOrEqual(3);

    // 动画层不拦截指针
    expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    const scroll = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
    }));
    expect(scroll.sw, '无横向滚动').toBeLessThanOrEqual(scroll.cw);
    expect(scroll.sh, '无纵向滚动').toBeLessThanOrEqual(scroll.ch);
    expect(errors).toEqual([]);
  });

  test('说明条在视口内，不压住座位、回合信息与层级标签', async ({ page }) => {
    await page.goto('/game/debug?fx=1');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });
    const caption = page.getByTestId('fx-caption');
    await expect(caption).toBeVisible({ timeout: 10_000 });

    const overlaps = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="fx-caption"]')!.getBoundingClientRect();
      const hit = (r: DOMRect) =>
        r.width > 0 &&
        r.left < box.right &&
        box.left < r.right &&
        r.top < box.bottom &&
        box.top < r.bottom;
      const inView =
        box.left >= 0 &&
        box.top >= 0 &&
        box.right <= window.innerWidth &&
        box.bottom <= window.innerHeight;
      const blocked = [
        ...document.querySelectorAll(
          '.ms-seat, [data-testid="layer-chips"], [data-testid="turn-indicator"]',
        ),
      ]
        .filter((el) => hit(el.getBoundingClientRect()))
        .map((el) => el.getAttribute('data-testid') ?? el.className.split(' ')[0]);
      return { inView, blocked };
    });
    expect(overlaps.inView, '说明条在视口内').toBe(true);
    expect(overlaps.blocked).toEqual([]);
  });

  test('减少动效：只显示说明，不播飞行与闪烁', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/game/debug?fx=1');
    await waitForAppReady(page);
    await expect(page.getByTestId('runtime-stage')).toBeVisible({ timeout: 10_000 });

    const layer = page.locator(FX);
    const cues = new Set<string>();
    await expect
      .poll(
        async () => {
          const cue = await layer.getAttribute('data-cue');
          if (cue) {
            cues.add(cue);
            expect(await page.getByTestId('fx-caption').textContent()).not.toBe('');
          }
          expect(await page.locator(MOVING).count()).toBe(0);
          return cues.size;
        },
        { timeout: 15_000, intervals: [100] },
      )
      .toBeGreaterThanOrEqual(3);
  });

  test('本地对局：Bot 的回合产生事件，播出抽牌并配说明', async ({ page }) => {
    await page.goto(LOCAL_MATCH_URL);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /开始游戏|Start/ }).click();

    await expect(page.locator(FX)).toHaveAttribute('data-cue', 'draw', { timeout: 20_000 });
    await expect(page.getByTestId('fx-caption')).toContainText(/抽了|drew/);
  });
});
