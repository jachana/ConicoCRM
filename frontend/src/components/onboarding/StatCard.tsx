export function Stat({ label, value, color = 'gray' }: { label: string; value: number; color?: 'green' | 'yellow' | 'red' | 'gray' | 'blue' }) {
  const colorCls: Record<string, string> = {
    green: 'text-green-700 dark:text-green-400',
    yellow: 'text-yellow-700 dark:text-yellow-400',
    blue: 'text-blue-700 dark:text-blue-400',
    red: 'text-red-700 dark:text-red-400',
    gray: 'text-gray-700 dark:text-gray-300',
  }
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${colorCls[color] ?? colorCls.gray}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  )
}
