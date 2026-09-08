import React from "react";
import { ArrowLeft, CircleNotch } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import LinkSettingsPanel, {
  type LinkSettingsPanelProps,
} from "@/components/documents/LinkSettingsPanel";

interface LinkSettingsInlineProps extends Omit<
  LinkSettingsPanelProps,
  "className"
> {
  title: string;
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
  saveDisabled?: boolean;
  backLabel?: string;
}

const LinkSettingsInline: React.FC<LinkSettingsInlineProps> = ({
  title,
  onBack,
  onSave,
  isSaving,
  saveDisabled = false,
  backLabel = "Back to links",
  ...panelProps
}) => {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--dk-surface-raised)]">
      <div className="relative shrink-0 border-b border-border/70 bg-[var(--dk-surface-overlay)] px-6 py-4">
        <div
          className="absolute inset-x-0 top-0 h-px bg-primary/55"
          aria-hidden="true"
        />
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit px-2 text-muted-foreground hover:text-foreground"
          onClick={onBack}
          disabled={isSaving}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          {backLabel}
        </Button>
        <h2 className="mt-2 text-base font-medium">{title}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <LinkSettingsPanel {...panelProps} className="border-0 shadow-none" />
      </div>

      <div className="shrink-0 border-t border-border/70 bg-[var(--dk-surface-overlay)] px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onBack} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving || saveDisabled}>
            {isSaving && (
              <CircleNotch aria-hidden className="mr-2 h-4 w-4 animate-spin" />
            )}
            {panelProps.isEditing ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LinkSettingsInline;
