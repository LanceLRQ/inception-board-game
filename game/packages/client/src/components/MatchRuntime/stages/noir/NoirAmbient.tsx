// 「深眠影院」的舞台背景：中央微光 + 围坐椭圆轨道线（内外两圈）
// 纯装饰，不拦截指针；样式在 styles/skins/noir.css。

export function NoirAmbient() {
  return (
    <div className="ms-ambient noir-ambient pointer-events-none absolute inset-0" aria-hidden>
      <i className="noir-orbit" />
    </div>
  );
}
