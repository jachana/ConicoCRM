import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui'
import TelemetryRoutesTab from '../components/config/TelemetryRoutesTab'

export default function AdminTelemetria() {
  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Telemetría</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Métricas de rendimiento y costos operacionales de la plataforma.
      </p>

      <Tabs defaultValue="routes">
        <TabsList variant="underline">
          <TabsTrigger value="routes">Rutas</TabsTrigger>
        </TabsList>
        <TabsContent value="routes">
          <TelemetryRoutesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
