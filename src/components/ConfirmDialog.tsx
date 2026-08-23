"use client";

import Modal from "./Modal";
import { dangerButton, primaryButton, secondaryButton } from "@/lib/ui";

interface Props {
  title: string;
  /** Hva som faktisk skjer — særlig hva som slettes med på kjøpet. */
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

/**
 * Erstatter window.confirm for handlinger som ikke kan angres. Den innebygde
 * dialogen kunne ikke forklare hva som forsvant, fulgte ikke temaet, og blir
 * blokkert i enkelte nettlesersammenhenger.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = true,
}: Props) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} className={secondaryButton()}>
            Avbryt
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={destructive ? dangerButton() : primaryButton()}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-muted">{body}</div>
    </Modal>
  );
}
