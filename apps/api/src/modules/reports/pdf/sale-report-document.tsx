import type { SaleReport, SaleReportColumn, SaleReportRow } from '@ikrive/shared';
import { Document, Line, Page, Polyline, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { REPORT_FONTS } from './fonts';

/** Brand tokens (`docs/PLAN.md` › Diseño). */
const COLORS = {
  ink: '#2d3a3a',
  muted: '#5f6b6b',
  mint: '#c5e8e0',
  mintSoft: '#eef8f5',
  line: '#1a3638',
  border: 'rgba(45,58,58,0.1)',
  stripe: '#f9fafb',
  white: '#ffffff',
  /** `--destructive` of the light theme. */
  error: '#c2410c',
};

const CHART = { width: 420, height: 140, inset: 4 };

/** Relative width of each table column; the title takes the rest. */
const COLUMN_WIDTHS: Record<SaleReportColumn, string | undefined> = {
  date: '16%',
  odometer: '16%',
  category: '16%',
  title: undefined,
  cost: '15%',
  annexes: '11%',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingHorizontal: 40,
    paddingBottom: 56,
    fontFamily: REPORT_FONTS.text,
    fontSize: 9.5,
    color: COLORS.ink,
  },
  eyebrow: {
    fontFamily: REPORT_FONTS.text,
    fontWeight: 600,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  title: { fontFamily: REPORT_FONTS.display, fontWeight: 700, fontSize: 24, marginTop: 4 },
  issued: { marginTop: 4, color: COLORS.muted },
  header: { paddingBottom: 16, marginBottom: 20, borderBottomWidth: 2, borderBottomColor: COLORS.mint },
  boxes: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  box: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12 },
  sectionTitle: { fontFamily: REPORT_FONTS.display, fontWeight: 600, fontSize: 13, marginBottom: 8 },
  pair: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 3 },
  pairLabel: { color: COLORS.muted },
  pairValue: { fontWeight: 600, textAlign: 'right', flexShrink: 1 },
  section: { marginBottom: 20 },
  empty: { color: COLORS.muted, paddingVertical: 8 },
  chartBox: { backgroundColor: COLORS.mintSoft, borderRadius: 12, padding: 12 },
  chartRow: { flexDirection: 'row' },
  yAxis: { width: 70, height: CHART.height, justifyContent: 'space-between', paddingRight: 6 },
  axisLabel: { fontSize: 8, color: COLORS.muted },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 70, marginTop: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: COLORS.ink, borderRadius: 6 },
  headerCell: {
    color: COLORS.white,
    fontWeight: 600,
    fontSize: 8.5,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  row: { flexDirection: 'row' },
  stripe: { backgroundColor: COLORS.stripe },
  cell: { paddingVertical: 5, paddingHorizontal: 6 },
  right: { textAlign: 'right' },
  annex: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  annexNotice: { marginTop: 2, color: COLORS.error, fontWeight: 600 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLORS.muted,
  },
});

function Pairs({ rows }: { rows: SaleReportRow[] }) {
  return (
    <View>
      {rows.map((row) => (
        <View key={row.label} style={styles.pair}>
          <Text style={styles.pairLabel}>{row.label}</Text>
          <Text style={styles.pairValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function OdometerChart({ chart }: { chart: SaleReport['chart'] }) {
  if (chart.empty !== null || !chart.xLabels || !chart.yLabels) {
    return <Text style={styles.empty}>{chart.empty}</Text>;
  }
  const { width, height, inset } = CHART;
  // [0, 1] → SVG coordinates; SVG's y grows downwards.
  const points = chart.points
    .map(({ x, y }) => `${inset + x * (width - 2 * inset)},${inset + (1 - y) * (height - 2 * inset)}`)
    .join(' ');
  return (
    <View style={styles.chartBox}>
      <View style={styles.chartRow}>
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>{chart.yLabels[1]}</Text>
          <Text style={styles.axisLabel}>{chart.yLabels[0]}</Text>
        </View>
        <Svg width={width} height={height}>
          <Line x1={0} y1={height} x2={width} y2={height} stroke={COLORS.muted} strokeWidth={0.75} />
          <Line x1={0} y1={0} x2={0} y2={height} stroke={COLORS.muted} strokeWidth={0.75} />
          <Polyline
            points={points}
            fill="none"
            stroke={COLORS.line}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      </View>
      <View style={styles.xAxis}>
        <Text style={styles.axisLabel}>{chart.xLabels[0]}</Text>
        <Text style={styles.axisLabel}>{chart.xLabels[1]}</Text>
      </View>
    </View>
  );
}

const cellStyle = (key: SaleReportColumn) => {
  const width = COLUMN_WIDTHS[key];
  return [width ? { width } : { flex: 1 }, ...(key === 'cost' ? [styles.right] : [])];
};

function MaintenanceTable({ maintenance }: { maintenance: SaleReport['maintenance'] }) {
  if (maintenance.empty !== null) return <Text style={styles.empty}>{maintenance.empty}</Text>;
  return (
    <View>
      {/* Repeated at the top of every page the table spans. */}
      <View style={styles.tableHeader} fixed>
        {maintenance.columns.map((column) => (
          <Text key={column.key} style={[styles.headerCell, ...cellStyle(column.key)]}>
            {column.label}
          </Text>
        ))}
      </View>
      {maintenance.rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id and never reorder.
        <View key={index} style={[styles.row, ...(index % 2 === 1 ? [styles.stripe] : [])]} wrap={false}>
          {maintenance.columns.map((column) => (
            <Text key={column.key} style={[styles.cell, ...cellStyle(column.key)]}>
              {row[column.key] ?? ''}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function AnnexList({ annexes }: { annexes: NonNullable<SaleReport['annexes']> }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{annexes.title}</Text>
      {annexes.items.map((item) => (
        <View key={item.id} style={styles.annex} wrap={false}>
          <Text>{item.label}</Text>
          {item.notice !== null && <Text style={styles.annexNotice}>{item.notice}</Text>}
        </View>
      ))}
    </View>
  );
}

/** Lays out an already built report: it neither translates nor formats anything. */
export function SaleReportDocument({ report }: { report: SaleReport }) {
  const { cover, summary, chart, maintenance, annexes } = report;
  return (
    <Document
      title={`${cover.eyebrow} · ${cover.title}`}
      author="Ikrive"
      creator="Ikrive"
      producer="Ikrive"
      language={report.locale}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{cover.eyebrow}</Text>
          <Text style={styles.title}>{cover.title}</Text>
          <Text style={styles.issued}>{cover.issued}</Text>
        </View>

        <View style={styles.boxes}>
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>{cover.heading}</Text>
            <Pairs rows={cover.rows} />
          </View>
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>{summary.title}</Text>
            <Pairs rows={summary.rows} />
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>{chart.title}</Text>
          <OdometerChart chart={chart} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{maintenance.title}</Text>
          <MaintenanceTable maintenance={maintenance} />
        </View>

        {annexes !== null && <AnnexList annexes={annexes} />}

        <View style={styles.footer} fixed>
          <Text>{report.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
