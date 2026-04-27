import { useState } from 'react'
import type { WidgetConfig, ChartType, DateRange } from '../../types/dashboard'
import { WIDGET_BY_TYPE } from './widgetCatalog'
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
  Button, Input, FormField,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui'

const CHART_LABELS: Record<ChartType, string> = {
  kpi: 'KPI (número)',
  bar: 'Barras',
  line: 'Línea',
  table: 'Tabla',
}

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Hoy',
  week: 'Esta semana',
  month: 'Este mes',
  quarter: 'Este trimestre',
  year: 'Este año',
  custom: 'Personalizado',
}

interface WidgetConfigProps {
  widget: WidgetConfig
  onSave: (updated: WidgetConfig) => void
  onClose: () => void
}

export default function WidgetConfigModal({ widget, onSave, onClose }: WidgetConfigProps) {
  const def = WIDGET_BY_TYPE[widget.type]
  const [draft, setDraft] = useState<WidgetConfig>({ ...widget })

  function set<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Modal open onOpenChange={(o) => { if (!o) onClose() }}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>{def.label}</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <FormField label="Tipo de gráfico">
            <Select value={draft.chart} onValueChange={(v) => set('chart', v as ChartType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {def.chartTypes.map(ct => (
                  <SelectItem key={ct} value={ct}>{CHART_LABELS[ct]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {def.hasDateRange && (
            <FormField label="Período">
              <Select value={draft.date_range} onValueChange={(v) => set('date_range', v as DateRange)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(dr => (
                    <SelectItem key={dr} value={dr}>{DATE_RANGE_LABELS[dr]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <FormField label="Límite de filas">
            <Input
              type="number"
              min={1}
              max={50}
              value={draft.limit}
              onChange={e => set('limit', Number(e.target.value))}
            />
          </FormField>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { onSave(draft); onClose() }}>Guardar</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
