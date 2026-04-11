import { useI18n } from "../i18n/index.js";
import { useLayoutEffect, useRef, useState } from "react";
import type { AgentRole, PermissionMode } from "../store/studio-store.js";

type ComposerProps = {
  value: string;
  attachments?: Array<{ id: string; data: string; mimeType: string }>;
  disabled?: boolean;
  canStop: boolean;
  currentRunId: string | null;
  permissionMode: PermissionMode;
  agentRole: AgentRole;
  onChange: (value: string) => void;
  onPermissionModeChange: (permissionMode: PermissionMode) => void;
  onAgentRoleChange: (role: AgentRole) => void;
  onAddAttachment?: (attachment: { id: string; data: string; mimeType: string }) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onStop: () => void;
  onSubmit: () => void;
};

export function Composer({
  value,
  attachments = [],
  disabled,
  canStop,
  currentRunId,
  permissionMode,
  agentRole,
  onChange,
  onPermissionModeChange,
  onAgentRoleChange,
  onAddAttachment,
  onRemoveAttachment,
  onStop,
  onSubmit,
}: ComposerProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as string;
      onAddAttachment?.({
        id: `${Date.now()}-${Math.random()}`,
        data,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        event.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          processImageFile(blob);
        }
        break;
      }
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const hasImages = event.dataTransfer.types.includes("Files");
    if (hasImages) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = event.dataTransfer.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        processImageFile(file);
      }
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        processImageFile(file);
      }
    }

    // Clear the input so the same file can be selected again
    event.currentTarget.value = "";
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`composer ${isDragging ? "dragging" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />
      <div className="composer-toolbar">
        <div className="composer-mode-control" aria-label={t("composer.permissionLabel")}>
          <span className="composer-mode-label">{t("composer.permissionLabel")}</span>
          <div className="composer-mode-segmented">
            <button
              className={permissionMode === "default" ? "locale-button active" : "locale-button"}
              onClick={() => onPermissionModeChange("default")}
              type="button"
            >
              {t("composer.permissionDefault")}
            </button>
            <button
              className={permissionMode === "full_access" ? "locale-button active" : "locale-button"}
              onClick={() => onPermissionModeChange("full_access")}
              type="button"
            >
              {t("composer.permissionFullAccess")}
            </button>
          </div>
        </div>
        <div className="composer-role-control" aria-label={t("composer.roleLabel")}>
          <span className="composer-mode-label">{t("composer.roleLabel")}</span>
          <select
            className="composer-role-select"
            value={agentRole}
            onChange={(e) => onAgentRoleChange(e.target.value as AgentRole)}
          >
            <option value="default">{t("composer.roleDefault")}</option>
            <option value="planner">{t("composer.rolePlanner")}</option>
            <option value="builder">{t("composer.roleBuilder")}</option>
            <option value="reviewer">{t("composer.roleReviewer")}</option>
          </select>
        </div>
      </div>
      {attachments && attachments.length > 0 ? (
        <div className="composer-attachments">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="attachment-chip">
              <span className="attachment-label">📎 {t("composer.pastedImage")}</span>
              <button
                className="attachment-remove"
                onClick={() => onRemoveAttachment?.(attachment.id)}
                type="button"
                title={t("composer.removeAttachment")}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="composer-shell">
        <textarea
          ref={textareaRef}
          id="studio-composer"
          className="composer-input"
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          onPaste={handlePaste}
          placeholder={t("composer.placeholder")}
        />
        <button
          className="ghost-button attachment-button"
          onClick={openFilePicker}
          type="button"
          title={t("composer.addAttachment")}
        >
          📎
        </button>
        <button
          className={canStop ? "ghost-button stop-button active" : "ghost-button stop-button"}
          disabled={!canStop}
          onClick={onStop}
          type="button"
        >
          {t("composer.stop")}
        </button>
        <button
          className="primary-button"
          disabled={disabled || !value.trim()}
          onClick={onSubmit}
          type="button"
        >
          {t("composer.run")}
        </button>
      </div>
      <div className="composer-actions">
        <p className="composer-hint">{t("composer.hint")}</p>
        {currentRunId ? <p className="composer-run-id">{currentRunId}</p> : null}
      </div>
    </div>
  );
}
