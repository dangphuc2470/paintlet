import { DialogFrame } from "./DialogFrame";
import { usePaintStore } from "../../state/store";
import { saveImage } from "../../io/fileIO";

export function SavePromptDialog({
  isOpen,
  onClose,
  onProceed,
}: {
  isOpen: boolean;
  onClose: () => void;
  onProceed?: () => void;
}) {
  const filePath = usePaintStore((s) => s.filePath);
  const name = filePath ? filePath.split("/").pop() : "Untitled";

  if (!isOpen) return null;

  const handleSave = async () => {
    const saved = await saveImage(false);
    if (saved) {
      onClose();
      onProceed?.();
    }
  };

  const handleDontSave = () => {
    usePaintStore.getState().setIsDirty(false);
    onClose();
    onProceed?.();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <DialogFrame title="Paint" onClose={handleCancel}>
      <div className="w-[380px] p-5 text-sm select-none">
        <p className="text-ink text-sm mb-6">
          Do you want to save changes to <span className="font-semibold">{name}</span>?
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-[#0078d4] hover:bg-[#106ebe] active:bg-[#005a9e] px-4 py-1.5 font-medium text-white shadow-sm transition-colors text-xs"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleDontSave}
            className="rounded bg-surface-muted border border-edge px-3.5 py-1.5 font-medium text-ink hover:bg-surface-hover active:bg-surface transition-colors text-xs"
          >
            Don't Save
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded bg-surface-muted border border-edge px-3.5 py-1.5 font-medium text-ink hover:bg-surface-hover active:bg-surface transition-colors text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
