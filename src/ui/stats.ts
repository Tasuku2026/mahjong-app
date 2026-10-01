// 戦績（この端末のブラウザに保存）

export interface GameRecord {
  date: string;
  length: 'tonpu' | 'hanchan';
  levels: number[];
  rank: number;
  score: number;
  point: number;
  rounds: number;
  wins: number;
  dealins: number;
  riichi: number;
  calls: number;
  winPoints: number;
}

export interface RoundTally {
  rounds: number;
  wins: number;
  dealins: number;
  riichi: number;
  calls: number;
  winPoints: number;
}

export const emptyTally = (): RoundTally => ({ rounds: 0, wins: 0, dealins: 0, riichi: 0, calls: 0, winPoints: 0 });

const KEY = 'mahjong-stats-v1';
const MAX = 1000;

export function loadRecords(): GameRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveRecord(r: GameRecord): void {
  try {
    const list = loadRecords();
    list.push(r);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* 保存できない環境では記録しない */
  }
}

export function clearRecords(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export interface Summary {
  games: number;
  avgRank: number;
  rankDist: number[];
  winRate: number;
  dealinRate: number;
  riichiRate: number;
  callRate: number;
  avgWin: number;
  totalPoint: number;
}

export function summarize(list: GameRecord[]): Summary {
  const games = list.length;
  const rounds = list.reduce((a, r) => a + r.rounds, 0) || 1;
  const wins = list.reduce((a, r) => a + r.wins, 0);
  const rankDist = [1, 2, 3, 4].map((k) => list.filter((r) => r.rank === k).length);
  return {
    games,
    avgRank: games ? list.reduce((a, r) => a + r.rank, 0) / games : 0,
    rankDist,
    winRate: wins / rounds,
    dealinRate: list.reduce((a, r) => a + r.dealins, 0) / rounds,
    riichiRate: list.reduce((a, r) => a + r.riichi, 0) / rounds,
    callRate: list.reduce((a, r) => a + r.calls, 0) / rounds,
    avgWin: wins ? list.reduce((a, r) => a + r.winPoints, 0) / wins : 0,
    totalPoint: list.reduce((a, r) => a + r.point, 0),
  };
}

/** CPUの平均レベルで分類 */
export function levelBand(levels: number[]): string {
  if (levels.some((l) => l >= 11)) return '鬼・神あり';
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  if (avg < 3.5) return 'Lv1〜3';
  if (avg < 6.5) return 'Lv4〜6';
  return 'Lv7〜10';
}
