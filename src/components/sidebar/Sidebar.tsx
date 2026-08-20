import { useCallback, useRef } from 'react';
import { useUiStore } from '../../stores';
import { EquipmentList } from './EquipmentList';
import { EngineerFilter } from './EngineerFilter';
import { ModalityFilter } from './ModalityFilter';
import { ZoneScopeFilter } from './ZoneScopeFilter';
import { LoadMap } from './LoadMap';

// Container recolhível/redimensionável (secção 10): a largura anima na própria <aside>
// (para o calendário reflectir o espaço libertado) e o conteúdo desliza com translateX.
export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const width = useUiStore((state) => state.sidebarWidth);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const resizing = useRef(false);

  const handleResizeStart = useCallback(() => {
    resizing.current = true;

    function handleMove(event: PointerEvent) {
      if (!resizing.current) return;
      setSidebarWidth(event.clientX);
    }
    function handleUp() {
      resizing.current = false;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [setSidebarWidth]);

  return (
    <div className="relative flex h-full shrink-0">
      <aside
        className="h-full overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200"
        style={{ width: collapsed ? 0 : width }}
      >
        {/* `pm-sidebar` é o que fixa a escala densa de toda a coluna (ver index.css):
            os filhos herdam os 12px e só declaram os desvios. */}
        <div
          className="pm-sidebar flex h-full flex-col transition-transform duration-200"
          style={{ width, transform: collapsed ? 'translateX(-100%)' : 'translateX(0)' }}
        >
          {/* h-12 e não menos: é a altura exacta da CalendarToolbar ao lado (py-2 sobre
              botões de 32px), e são as duas únicas linhas horizontais no topo do ecrã —
              desalinhá-las por 4px nota-se mais do que os 12px que se poupavam aqui. */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Planeamento</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ZoneScopeFilter />
            <EngineerFilter />
            <ModalityFilter />
            <EquipmentList />
            <LoadMap />
          </div>
        </div>
        {!collapsed && (
          <div
            onPointerDown={handleResizeStart}
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-brand-400"
          />
        )}
      </aside>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        // top-3 centra o botão de 24px nos 48px do cabeçalho da coluna.
        className="absolute top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs text-gray-500 shadow-sm transition-[left] duration-200 hover:border-gray-400 hover:text-gray-900"
        style={{ left: (collapsed ? 0 : width) - 12 }}
      >
        {collapsed ? '»' : '«'}
      </button>
    </div>
  );
}
