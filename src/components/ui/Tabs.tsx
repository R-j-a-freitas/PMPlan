import type { ReactNode } from 'react';

interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
}

interface TabsProps<K extends string> {
  tabs: readonly TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
}

// Separadores dentro de uma página (ex. Aprovações → workflow / templates / destinatários).
// Sublinhado na cor da marca no activo — a mesma linguagem da navegação da Topbar, para
// não haver duas gramáticas de "onde estou" na mesma app.
export function Tabs<K extends string>({ tabs, active, onChange }: TabsProps<K>) {
  return (
    <div className="mb-4 flex gap-1 border-b border-gray-200" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
