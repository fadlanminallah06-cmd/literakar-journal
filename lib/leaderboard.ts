export type DateLike = Date | string | number | { toDate?: () => Date } | null | undefined;
export type LeaderboardPeriod = "month" | "all";

export interface LeaderboardJournal {
  id: string;
  studentId?: string;
  studentName?: string;
  classCode?: string;
  bookTitle?: string;
  startPage: number;
  endPage: number;
  status: string;
  finished?: boolean;
  createdAt?: DateLike;
}

export interface LeaderboardOptions {
  period: LeaderboardPeriod;
  month: string;
  refreshKey?: string;
}

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  classCode: string;
  gender?: string;
  journalCount: number;
  totalPagesRead: number;
  booksFinished: number;
}

export interface ClassLeaderboardEntry {
  classCode: string;
  totalStudents: number;
  activeStudents: number;
  journalCount: number;
  totalPagesRead: number;
  booksFinished: number;
}

interface RosterLike {
  uid: string;
  classCode?: string;
  gender?: string;
}

export function toDateSafe(value: DateLike): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function getJakartaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== "literal") values[part.type] = part.value;
  });
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function getMonthKey(date: Date): string {
  const parts = getJakartaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

export function getJakartaWeekdayIndex(date: Date): number {
  const parts = getJakartaDateParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function getLatestMondaySnapshotCutoff(now = new Date()): Date {
  const parts = getJakartaDateParts(now);
  const daysSinceMonday = (getJakartaWeekdayIndex(now) + 6) % 7;
  const WIB = 7 * 60 * 60 * 1000;
  const thisMonday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday, 8) - WIB);
  if (now.getTime() < thisMonday.getTime()) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday - 7, 8) - WIB);
  }
  return thisMonday;
}

export function filterLeaderboardJournals<T extends LeaderboardJournal>(
  journals: T[],
  { period, month, refreshKey }: LeaderboardOptions
): T[] {
  const cutoff = getLatestMondaySnapshotCutoff(refreshKey ? new Date(refreshKey) : new Date());
  return journals.filter((journal) => {
    if (journal.status !== "approved") return false;
    const createdAt = toDateSafe(journal.createdAt);
    if (!createdAt || createdAt > cutoff) return false;
    return period === "all" || getMonthKey(createdAt) === month;
  });
}

/** Bulan ini dan semua bulan yang memiliki jurnal approved, terbaru lebih dulu. */
export function getLeaderboardMonths(journals: LeaderboardJournal[], now = new Date()): string[] {
  const months = new Set<string>([getMonthKey(now)]);
  journals.forEach((journal) => {
    if (journal.status !== "approved") return;
    const createdAt = toDateSafe(journal.createdAt);
    if (createdAt) months.add(getMonthKey(createdAt));
  });
  return Array.from(months).sort().reverse();
}

function pagesOf(journal: LeaderboardJournal): number {
  return Math.max(0, (Number(journal.endPage) || 0) - Number(journal.startPage));
}

export function buildStudentLeaderboard(
  journals: LeaderboardJournal[],
  options: LeaderboardOptions,
  allStudents: RosterLike[] = [],
  limit = Number.MAX_SAFE_INTEGER
): LeaderboardEntry[] {
  const genderById = new Map(allStudents.map((student) => [student.uid, student.gender || ""]));
  const stats = new Map<string, {
    studentName: string;
    classCode: string;
    journalCount: number;
    totalPagesRead: number;
    finishedTitles: Set<string>;
  }>();

  filterLeaderboardJournals(journals, options).forEach((journal) => {
    if (!journal.studentId) return;
    const student = stats.get(journal.studentId) || {
      studentName: journal.studentName || "Murid",
      classCode: journal.classCode || "-",
      journalCount: 0,
      totalPagesRead: 0,
      finishedTitles: new Set<string>(),
    };
    student.journalCount += 1;
    student.totalPagesRead += pagesOf(journal);
    if (journal.finished && journal.bookTitle) {
      student.finishedTitles.add(journal.bookTitle.trim().toLowerCase());
    }
    stats.set(journal.studentId, student);
  });

  return Array.from(stats.entries())
    .map(([studentId, student]) => ({
      studentId,
      studentName: student.studentName,
      classCode: student.classCode,
      gender: genderById.get(studentId) || "",
      journalCount: student.journalCount,
      totalPagesRead: student.totalPagesRead,
      booksFinished: student.finishedTitles.size,
    }))
    .sort(
      (a, b) =>
        b.journalCount - a.journalCount ||
        b.totalPagesRead - a.totalPagesRead ||
        b.booksFinished - a.booksFinished ||
        a.studentName.localeCompare(b.studentName, "id")
    )
    .slice(0, limit);
}

export function buildClassLeaderboard(
  journals: LeaderboardJournal[],
  options: LeaderboardOptions,
  allStudents: RosterLike[] = []
): ClassLeaderboardEntry[] {
  const stats = new Map<string, {
    totalStudents: number;
    active: Set<string>;
    journalCount: number;
    totalPagesRead: number;
    finishedTitles: Set<string>;
  }>();
  const ensure = (classCode: string) => {
    if (!stats.has(classCode)) {
      stats.set(classCode, {
        totalStudents: 0,
        active: new Set(),
        journalCount: 0,
        totalPagesRead: 0,
        finishedTitles: new Set(),
      });
    }
    return stats.get(classCode)!;
  };

  allStudents.forEach((student) => {
    ensure(student.classCode || "-").totalStudents += 1;
  });

  filterLeaderboardJournals(journals, options).forEach((journal) => {
    const studentClass = ensure(journal.classCode || "-");
    studentClass.journalCount += 1;
    studentClass.totalPagesRead += pagesOf(journal);
    studentClass.active.add(journal.studentId || journal.studentName || `legacy-${journal.id}`);
    if (journal.finished && journal.bookTitle) {
      studentClass.finishedTitles.add(journal.bookTitle.trim().toLowerCase());
    }
  });

  return Array.from(stats.entries())
    .map(([classCode, studentClass]) => ({
      classCode,
      totalStudents: studentClass.totalStudents,
      activeStudents: studentClass.active.size,
      journalCount: studentClass.journalCount,
      totalPagesRead: studentClass.totalPagesRead,
      booksFinished: studentClass.finishedTitles.size,
    }))
    .sort(
      (a, b) =>
        b.journalCount - a.journalCount ||
        b.totalPagesRead - a.totalPagesRead ||
        b.booksFinished - a.booksFinished ||
        a.classCode.localeCompare(b.classCode)
    );
}
