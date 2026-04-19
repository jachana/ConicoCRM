import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import { api } from '../lib/api';
import type { Factura } from '../types/index';

const ESTADO_COLORS: Record<string, string> = {
  emitida:  'bg-blue-100 text-blue-800',
  pagada:   'bg-green-100 text-green-800',
  anulada:  'bg-red-100 text-red-800',
};

export default function Facturas() {
  const [estado, setEstado] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const params = new URLSearchParams();
  if (estado) params.set('estado', estado);
  if (fechaDesde) params.set('fecha_desde', fechaDesde);
  if (fechaHasta) params.set('fecha_hasta', fechaHasta);

  const { data: facturas = [], isLoading } = useQuery<Factura[]>({
    queryKey: ['facturas', estado, fechaDesde, fechaHasta],
    queryFn: () =>
      api.get(`/api/facturas/?${params.toString()}`).then((r) => r.data),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
        <div className="flex gap-2">
          <a
            href="/api/facturas/export/excel"
            className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Download size={16} /> Excel
          </a>
          <Link
            to="/facturas/nueva"
            className="flex items-center gap-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Plus size={16} /> Nueva Factura
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="emitida">Emitida</option>
          <option value="pagada">Pagada</option>
          <option value="anulada">Anulada</option>
        </select>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        />
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        />
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nº</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Vencimiento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/facturas/${f.id}`} className="text-indigo-600 hover:underline font-mono font-medium">
                      FAC-{String(f.numero).padStart(5, '0')}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {f.fecha ? new Date(f.fecha + 'T00:00:00').toLocaleDateString('es-CL') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {f.fecha_vencimiento
                      ? new Date(f.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-CL')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {f.cliente?.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[f.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {f.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ${f.total.toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}
              {facturas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No hay facturas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
