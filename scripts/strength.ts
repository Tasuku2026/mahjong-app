// CPU同士を対局させてレベルごとの成績を比べる
// 実行: npx vite-node scripts/strength.ts [対局数] [レベル1,レベル2,レベル3,レベル4]
import { Game, GameUI, RoundResult } from '../src/core/game';
import { CpuAgent } from '../src/ai/cpu';
import { DEFAULT_RULES } from '../src/core/types';

const games = Number(process.argv[2] ?? 20);
const levels = (process.argv[3] ?? '1,4,7,10').split(',').map(Number);

interface Stat { rank: number; games: number; wins: number; dealins: number; rounds: number; score: number }
const stats = new Map<number, Stat>(levels.map((l) => [l, { rank: 0, games: 0, wins: 0, dealins: 0, rounds: 0, score: 0 }]));

async function main() {
  const t0 = Date.now();
  for (let n = 0; n < games; n++) {
    // 席をずらして公平にする
    const seatLevels = levels.map((_, i) => levels[(i + n) % 4]);
    const results: RoundResult[] = [];
    const ui: GameUI = {
      update() {},
      delay: async () => {},
      announce: async () => {},
      showRoundResult: async (_g, r) => { results.push(r); },
    };
    const g = new Game(
      { ...DEFAULT_RULES, gameLength: 'tonpu' },
      seatLevels.map((l, i) => ({ name: `L${l}-${i}`, isHuman: false, level: l })),
      seatLevels.map((l) => new CpuAgent(l)),
      ui,
    );
    const st = await g.run();
    for (const s of st) {
      const x = stats.get(seatLevels[s.seat])!;
      x.rank += s.rank;
      x.games++;
      x.score += s.score;
    }
    for (const r of results) {
      for (let s = 0; s < 4; s++) stats.get(seatLevels[s])!.rounds++;
      for (const w of r.wins) {
        stats.get(seatLevels[w.seat])!.wins++;
        if (w.from !== null) stats.get(seatLevels[w.from])!.dealins++;
      }
    }
  }
  console.log(`${games} 東風戦 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  for (const [l, x] of stats) {
    console.log(`Lv${String(l).padStart(2)}  平均順位 ${(x.rank / x.games).toFixed(2)}  平均点 ${Math.round(x.score / x.games)}  和了率 ${(100 * x.wins / x.rounds).toFixed(1)}%  放銃率 ${(100 * x.dealins / x.rounds).toFixed(1)}%`);
  }
}
main();
