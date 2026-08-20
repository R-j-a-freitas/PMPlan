import { useState, type ReactNode } from 'react';

/** Recuo por nível de hierarquia, em píxeis. Vive aqui — com a moldura partilhada das
 *  secções — porque as quatro listas com árvore (zonas, engenheiros, modalidades, carga)
 *  têm de recuar todas o mesmo: numa coluna de 300px, 16px por nível a quatro níveis
 *  comem metade da largura e é o nome do equipamento que fica truncado para dar lugar a
 *  espaço em branco. 12px chegam para se ver o degrau. */
export const SIDEBAR_INDENT_PX = 12;

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
    <div className="border-b border-gray-200 px-2 py-1.5">
      <div className="mb-0.5 flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expandir ${title}` : `Colapsar ${title}`}
          className="flex flex-1 items-center gap-1.5 text-left text-gray-400 hover:text-gray-600"
        >
          <span className="pm-sidebar-caret">{collapsed ? '▸' : '▾'}</span>
          <h3 className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        </button>
        {titleAccessory}
      </div>
      {!collapsed && children}
    </div>
  );
}
