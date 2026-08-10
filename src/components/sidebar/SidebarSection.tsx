import { useState, type ReactNode } from 'react';

interface SidebarSectionProps {
  title: string;
  /** Elemento opcional à direita do título (ex. o ícone "i" das métricas de carga). */
  titleAccessory?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

// Cabeçalho colapsável partilhado por todas as secções da Sidebar (Zonas, Engenheiros,
// Equipamentos, Carga…) — colapsar esconde o conteúdo só visualmente, para poupar espaço;
// não mexe em nenhuma selecção/filtro, que continuam a vir das stores. Mesma seta ▸/▾ já
// usada nas zonas dentro de cada secção.
export function SidebarSection({ title, titleAccessory, defaultCollapsed = false, children }: SidebarSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="border-b border-gray-200 p-2">
      <div className="mb-1 flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expandir ${title}` : `Colapsar ${title}`}
          className="flex flex-1 items-center gap-1 text-left text-gray-400 hover:text-gray-600"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">{collapsed ? '▸' : '▾'}</span>
          <h3 className="truncate text-xs font-semibold uppercase text-gray-500">{title}</h3>
        </button>
        {titleAccessory}
      </div>
      {!collapsed && children}
    </div>
  );
}
