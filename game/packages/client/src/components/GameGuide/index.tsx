import { useCallback, useRef, useState } from 'react';
import { BookOpen, ArrowLeft, ZoomIn } from 'lucide-react';
import { Dialog, DialogTitle } from '../ui/dialog';
import { versionedCardImageUrl } from '../../lib/cardImageVersion';
import content from './content.json';

const categories: Record<string, string> = {
  tutorial: '入门与规则',
  action: '行动牌',
  thief: '盗梦者',
  master: '梦主',
  dream: '梦境牌',
  vault: '金库牌',
  bribe: '贿赂牌',
  nightmare: '梦魇牌',
  other: '道具与配置',
};
export function GameGuide() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('tutorial');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [reading, setReading] = useState(false);
  const [zoom, setZoom] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const readerScroll = useRef(0);
  const zoomScroll = useRef(0);
  const mountReader = useCallback((node: HTMLDivElement | null) => {
    reader.current = node;
    if (node) node.scrollTop = readerScroll.current;
  }, []);
  const mountList = useCallback((node: HTMLDivElement | null) => {
    list.current = node;
    if (node) node.scrollTop = listScroll.current;
  }, []);
  const entries =
    category === 'tutorial'
      ? content.chapters.map((c) => ({
          id: c.id,
          name: c.name,
          text: c.text,
          image: undefined as string | undefined,
        }))
      : Object.values(content.cards)
          .filter((c) => c.category === category)
          .map((c) => ({
            id: c.id,
            name: c.name,
            text: c.fullText,
            image: versionedCardImageUrl(c.imagePath),
          }));
  const matches = entries.filter((c) =>
    `${c.name} ${c.text}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const current = matches.find((c) => c.id === selected) ?? matches[0];
  const changeCategory = (value: string) => {
    setCategory(value);
    setQuery('');
    setSelected('');
    setReading(false);
    setZoom(false);
    if (list.current) list.current.scrollTop = 0;
    if (reader.current) reader.current.scrollTop = 0;
  };
  return (
    <>
      <button type="button" className="ms-btn guide-launch" onClick={() => setOpen(true)}>
        <BookOpen size={16} />
        游戏教程说明书
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        blocking={false}
        className="game-guide"
        data-testid="game-guide"
      >
        <header>
          <DialogTitle>游戏教程说明书</DialogTitle>
          <p>原版规则与卡牌全文</p>
        </header>
        <select
          aria-label="说明书分类"
          className="guide-select"
          value={category}
          onChange={(e) => changeCategory(e.target.value)}
        >
          {Object.entries(categories).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <div className="guide-workspace" data-reading={reading}>
          <nav aria-label="说明书分类">
            {Object.entries(categories).map(([id, name]) => (
              <button
                type="button"
                key={id}
                aria-pressed={category === id}
                onClick={() => changeCategory(id)}
              >
                {name}
              </button>
            ))}
          </nav>
          <section className="guide-directory">
            <label>
              搜索当前分类
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setReading(false);
                  if (list.current) list.current.scrollTop = 0;
                }}
                placeholder="章节、卡牌或关键词"
              />
            </label>
            <p>{matches.length} 项</p>
            <div
              ref={mountList}
              onScroll={(e) => {
                listScroll.current = e.currentTarget.scrollTop;
              }}
              className="guide-scroll"
              tabIndex={0}
              aria-label="目录列表"
            >
              {matches.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={current?.id === c.id}
                  onClick={() => {
                    listScroll.current = list.current?.scrollTop ?? 0;
                    setSelected(c.id);
                    readerScroll.current = 0;
                    setReading(true);
                    setZoom(false);
                    if (reader.current) reader.current.scrollTop = 0;
                  }}
                >
                  {c.image && <img src={c.image} alt="" loading="lazy" />}
                  <span>{c.name}</span>
                </button>
              ))}
              {!matches.length && <p>没有匹配内容</p>}
            </div>
          </section>
          <section className="guide-reading">
            <div className="guide-reader-actions">
              <button
                type="button"
                className="guide-back"
                onClick={() => {
                  setReading(false);
                  requestAnimationFrame(() => {
                    if (list.current) list.current.scrollTop = listScroll.current;
                  });
                }}
              >
                <ArrowLeft size={16} />
                目录
              </button>
              <span>{current?.name ?? '没有匹配内容'}</span>
              {current?.image && (
                <button
                  type="button"
                  aria-pressed={zoom}
                  onClick={() => {
                    if (!zoom) zoomScroll.current = reader.current?.scrollTop ?? 0;
                    setZoom(!zoom);
                    requestAnimationFrame(() => {
                      if (reader.current) reader.current.scrollTop = zoom ? zoomScroll.current : 0;
                    });
                  }}
                >
                  <ZoomIn size={16} />
                  {zoom ? '还原原卡' : '放大原卡'}
                </button>
              )}
            </div>
            <div
              ref={mountReader}
              onScroll={(e) => {
                readerScroll.current = e.currentTarget.scrollTop;
              }}
              className="guide-scroll guide-fulltext"
              tabIndex={0}
              data-zoom={zoom}
            >
              {current && (
                <>
                  <h2>{current.name}</h2>
                  {current.image && <img src={current.image} alt={`${current.name}完整原卡`} />}
                  <div>
                    {category !== 'tutorial'
                      ? current.text
                      : current.text.split(/\n\s*\n/).map((block, index) =>
                          block.trim().startsWith('|') ? (
                            <div
                              className="guide-rule-table"
                              tabIndex={0}
                              aria-label="规则表格，可横向滚动"
                              key={index}
                            >
                              <table>
                                <tbody>
                                  {block
                                    .split('\n')
                                    .filter((line) => !/^[\s|:-]+$/.test(line))
                                    .map((line, row) => (
                                      <tr key={row}>
                                        {line
                                          .trim()
                                          .replace(/^\||\|$/g, '')
                                          .split('|')
                                          .map((cell, col) => (
                                            <td key={col}>{cell.trim()}</td>
                                          ))}
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="mb-5" key={index}>
                              {block.replace(/^#{1,4} /, '')}
                            </p>
                          ),
                        )}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </Dialog>
    </>
  );
}
