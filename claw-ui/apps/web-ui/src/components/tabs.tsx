import type { TabId } from "../types/ui.js";

type TabsProps = {
  current: TabId;
  onChange: (tab: TabId) => void;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "run", label: "Run" },
  { id: "settings", label: "Settings" },
  { id: "logs", label: "Logs" },
];

export function Tabs({ current, onChange }: TabsProps) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={tab.id === current ? "tab active" : "tab"}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
