// 角色技能面板：点「技能」后从底部升起，承载现有的 ActiveSkillPanel
// 发动一个技能后自动收起。

import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../ui/sheet';
import { ActiveSkillPanel } from '../../ActiveSkillPanel';
import type { SkillPanelModel } from '../controllerTypes';

interface MobileSkillSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly panel: SkillPanelModel | null;
}

export function MobileSkillSheet({ open, onOpenChange, panel }: MobileSkillSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={open && panel !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="skill-sheet"
        className="max-h-[80dvh] overflow-y-auto pb-safe"
      >
        <SheetHeader>
          <SheetTitle>{t('mobile.dock.skillSheet')}</SheetTitle>
          <SheetDescription>{t('mobile.dock.skillSheetDesc')}</SheetDescription>
        </SheetHeader>
        {panel && (
          <div className="px-4 pb-4">
            <ActiveSkillPanel
              context={panel.context}
              availableTargetIds={panel.targetIds}
              playerNicknames={panel.nicknames}
              onInvoke={(skill, args) => {
                panel.invoke(skill, args);
                onOpenChange(false);
              }}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
