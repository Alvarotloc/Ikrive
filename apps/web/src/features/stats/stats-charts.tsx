import type { FuelType, VehicleStats } from '@ikrive/shared';
import { type CSSProperties, type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { categorySpendingRows } from './category-spending';
import { useStatsFormat } from './use-stats-format';

const CHART_HEIGHT = 240;
// The first paint uses this size until the container is measured (and in jsdom, which never measures it).
const INITIAL_DIMENSION = { width: 480, height: CHART_HEIGHT };

/** Height of a row of «Spending per category»: below it the axis would skip category names. */
const CATEGORY_ROW_HEIGHT = 22;
/** What the category chart takes besides its rows: the number axis, the legend and the margins. */
const CATEGORY_CHART_CHROME = 70;

// Theme tokens: the dark mode switches them, so the charts follow it with no extra code.
// Other expenses use the warning amber: `--color-deep` is almost the card in dark mode and almost the fuel
// series in light mode, while the amber stands out from both teal series and the card in both themes.
const COLORS = {
  primary: 'var(--color-primary)',
  fuel: 'var(--color-primary)',
  maintenance: 'var(--color-accent-strong)',
  expenses: 'var(--color-warning)',
  grid: 'var(--color-border)',
  text: 'var(--color-muted-foreground)',
};

const tick = { fill: COLORS.text, fontSize: 12 };
const axis = { stroke: COLORS.grid };
const tooltipStyle: CSSProperties = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-foreground)',
  fontSize: 13,
};
const tooltipCursor = { fill: 'var(--color-accent)', opacity: 0.4 };

/** A chart with its caption, or the text that explains what is missing when there is no data. */
export function ChartFigure({
  title,
  empty,
  emptyText,
  height = CHART_HEIGHT,
  children,
}: {
  title: string;
  empty: boolean;
  emptyText: string;
  /** Height of the chart, `CHART_HEIGHT` by default. */
  height?: number;
  children: ReactNode;
}) {
  // Not every browser (nor jsdom) names a figure after its caption: link them explicitly.
  const captionId = useId();
  return (
    <figure
      aria-labelledby={captionId}
      className="grid min-w-0 content-start gap-3 rounded-lg border bg-card/70 p-4"
    >
      <figcaption id={captionId} className="label-caps">
        {title}
      </figcaption>
      {empty ? (
        <p className="py-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ResponsiveContainer width="100%" height={height} initialDimension={{ ...INITIAL_DIMENSION, height }}>
          {children}
        </ResponsiveContainer>
      )}
    </figure>
  );
}

/**
 * The four statistics charts: distance and spending per month, consumption per segment and spending per
 * category (maintenance and other expenses together).
 */
export function StatsCharts({ stats, fuelType }: { stats: VehicleStats; fuelType: FuelType }) {
  const { t } = useTranslation();
  const format = useStatsFormat(fuelType);
  const { distanceByMonth, consumptionBySegment, spendingByMonth } = stats.series;
  const byCategory = categorySpendingRows(stats.spending, t);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartFigure
        title={t('stats.charts.distanceByMonth')}
        empty={distanceByMonth.length === 0}
        emptyText={t('stats.empty.distanceByMonth')}
      >
        <BarChart data={distanceByMonth}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="month" tickFormatter={format.month} tick={tick} {...axis} />
          <YAxis tickFormatter={format.number} tick={tick} width={56} allowDecimals={false} {...axis} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={tooltipCursor}
            labelFormatter={(label) => format.month(String(label))}
            formatter={(value) => format.distance(Number(value))}
          />
          <Bar
            dataKey="distance"
            name={t('stats.series.distance')}
            fill={COLORS.primary}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartFigure>

      <ChartFigure
        title={t('stats.charts.consumptionBySegment')}
        empty={consumptionBySegment.length === 0}
        emptyText={t('stats.empty.consumptionBySegment')}
      >
        <LineChart data={consumptionBySegment}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="endDate" tickFormatter={format.shortDate} tick={tick} {...axis} />
          <YAxis tickFormatter={format.number} tick={tick} width={56} allowDecimals={false} {...axis} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_, payload) => {
              const segment = payload[0]?.payload as (typeof consumptionBySegment)[number] | undefined;
              if (!segment) return null;
              return (
                <>
                  {`${format.date(segment.startDate)} – ${format.date(segment.endDate)}`}
                  <br />
                  {format.distance(segment.distance)}
                </>
              );
            }}
            formatter={(value) => format.consumption(Number(value))}
          />
          <Line
            dataKey="consumption"
            name={t('stats.series.consumption')}
            stroke={COLORS.primary}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS.primary }}
            type="linear"
          />
        </LineChart>
      </ChartFigure>

      <ChartFigure
        title={t('stats.charts.spendingByMonth')}
        empty={spendingByMonth.length === 0}
        emptyText={t('stats.empty.spendingByMonth')}
      >
        <BarChart data={spendingByMonth}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="month" tickFormatter={format.month} tick={tick} {...axis} />
          <YAxis tickFormatter={format.number} tick={tick} width={56} {...axis} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={tooltipCursor}
            labelFormatter={(label) => format.month(String(label))}
            formatter={(value) => format.money(Number(value))}
          />
          {/* Recharts colors the legend text like its series: keep it readable on both themes. */}
          <Legend
            wrapperStyle={{ fontSize: 13 }}
            formatter={(value) => <span style={{ color: 'var(--color-foreground)' }}>{value}</span>}
          />
          <Bar dataKey="fuel" name={t('stats.series.fuel')} stackId="spending" fill={COLORS.fuel} />
          <Bar
            dataKey="maintenance"
            name={t('stats.series.maintenance')}
            stackId="spending"
            fill={COLORS.maintenance}
          />
          <Bar
            dataKey="expenses"
            name={t('stats.series.expenses')}
            stackId="spending"
            fill={COLORS.expenses}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartFigure>

      <ChartFigure
        title={t('stats.charts.spendingByCategory')}
        empty={byCategory.length === 0}
        emptyText={t('stats.empty.spendingByCategory')}
        height={Math.max(CHART_HEIGHT, byCategory.length * CATEGORY_ROW_HEIGHT + CATEGORY_CHART_CHROME)}
      >
        <BarChart data={byCategory} layout="vertical">
          <CartesianGrid horizontal={false} stroke={COLORS.grid} />
          <XAxis type="number" tickFormatter={format.number} tick={tick} {...axis} />
          {/* Wide enough for the longest category name ("Inspección", "Reparación", "Neumáticos"). */}
          {/* Every row is a different category: never skip its name. */}
          <YAxis type="category" dataKey="name" tick={tick} width={96} interval={0} {...axis} />
          {/* Each row has a value in one series only: `filterNull` (the default) leaves the other out. */}
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={tooltipCursor}
            filterNull
            formatter={(value) => format.money(Number(value))}
          />
          <Legend
            wrapperStyle={{ fontSize: 13 }}
            formatter={(value) => <span style={{ color: 'var(--color-foreground)' }}>{value}</span>}
          />
          <Bar
            dataKey="maintenance"
            name={t('stats.series.maintenance')}
            stackId="category"
            fill={COLORS.maintenance}
            radius={[0, 4, 4, 0]}
          />
          <Bar
            dataKey="expenses"
            name={t('stats.series.expenses')}
            stackId="category"
            fill={COLORS.expenses}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ChartFigure>
    </div>
  );
}
