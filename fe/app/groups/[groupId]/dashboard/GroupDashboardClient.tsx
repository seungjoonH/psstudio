// 그룹 대시보드에서 통계 카드와 그래프 레이아웃을 렌더링합니다.
"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useI18n } from "../../../../src/i18n/I18nProvider";
import { Badge } from "../../../../src/ui/Badge";
import { UserAvatar } from "../../../../src/ui/UserAvatar";
import styles from "./GroupDashboardClient.module.css";

export type DashboardMember = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
  role: string;
  joinedAt: string;
};

export type DashboardAssignment = {
  id: string;
  title: string;
  platform: string;
  dueAt: string;
  isLate: boolean;
};

export type DashboardSubmission = {
  id: string;
  assignmentId: string;
  authorUserId: string;
  authorNickname: string;
  isLate: boolean;
  createdAt: string;
  language: string;
};

type Props = {
  groupId: string;
  members: DashboardMember[];
  assignments: DashboardAssignment[];
  submissions: DashboardSubmission[];
};

type MemberStat = {
  userId: string;
  nickname: string;
  profileImageUrl: string;
  solvedAssignments: number;
  submissionCount: number;
  onTimeRate: number;
  activeDays: number;
  streak: number;
};

type PieSlice = { label: string; value: number; color: string };

const RANGE_OPTIONS = [7, 30, 90] as const;
const PIE_COLORS = ["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee"];

function memberPieMetric(member: MemberStat, sort: "solved" | "submissions" | "onTime" | "streak"): number {
  switch (sort) {
    case "solved":
      return member.solvedAssignments;
    case "submissions":
      return member.submissionCount;
    case "onTime": {
      const n = member.submissionCount;
      if (n === 0) return 0;
      return Math.round((member.onTimeRate / 100) * n);
    }
    case "streak":
      return member.streak;
    default:
      return member.submissionCount;
  }
}

