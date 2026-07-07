import { useRef } from 'react';
import { Button } from './Button';

interface ImportExportButtonsProps {
  onExport: () => void;
  onFileSelected: (file: File) => void;
}

// Par de botões reutilizado em Equipamentos/Engenheiros/Hospitais — Exportar descarrega
// já os dados actuais (serve de modelo para reimportar), Importar abre o picker de
// ficheiro (input escondido) e devolve o ficheiro escolhido ao chamador.
export function ImportExportButtons({ onExport, onFileSelected }: ImportExportButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex gap-2">
      <Button type="button" variant="secondary" onClick={onExport}>
        Exportar
      </Button>
      <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
        Importar
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
