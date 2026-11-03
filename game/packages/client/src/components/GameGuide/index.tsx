import { useCallback, useRef, useState } from 'react';
import { BookOpen, ArrowLeft, ZoomIn } from 'lucide-react';
import { Dialog, DialogTitle } from '../ui/dialog';
import { versionedCardImageUrl } from '../../lib/cardImageVersion';
import { GUIDE_CATEGORIES as categories, guideEntries } from '../../lib/cardReference';
import { ReferenceText } from './ReferenceText';

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
  const matches = guideEntries(category, query).map((entry) => ({
    ...entry,
    image: entry.image ? versionedCardImageUrl(entry.image) : undefined,
  }));
  const current = matches.find((c) => c.id === selected) ?? matches[0];
  const changeCategory = (value: string) => {
    setCategory(value);
    setQuery('');
    setSelected('');
    setReading(false);
    setZoom(false);
    listScroll.current = 0;
    readerScroll.current = 0;
    zoomScroll.current = 0;
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
          <p>103 个原版牌面 · 9 章规则 · 完整文字说明</p>
        </header>
        <select
          aria-label="说明书分类"
          className="guide-select"
          value={category}
          onChange={(e) => changeCategory(e.target.value)}
        >
          {Object.entries(categories).map(([id, name]) => (
            <option key={id} value={id}>
              {name} · {guideEntries(id).length}
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
                <span>{name}</span>
                <small>{guideEntries(id).length}</small>
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
                  setZoom(false);
                  listScroll.current = 0;
                  readerScroll.current = 0;
                  if (reader.current) reader.current.scrollTop = 0;
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
                    requestAnimationFrame(() => {
                      if (reader.current) reader.current.scrollTop = 0;
                    });
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
                  <ReferenceText text={current.text} />
                </>
              )}
            </div>
          </section>
        </div>
      </Dialog>
    </>
  );
}
