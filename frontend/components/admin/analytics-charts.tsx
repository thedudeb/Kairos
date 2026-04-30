"use client";

import { useSyncExternalStore } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import type { ValueType } from "recharts/types/component/DefaultTooltipContent";
import { AnalyticsVolumeToolbar } from "@/components/admin/analytics-volume-toolbar";

interface DayCount   { date: string; count: number }
interface NamedCount { name: string; count: number }

interface AnalyticsData {
  total_applicants: number;
  volume_days: number;
  volume_range_start: string;
  volume_range_end: string;
  volume_by_day: DayCount[];
  stage_distribution: NamedCount[];
  top_institutions: NamedCount[];
  degree_distribution: NamedCount[];
  parse_status_distribution: NamedCount[];
}

// Brand-aligned palette
const INDIGO   = "#6366f1";
const VIOLET   = "#8b5cf6";
const EMERALD  = "#10b981";
const AMBER    = "#f59e0b";
const ROSE     = "#f43f5e";
const SKY      = "#0ea5e9";
const ORANGE   = "#f97316";
const LIME     = "#84cc16";

const PIE_COLORS = [INDIGO, EMERALD, AMBER, VIOLET, ROSE, SKY, ORANGE, LIME];

const STATUS_COLORS: Record<string, string> = {
  Parsed:          EMERALD,
  Pending:         "#94a3b8",
  "In progress":   INDIGO,
  Failed:          ROSE,
  "Needs review":  AMBER,
};

const fmtCount = (v: ValueType | undefined, label: string): [ValueType, string] =>
  [v ?? 0, label];

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function volumeHeading(rs: string, re: string, n: number): string {
  const a = new Date(rs + "T12:00:00");
  const b = new Date(re + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${a.toLocaleDateString("en-US", opts)} — ${b.toLocaleDateString("en-US", opts)} · ${n} days`;
}

function VolumeTick({
  x, y, payload, index,
  volumeDays,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  index?: number;
  volumeDays: number;
}) {
  const step = volumeDays <= 14 ? 2 : volumeDays <= 45 ? 5 : 10;
  if ((index ?? 0) % step !== 0) return null;
  return (
    <text x={x} y={(y ?? 0) + 12} textAnchor="middle" fill="#71717a" fontSize={11}>
      {formatDate(payload?.value ?? "")}
    </text>
  );
}

function subscribePrefersDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useChartTheme() {
  const dark = useSyncExternalStore(
    subscribePrefersDark,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return {
    dark,
    grid:    dark ? "rgba(255,255,255,0.06)" : "#f4f4f5",
    tick:    dark ? "#71717a"                : "#71717a",
    label:   dark ? "#a1a1aa"                : "#52525b",
    border:  dark ? "#27272a"                : "#e4e4e7",
    bg:      dark ? "#18181b"                : "#ffffff",
    cursor:  dark ? "rgba(255,255,255,0.04)" : "#f4f4f5",
  };
}

function tooltipStyle(t: ReturnType<typeof useChartTheme>) {
  return {
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    fontSize: 12,
    padding: "6px 10px",
    backgroundColor: t.bg,
    color: t.dark ? "#e4e4e7" : "#18181b",
  };
}

function ChartCard({ title, children, className = "" }: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function AnalyticsCharts({
  data,
  jobId,
  volumePresetDays,
  volumeCustomActive,
}: {
  data: AnalyticsData;
  jobId: string;
  volumePresetDays: number;
  volumeCustomActive: boolean;
}) {
  const t = useChartTheme();

  if (data.total_applicants === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
        <p className="text-sm text-zinc-400">Charts appear once applications arrive</p>
      </div>
    );
  }

  const firstNonZero = data.volume_by_day.findIndex((d) => d.count > 0);
  const volumeData = firstNonZero > 0
    ? data.volume_by_day.slice(Math.max(0, firstNonZero - 1))
    : data.volume_by_day;

  return (
    <div className="space-y-4">

      {/* ── Volume ── */}
      <ChartCard
        title={`Application volume · ${volumeHeading(data.volume_range_start, data.volume_range_end, data.volume_days)}`}
      >
        <AnalyticsVolumeToolbar
          key={`${data.volume_range_start}-${data.volume_range_end}-${volumePresetDays}-${String(volumeCustomActive)}`}
          jobId={jobId}
          volumeRangeStart={data.volume_range_start}
          volumeRangeEnd={data.volume_range_end}
          presetDaysActive={!volumeCustomActive}
          presetDaysValue={volumePresetDays}
        />
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={volumeData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={INDIGO} stopOpacity={0.25} />
                <stop offset="95%" stopColor={INDIGO} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
            <XAxis
              dataKey="date"
              tick={<VolumeTick volumeDays={data.volume_days} />}
              tickLine={false}
              axisLine={false}
              height={24}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: t.tick }}
              width={28}
            />
            <Tooltip
              contentStyle={tooltipStyle(t)}
              formatter={(v) => fmtCount(v, "Applications")}
              labelFormatter={(l) => formatDate(String(l))}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={INDIGO}
              strokeWidth={2}
              fill="url(#volGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: INDIGO }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Pipeline + Parse ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        <ChartCard title="Pipeline breakdown">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={data.stage_distribution}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: t.tick }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: t.label }}
              />
              <Tooltip
                contentStyle={tooltipStyle(t)}
                formatter={(v) => fmtCount(v, "Applicants")}
                cursor={{ fill: t.cursor }}
              />
              <Bar dataKey="count" fill={VIOLET} radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Parse status">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.parse_status_distribution}
                dataKey="count"
                nameKey="name"
                cx="40%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.parse_status_distribution.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle(t)}
                formatter={(v, name) => fmtCount(v, String(name))}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ fontSize: 12, color: t.label }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Institutions + Degrees ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        <ChartCard title="Top institutions">
          {data.top_institutions.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">No parsed data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.top_institutions}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: t.tick }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: t.label }}
                />
                <Tooltip
                  contentStyle={tooltipStyle(t)}
                  formatter={(v) => fmtCount(v, "Applicants")}
                  cursor={{ fill: t.cursor }}
                />
                <Bar dataKey="count" fill={INDIGO} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Degree distribution">
          {data.degree_distribution.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">No parsed data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.degree_distribution}
                  dataKey="count"
                  nameKey="name"
                  cx="40%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={82}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.degree_distribution.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle(t)}
                  formatter={(v, name) => fmtCount(v, String(name))}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ fontSize: 11, color: t.label }}>
                      {value.length > 20 ? value.slice(0, 18) + "…" : value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
