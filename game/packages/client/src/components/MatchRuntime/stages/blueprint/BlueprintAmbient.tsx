// 「筑梦蓝图」的舞台背景：图纸网格（细格 + 主格）、过中心的剖切轴线、四周压暗
// 纯装饰，不拦截指针；网格可由 data-fx-off="grid" 单独关闭，样式在 styles/skins/blueprint.css。

export function BlueprintAmbient() {
  return (
    <div className="ms-ambient blueprint-ambient pointer-events-none absolute inset-0" aria-hidden>
      <i className="blueprint-grid" />
      <i className="blueprint-axis blueprint-axis-h" />
      <i className="blueprint-axis blueprint-axis-v" />
    </div>
  );
}