export function GroupDashboardClient({ groupId, members, assignments, submissions }: Props) {
  const { t } = useI18n();
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [memberSort, setMemberSort] = useState<"solved" | "submissions" | "onTime" | "streak">("solved");

  const analysis = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - (rangeDays - 1) * 24 * 3600 * 1000);
    cutoff.setHours(0, 0, 0, 0);
    const filtered = submissions.filter((submission) => new Date(submission.createdAt) >= cutoff);

    const dailyBuckets = new Map<string, number>();
    for (let i = 0; i < rangeDays; i += 1) {
      const d = new Date(cutoff.getTime() + i * 24 * 3600 * 1000);
      dailyBuckets.set(toDateKey(d), 0);
    }
    for (const submission of filtered) {
      const key = toDateKey(new Date(submission.createdAt));
      dailyBuckets.set(key, (dailyBuckets.get(key) ?? 0) + 1);
    }
    const dailySeries = Array.from(dailyBuckets.entries()).map(([date, count]) => ({ date, count }));

    const byMember = new Map<string, MemberStat & { assignmentSet: Set<string>; daySet: Set<string> }>();
    for (const member of members) {
      byMember.set(member.userId, {
        userId: member.userId,
        nickname: member.nickname,
        profileImageUrl: member.profileImageUrl,
        solvedAssignments: 0,
        submissionCount: 0,
        onTimeRate: 0,
        activeDays: 0,
        streak: 0,
        assignmentSet: new Set<string>(),
        daySet: new Set<string>(),
      });
    }
    let totalLate = 0;
    for (const submission of filtered) {
      const stat = byMember.get(submission.authorUserId);
      if (stat === undefined) continue;
      stat.submissionCount += 1;
      if (!submission.isLate) stat.onTimeRate += 1;
      if (submission.isLate) totalLate += 1;
      stat.assignmentSet.add(submission.assignmentId);
      stat.daySet.add(toDateKey(new Date(submission.createdAt)));
    }
    const memberStats: MemberStat[] = Array.from(byMember.values()).map((stat) => {
      const solvedAssignments = stat.assignmentSet.size;
      const submissionCount = stat.submissionCount;
      const onTimeRate = submissionCount === 0 ? 0 : (stat.onTimeRate / submissionCount) * 100;
      const activeDays = stat.daySet.size;
      const streak = calcStreak(stat.daySet, now);
      return {
        userId: stat.userId,
        nickname: stat.nickname,
        profileImageUrl: stat.profileImageUrl,
        solvedAssignments,
        submissionCount,
        onTimeRate,
        activeDays,
        streak,
      };
    });

    memberStats.sort((a, b) => {
      if (memberSort === "solved") return b.solvedAssignments - a.solvedAssignments || b.submissionCount - a.submissionCount;
      if (memberSort === "submissions") return b.submissionCount - a.submissionCount || b.solvedAssignments - a.solvedAssignments;
      if (memberSort === "onTime") return b.onTimeRate - a.onTimeRate || b.solvedAssignments - a.solvedAssignments;
      return b.streak - a.streak || b.solvedAssignments - a.solvedAssignments;
    });

    const activeMembers = memberStats.filter((member) => member.submissionCount > 0).length;
    const participationRate = members.length === 0 ? 0 : (activeMembers / members.length) * 100;
    const lateRate = filtered.length === 0 ? 0 : (totalLate / filtered.length) * 100;

    const platformCount = new Map<string, number>();
    for (const assignment of assignments) {
      platformCount.set(assignment.platform, (platformCount.get(assignment.platform) ?? 0) + 1);
    }
    const platformShare = Array.from(platformCount.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    const contributors = memberStats.filter((member) => member.submissionCount > 0);
    const pieBase = contributors.slice(0, 5).map((member, index) => ({
      label: member.nickname,
      value: memberPieMetric(member, memberSort),
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
    const otherValue = contributors.slice(5).reduce((sum, member) => sum + memberPieMetric(member, memberSort), 0);
    const pieSlices: PieSlice[] =
      otherValue > 0 ? [...pieBase, { label: t("groupDashboard.other"), value: otherValue, color: "#94a3b8" }] : pieBase;

    const assignmentHealth = assignments
      .map((assignment) => {
        const rows = filtered.filter((submission) => submission.assignmentId === assignment.id);
        const participantIds = new Set(rows.map((submission) => submission.authorUserId));
        const participantCount = participantIds.size;
        const participation = members.length === 0 ? 0 : (participantCount / members.length) * 100;
        const lateRateByAssignment = rows.length === 0 ? 0 : (rows.filter((submission) => submission.isLate).length / rows.length) * 100;
        const lastSubmissionAt = rows.length === 0 ? null : rows.reduce((latest, row) => (row.createdAt > latest ? row.createdAt : latest), rows[0].createdAt);
        return {
          id: assignment.id,
          title: assignment.title,
          platform: assignment.platform,
          dueAt: assignment.dueAt,
          participation,
          participantCount,
          lateRate: lateRateByAssignment,
          pendingMembers: Math.max(0, members.length - participantCount),
          lastSubmissionAt,
        };
      })
      .sort((a, b) => a.participation - b.participation);

    return {
      filtered,
      memberStats,
      activeMembers,
      participationRate,
      lateRate,
      dailySeries,
      pieSlices,
      assignmentHealth,
      platformShare,
    };
  }, [assignments, memberSort, members, rangeDays, submissions, t]);

  const peakDaily = analysis.dailySeries.reduce((max, point) => Math.max(max, point.count), 0);

  const sortMetricLabel =
    memberSort === "solved"
      ? t("groupDashboard.sort.solved")
      : memberSort === "submissions"
        ? t("groupDashboard.sort.submissions")
        : memberSort === "onTime"
          ? t("groupDashboard.sort.onTime")
          : t("groupDashboard.sort.streak");

  return (
    <div className={styles.root}>
      <section className={styles.filterBar}>
        <div className={styles.segment}>
          {RANGE_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              className={rangeDays === days ? styles.segmentActive : styles.segmentBtn}
              onClick={() => setRangeDays(days)}
            >
              {t("groupDashboard.rangeDays", { days })}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.kpiGrid}>
        <KpiCard label={t("groupDashboard.kpi.totalSubmissions")} value={analysis.filtered.length.toLocaleString()} />
        <KpiCard label={t("groupDashboard.kpi.activeMembers")} value={`${analysis.activeMembers}/${members.length}`} />
        <KpiCard label={t("groupDashboard.kpi.participationRate")} value={`${analysis.participationRate.toFixed(1)}%`} />
        <KpiCard label={t("groupDashboard.kpi.lateRate")} value={`${analysis.lateRate.toFixed(1)}%`} />
      </section>

      <section className={styles.chartGrid}>
        <article className={styles.chartCard}>
          <header className={styles.cardHead}>
            <h3>{t("groupDashboard.chart.submissionTrend")}</h3>
            <span>{t("groupDashboard.chart.peak", { count: peakDaily })}</span>
          </header>
          <div className={styles.lineWrap}>
            <SubmissionTrendChart
              dailySeries={analysis.dailySeries}
              peakDaily={peakDaily}
              ariaLabel={t("groupDashboard.chart.submissionTrend")}
              formatHover={(dateKey, count) =>
                t("groupDashboard.chart.trendDayHover", { date: dateKey.slice(5), count })
              }
            />
            <div className={styles.lineAxis}>
              <span>{analysis.dailySeries[0]?.date.slice(5) ?? ""}</span>
              <span>{analysis.dailySeries[Math.floor(analysis.dailySeries.length / 2)]?.date.slice(5) ?? ""}</span>
              <span>{analysis.dailySeries[analysis.dailySeries.length - 1]?.date.slice(5) ?? ""}</span>
            </div>
          </div>
        </article>

        <article className={styles.chartCard}>
          <header className={styles.cardHead}>
            <h3>{t("groupDashboard.chart.contributionShare")}</h3>
            <span className={styles.cardHeadRight}>
              {t("groupDashboard.chart.pieByMetric", { metric: sortMetricLabel })}
              {" · "}
              {t("groupDashboard.chart.totalContributors", {
                count: analysis.memberStats.filter((member) => member.submissionCount > 0).length,
              })}
            </span>
          </header>
          <div className={styles.pieWrap}>
            <PieChart slices={analysis.pieSlices} />
            <ul className={styles.legend}>
              {analysis.pieSlices.map((slice) => (
                <li key={slice.label}>
                  <span className={styles.legendDot} style={{ background: slice.color }} />
                  <span>{slice.label}</span>
                  <strong>{slice.value}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className={styles.tableCard}>
        <header className={styles.memberTableHead}>
          <div className={styles.memberTableHeadIntro}>
            <h3>{t("groupDashboard.memberTable.title")}</h3>
            <p className={styles.memberTableHint}>{t("groupDashboard.memberSortHint")}</p>
            <span className={styles.memberTablePeriod}>{t("groupDashboard.memberTable.caption")}</span>
          </div>
          <div className={styles.segment} role="group" aria-label={t("groupDashboard.memberSortHint")}>
            {(
              [
                { id: "solved", label: t("groupDashboard.sort.solved") },
                { id: "submissions", label: t("groupDashboard.sort.submissions") },
                { id: "onTime", label: t("groupDashboard.sort.onTime") },
                { id: "streak", label: t("groupDashboard.sort.streak") },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={memberSort === item.id ? styles.segmentActive : styles.segmentBtn}
                onClick={() => setMemberSort(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("groupDashboard.memberTable.member")}</th>
                <th>{t("groupDashboard.memberTable.solved")}</th>
                <th>{t("groupDashboard.memberTable.submissions")}</th>
                <th>{t("groupDashboard.memberTable.onTimeRate")}</th>
                <th>{t("groupDashboard.memberTable.activeDays")}</th>
                <th>{t("groupDashboard.memberTable.streak")}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.memberStats.map((member) => (
                <tr key={member.userId}>
                  <td className={styles.memberCell}>
                    <UserAvatar
                      nickname={member.nickname}
                      imageUrl={member.profileImageUrl}
                      size={24}
                      className={styles.avatar}
                    />
                    <span>{member.nickname}</span>
                  </td>
                  <td>{member.solvedAssignments}</td>
                  <td>{member.submissionCount}</td>
                  <td>{member.onTimeRate.toFixed(1)}%</td>
                  <td>{member.activeDays}</td>
                  <td>{member.streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.bottomGrid}>
        <article className={styles.tableCard}>
          <header className={styles.cardHead}>
            <h3>{t("groupDashboard.assignmentHealth.title")}</h3>
            <span>{t("groupDashboard.assignmentHealth.caption")}</span>
          </header>
          <ul className={styles.assignmentList}>
            {analysis.assignmentHealth.map((assignment) => (
              <li key={assignment.id} className={styles.assignmentRow}>
                <div className={styles.assignmentHead}>
                  <Link href={`/groups/${groupId}/assignments/${assignment.id}`} className={styles.assignmentLink}>
                    {assignment.title}
                  </Link>
                  <Badge tone="neutral">{assignment.platform}</Badge>
                </div>
                <div className={styles.assignmentMeta}>
                  <span>
                    {t("groupDashboard.assignmentHealth.participation", {
                      count: assignment.participantCount,
                      total: members.length,
                      rate: normalizedPercent(assignment.participation).toFixed(1),
                    })}
                  </span>
                  <span>{t("groupDashboard.assignmentHealth.lateRate", { rate: assignment.lateRate.toFixed(1) })}</span>
                  <span>{t("groupDashboard.assignmentHealth.pending", { count: assignment.pendingMembers })}</span>
                </div>
                <div className={styles.assignmentProgress}>
                  <div
                    className={normalizedPercent(assignment.participation) >= 100 ? styles.progressFillFull : undefined}
                    style={{ width: `${normalizedPercent(assignment.participation)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.tableCard}>
          <header className={styles.cardHead}>
            <h3>{t("groupDashboard.platform.title")}</h3>
            <span>{t("groupDashboard.platform.caption")}</span>
          </header>
          <ul className={styles.platformList}>
            {analysis.platformShare.map((platform) => {
              const ratio = assignments.length === 0 ? 0 : (platform.count / assignments.length) * 100;
              return (
                <li key={platform.platform} className={styles.platformRow}>
                  <div className={styles.platformTop}>
                    <strong>{platform.platform}</strong>
                    <span>{platform.count}</span>
                  </div>
                  <div className={styles.assignmentProgress}>
                    <div
                      className={normalizedPercent(ratio) >= 100 ? styles.progressFillFull : undefined}
                      style={{ width: `${normalizedPercent(ratio)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
      </section>
    </div>
  );
}

const TREND_CHART_W = 640;
const TREND_CHART_H = 180;

function SubmissionTrendChart({
  dailySeries,
  peakDaily,
  ariaLabel,
  formatHover,
}: {
  dailySeries: Array<{ date: string; count: number }>;
  peakDaily: number;
  ariaLabel: string;
  formatHover: (dateKey: string, count: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const linePath = buildLinePath(dailySeries, TREND_CHART_W, TREND_CHART_H, peakDaily);
  const areaPath = buildAreaPath(dailySeries, TREND_CHART_W, TREND_CHART_H, peakDaily);
  const safeMax = Math.max(1, peakDaily);
  const n = dailySeries.length;
  const step = n <= 1 ? 0 : TREND_CHART_W / (n - 1);

  function updateHover(clientX: number) {
    const el = wrapRef.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const width = rect.width || 1;
    const xSvg = ((clientX - rect.left) / width) * TREND_CHART_W;
    let idx = n <= 1 ? 0 : Math.round(xSvg / step);
    idx = Math.max(0, Math.min(n - 1, idx));
    setHoverIdx(idx);
  }

  const hovered = hoverIdx !== null && dailySeries[hoverIdx] !== undefined ? dailySeries[hoverIdx] : null;
  const crosshairX = hoverIdx !== null ? hoverIdx * step : null;
  const dotY =
    hovered !== null && crosshairX !== null
      ? TREND_CHART_H - (hovered.count / safeMax) * (TREND_CHART_H - 12) - 6
      : null;

  return (
    <div
      ref={wrapRef}
      className={styles.lineChartHit}
      onMouseMove={(e) => updateHover(e.clientX)}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg
        viewBox={`0 0 ${TREND_CHART_W} ${TREND_CHART_H}`}
        className={styles.lineChart}
        role="img"
        aria-label={ariaLabel}
      >
        <path d={areaPath} className={styles.lineArea} />
        <path d={linePath} className={styles.lineStroke} />
        {crosshairX !== null ? (
          <line x1={crosshairX} y1={0} x2={crosshairX} y2={TREND_CHART_H} className={styles.crosshair} />
        ) : null}
        {crosshairX !== null && dotY !== null ? (
          <circle cx={crosshairX} cy={dotY} r={5} className={styles.hoverDot} />
        ) : null}
      </svg>
      {hovered !== null ? (
        <div
          className={styles.chartTooltip}
          style={{
            left: n <= 1 ? "50%" : `${(hoverIdx! / (n - 1)) * 100}%`,
          }}
        >
          {formatHover(hovered.date, hovered.count)}
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className={styles.kpiCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PieChart({ slices }: { slices: PieSlice[] }) {
  const total = Math.max(1, slices.reduce((sum, slice) => sum + slice.value, 0));
  let acc = -90;
  return (
    <svg viewBox="0 0 220 220" className={styles.pieChart} role="img">
      {slices.map((slice) => {
        const angle = (slice.value / total) * 360;
        const path = donutArc(110, 110, 86, 52, acc, acc + angle);
        acc += angle;
        return <path key={`${slice.label}-${slice.value}`} d={path} fill={slice.color} />;
      })}
      <circle cx="110" cy="110" r="42" fill="var(--color-surface)" />
      <text x="110" y="108" textAnchor="middle" className={styles.pieText}>
        {total}
      </text>
      <text x="110" y="126" textAnchor="middle" className={styles.pieSubText}>
        total
      </text>
    </svg>
  );
}

function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function calcStreak(daySet: Set<string>, now: Date): number {
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (daySet.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function normalizedPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 99.95) return 100;
  if (value <= 0.05) return 0;
  return Math.max(0, Math.min(100, value));
}

function buildLinePath(points: Array<{ date: string; count: number }>, w: number, h: number, maxCount: number): string {
  if (points.length === 0) return "";
  const safeMax = Math.max(1, maxCount);
  const step = points.length <= 1 ? 0 : w / (points.length - 1);
  return points
    .map((point, index) => {
      const x = index * step;
      const y = h - (point.count / safeMax) * (h - 12) - 6;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildAreaPath(points: Array<{ date: string; count: number }>, w: number, h: number, maxCount: number): string {
  if (points.length === 0) return "";
  const line = buildLinePath(points, w, h, maxCount);
  return `${line} L ${w} ${h} L 0 ${h} Z`;
}

function donutArc(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number): string {
  const startOuter = polar(cx, cy, outerR, startDeg);
  const endOuter = polar(cx, cy, outerR, endDeg);
  const startInner = polar(cx, cy, innerR, endDeg);
  const endInner = polar(cx, cy, innerR, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
