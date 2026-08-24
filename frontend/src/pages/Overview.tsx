// src/pages/Overview.tsx
import { useEffect, useState } from "react";
import {
  StatCard,
  Chart,
  ChartLegend,
  ChartLegendItem,
  ChartDataTable,
  DataTable,
  Skeleton,
  EmptyState,
  Card,
  type DataTableColumn,
} from "@neelamkhan21/ui";
import { Clock, CircleAlert, Users, TrendingUp, Inbox } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { PageHeader } from "../layout/PageHeader";

const API_URL = import.meta.env.VITE_API_URL;

type TrendSeries = { name: string; data: number[] };

type RepoRow = {
  fullName: string;
  avgMergeHours: number;
  openIssues: number;
  contributors: number;
};

export function Overview() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(
    "loading",
  );

  useEffect(() => {
    fetch(`${API_URL}/dashboard/overview`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setStatus(json.repos.length === 0 ? "empty" : "ready");
      });
  }, []);

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Overview"
          description="Everything happening across your tracked repositories."
        />
        <OverviewSkeleton />
      </div>
    );
  }
  if (status === "empty") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Overview"
          description="Everything happening across your tracked repositories."
        />
        <EmptyState
          icon={<Inbox size={32} />}
          title="No repositories synced yet"
          description="The first sync pulls 90 days of pull requests, issues, and commits."
        />
      </div>
    );
  }

  // One row per month, one column per series — the shape both Recharts and
  // ChartDataTable want.
  const trendData = data.trend.months.map((month: string, i: number) => {
    const row: Record<string, string | number> = { month };
    data.trend.series.forEach((s: TrendSeries) => {
      row[s.name] = s.data[i];
    });
    return row;
  });

  const chartColumns = [
    { header: "Month", cell: (row: (typeof trendData)[number]) => row.month },
    ...data.trend.series.map((s: TrendSeries) => ({
      header: s.name,
      cell: (row: (typeof trendData)[number]) => row[s.name],
    })),
  ];

  const repoColumns: DataTableColumn<RepoRow>[] = [
    { key: "fullName", header: "Repository" },
    {
      key: "avgMergeHours",
      header: "Avg. merge time",
      align: "right",
      sortable: true,
    },
    {
      key: "openIssues",
      header: "Open issues",
      align: "right",
      sortable: true,
    },
    {
      key: "contributors",
      header: "Contributors",
      align: "right",
      sortable: true,
    },
  ];

  // DataTable has no "default sort" prop (sorting is click-to-sort only) —
  // pre-sort the rows we hand it instead, matching the old default of
  // ascending by merge time.
  const sortedRepos = [...data.repos].sort(
    (a: RepoRow, b: RepoRow) => a.avgMergeHours - b.avgMergeHours,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Everything happening across your tracked repositories."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard
          label="Avg. time to merge"
          value={data.avgMergeTime.value}
          delta={data.avgMergeTime.delta}
          deltaDirection="down-is-good"
          trend={data.avgMergeTime.sparkline}
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Open issues"
          value={data.openIssues.value}
          delta={data.openIssues.delta}
          deltaDirection="down-is-good"
          trend={data.openIssues.sparkline}
          icon={<CircleAlert size={16} />}
        />
        <StatCard
          label="Contributors, 90 days"
          value={data.contributors.value}
          delta={data.contributors.delta}
          trend={data.contributors.sparkline}
          icon={<Users size={16} />}
        />
        <StatCard
          label="PRs merged this week"
          value={data.prsThisWeek.value}
          delta={data.prsThisWeek.delta}
          trend={data.prsThisWeek.sparkline}
          icon={<TrendingUp size={16} />}
        />
      </div>

      <Chart
        title="PR merge trend"
        description="Average merge time across tracked repositories, by month."
        height={280}
        legend={
          <ChartLegend>
            {data.trend.series.map((s: TrendSeries, i: number) => (
              <ChartLegendItem
                key={s.name}
                color={`var(--chart-${(i % 8) + 1})`}
              >
                {s.name}
              </ChartLegendItem>
            ))}
          </ChartLegend>
        }
        dataTable={
          <ChartDataTable
            caption="PR merge trend by month"
            columns={chartColumns}
            data={trendData}
          />
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <RechartsTooltip />
            {data.trend.series.map((s: TrendSeries, i: number) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={`var(--chart-${(i % 8) + 1})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Chart>

      <Card className="p-1">
        <DataTable
          columns={repoColumns}
          data={sortedRepos}
          getRowId={(r) => r.fullName}
        />
      </Card>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-33" />
      ))}
    </div>
  );
}
