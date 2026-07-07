import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { exportRowsToSpreadsheet } from '../lib/spreadsheet';
import { useHospitalStore } from '../stores';
import type { HospitalWithZone } from '../types';
import { Badge, Button } from '../components/ui';

interface ContactRow {
  hospitalId: string;
  hospitalName: string;
  zoneName: string;
  zoneColor: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

function buildContactRows(hospitals: HospitalWithZone[]): ContactRow[] {
  return hospitals.flatMap((hospital) =>
    hospital.contacts.map((contact) => ({
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      zoneName: hospital.zone_name,
      zoneColor: hospital.zone_color,
      name: contact.name,
      role: contact.role ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
    })),
  );
}

// Vista consolidada de todos os contactos registados em todos os hospitais (secção:
// "mostra todos os contactos registados") — só leitura aqui; a edição continua a ser
// feita por hospital, no botão "Contactos" da página Hospitais (Clients.tsx).
export function Contacts() {
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchHospitals();
  }, [fetchHospitals]);

  const allRows = useMemo(() => buildContactRows(hospitals), [hospitals]);

  const filteredRows = useMemo(() => {
    if (!searchText.trim()) return allRows;
    const needle = searchText.toLowerCase();
    return allRows.filter((row) =>
      [row.name, row.role, row.email, row.phone, row.hospitalName, row.zoneName].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [allRows, searchText]);

  function handleExport() {
    exportRowsToSpreadsheet(
      filteredRows.map((row) => ({
        Nome: row.name,
        Cargo: row.role,
        Email: row.email,
        Telefone: row.phone,
        Hospital: row.hospitalName,
        Zona: row.zoneName,
      })),
      'pmplan-contactos.xlsx',
      'Contactos',
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Contactos</h1>
          <Button variant="secondary" onClick={handleExport} disabled={filteredRows.length === 0}>
            Exportar
          </Button>
        </div>

        <input
          type="search"
          placeholder="Procurar por nome, cargo, email, telefone, hospital ou zona…"
          className="mb-4 w-full max-w-md rounded-md border border-gray-300 px-2 py-1 text-sm"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />

        {filteredRows.length === 0 ? (
          <p className="text-sm text-gray-400">
            {allRows.length === 0
              ? 'Sem contactos registados — adiciona-os a partir da página Hospitais.'
              : 'Nenhum contacto corresponde à pesquisa.'}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1.5 pr-2">Nome</th>
                <th className="py-1.5 pr-2">Cargo</th>
                <th className="py-1.5 pr-2">Email</th>
                <th className="py-1.5 pr-2">Telefone</th>
                <th className="py-1.5 pr-2">Hospital</th>
                <th className="py-1.5 pr-2">Zona</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={`${row.hospitalId}-${index}`} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2">{row.name}</td>
                  <td className="py-1.5 pr-2">{row.role || '—'}</td>
                  <td className="py-1.5 pr-2">{row.email || '—'}</td>
                  <td className="py-1.5 pr-2">{row.phone || '—'}</td>
                  <td className="py-1.5 pr-2">{row.hospitalName}</td>
                  <td className="py-1.5 pr-2">
                    <Badge color={row.zoneColor}>{row.zoneName}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
