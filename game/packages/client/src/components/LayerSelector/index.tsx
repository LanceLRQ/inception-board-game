// LayerSelector - 梦境层选择器（第二步选层用）
// 对照：plans/design/06-frontend-design.md §6.4.4

import { cn } from '../../lib/utils.js';

export interface LayerSelectorProps {
  layers: number[];
  currentLayer: number;
  legalLayers: Set<number>;
  onSelect: (layer: number) => void;
  title?: string;
}

export function LayerSelector({
  layers,
  currentLayer,
  legalLayers,
  onSelect,
  title = '选择目标层',
}: LayerSelectorProps) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-card p-3">
      <div className="text-center text-xs text-muted-foreground">{title}</div>
      <div className="flex justify-around gap-2">
        {layers.map((layer) => {
          const legal = legalLayers.has(layer);
          const isHere = layer === currentLayer;
          return (
            <button
              key={layer}
              type="button"
              onClick={legal ? () => onSelect(layer) : undefined}
              disabled={!legal}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-md border text-lg font-bold transition-all',
                legal
                  ? 'border-primary bg-primary/10 text-primary hover:scale-110 hover:shadow-md'
                  : 'border-border/40 bg-muted/20 text-muted-foreground/40 cursor-not-allowed',
                isHere && 'ring-2 ring-yellow-400',
              )}
              aria-label={`层 ${layer}${legal ? '（可选）' : ''}`}
            >
              {layer}
            </button>
          );
        })}
      </div>
    </div>
  );
}
