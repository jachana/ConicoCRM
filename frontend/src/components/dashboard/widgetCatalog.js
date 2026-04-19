export const WIDGET_CATALOG = [
    {
        type: 'ventas_periodo',
        label: 'Ventas del período',
        chartTypes: ['kpi', 'bar', 'line'],
        hasDateRange: true,
        adminOnly: false,
        defaultGrid: {
            kpi: { w: 3, h: 3 },
            bar: { w: 6, h: 4 },
            line: { w: 6, h: 4 },
            default: { w: 6, h: 4 },
        },
    },
    {
        type: 'cotizaciones_abiertas',
        label: 'Cotizaciones abiertas',
        chartTypes: ['kpi', 'bar'],
        hasDateRange: true,
        adminOnly: false,
        defaultGrid: {
            kpi: { w: 3, h: 3 },
            bar: { w: 6, h: 4 },
            default: { w: 3, h: 3 },
        },
    },
    {
        type: 'top_clientes',
        label: 'Top clientes',
        chartTypes: ['table', 'bar'],
        hasDateRange: true,
        adminOnly: false,
        defaultGrid: { default: { w: 6, h: 5 } },
    },
    {
        type: 'top_productos',
        label: 'Top productos',
        chartTypes: ['table', 'bar'],
        hasDateRange: true,
        adminOnly: false,
        defaultGrid: { default: { w: 6, h: 5 } },
    },
    {
        type: 'stock_critico',
        label: 'Stock crítico',
        chartTypes: ['table'],
        hasDateRange: false,
        adminOnly: false,
        defaultGrid: { default: { w: 6, h: 5 } },
    },
    {
        type: 'nv_por_cobrar',
        label: 'NV por cobrar',
        chartTypes: ['kpi', 'table'],
        hasDateRange: false,
        adminOnly: false,
        defaultGrid: {
            kpi: { w: 3, h: 3 },
            table: { w: 6, h: 5 },
            default: { w: 3, h: 3 },
        },
    },
    {
        type: 'cotizaciones_por_vendedor',
        label: 'Cotizaciones por vendedor',
        chartTypes: ['table', 'bar'],
        hasDateRange: true,
        adminOnly: true,
        defaultGrid: { default: { w: 6, h: 5 } },
    },
    {
        type: 'ventas_por_vendedor',
        label: 'Ventas por vendedor',
        chartTypes: ['table', 'bar'],
        hasDateRange: true,
        adminOnly: true,
        defaultGrid: { default: { w: 6, h: 5 } },
    },
];
export const WIDGET_BY_TYPE = Object.fromEntries(WIDGET_CATALOG.map(w => [w.type, w]));
export function getDefaultGrid(def, chart) {
    return def.defaultGrid[chart] ?? def.defaultGrid.default;
}
export function makeWidget(type, chart) {
    const def = WIDGET_BY_TYPE[type];
    const size = getDefaultGrid(def, chart);
    return {
        id: Math.random().toString(36).slice(2, 9),
        type,
        chart,
        date_range: 'month',
        limit: 10,
        grid: { x: 0, y: Infinity, w: size.w, h: size.h },
    };
}
export const TEMPLATES = [
    {
        name: 'Ventas',
        widgets: [
            { type: 'ventas_periodo', chart: 'line' },
            { type: 'top_clientes', chart: 'table' },
            { type: 'top_productos', chart: 'bar' },
        ],
    },
    {
        name: 'Operacional',
        widgets: [
            { type: 'cotizaciones_abiertas', chart: 'kpi' },
            { type: 'stock_critico', chart: 'table' },
            { type: 'nv_por_cobrar', chart: 'kpi' },
        ],
    },
    {
        name: 'Completo',
        widgets: [
            { type: 'ventas_periodo', chart: 'bar' },
            { type: 'cotizaciones_abiertas', chart: 'kpi' },
            { type: 'top_clientes', chart: 'table' },
            { type: 'top_productos', chart: 'table' },
            { type: 'stock_critico', chart: 'table' },
            { type: 'nv_por_cobrar', chart: 'kpi' },
            { type: 'cotizaciones_por_vendedor', chart: 'table' },
            { type: 'ventas_por_vendedor', chart: 'table' },
        ],
    },
];
export function applyTemplate(template, adminOnly) {
    return template.widgets
        .filter(w => adminOnly || !WIDGET_BY_TYPE[w.type].adminOnly)
        .map(w => makeWidget(w.type, w.chart));
}
