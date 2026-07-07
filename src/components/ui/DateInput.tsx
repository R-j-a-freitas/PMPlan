import { useEffect, useState, type InputHTMLAttributes } from 'react';

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Valor em 'yyyy-MM-dd' (formato da BD), ou '' se vazio. */
  value: string;
  onChange: (isoDate: string) => void;
}

function isoToDisplay(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

function displayToIso(display: string): string {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, day, month, year] = match;
  const dayNum = Number(day);
  const monthNum = Number(month);
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return '';
  return `${year}-${month}-${day}`;
}

function maskDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

// Input de data com máscara DD/MM/AAAA fixa. `<input type="date">` nativo segue o locale
// do browser/SO para a apresentação (ex.: mostra MM/DD/AAAA mesmo com `lang="pt"` na
// página) — por isso o formato é imposto aqui em vez de depender do picker nativo.
export function DateInput({ value, onChange, className = '', disabled, ...props }: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value));

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="DD/MM/AAAA"
      maxLength={10}
      disabled={disabled}
      className={`rounded-md border border-gray-300 px-2 py-1 disabled:bg-gray-100 ${className}`}
      value={text}
      onChange={(event) => {
        const masked = maskDisplay(event.target.value);
        setText(masked);
        const iso = displayToIso(masked);
        if (iso) onChange(iso);
      }}
      onBlur={() => {
        // Data incompleta/inválida ao sair do campo → repõe o último valor válido.
        if (!displayToIso(text)) setText(isoToDisplay(value));
      }}
      {...props}
    />
  );
}
