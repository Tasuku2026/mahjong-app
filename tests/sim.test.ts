import { describe, it, expect } from 'vitest';
import { Game, GameUI, RoundResult } from '../src/core/game';
import { CpuAgent } from '../src/ai/cpu';
import { DEFAULT_RULES } from '../src/core/types';

function makeUI(check: (g: Game) => void, results: RoundResult[]): GameUI {
  let game: Game | null = null;
  return {
    update() { if (game) check(game); },
    delay: async () => {},
    announce: async () => {},
    showRoundResult: async (g, r) => { game = g; results.push(r); },
  };
}

describe('自動対局', () => {
  it('CPU4人で半荘を複数回回しても破綻しない', async () => {
    const results: RoundResult[] = [];
    let games = 0;
    for (let n = 0; n < 12; n++) {
      const levels = [1, 4, 7, 10];
      const check = (g: Game) => {
        // 牌の総数は常に136枚
        let total = g.live.length + 14 - g.rinshanDrawn;
        for (const p of g.players) {
          total += p.hand.length + p.river.filter((r) => !r.called).length;
          for (const m of p.melds) total += m.tiles.length;
        }
        expect(total + g.kanCount).toBe(136); // 山の末尾から減らした分を加算
      };
      const ui = makeUI(check, results);
      const g = new Game(
        { ...DEFAULT_RULES, gameLength: 'hanchan' },
        levels.map((l, i) => ({ name: `P${i}`, isHuman: false, level: l })),
        levels.map((l) => new CpuAgent(l)),
        ui,
      );
      const st = await g.run();
      games++;
      // 点数の合計 + 供託 = 開始点 × 4
      const sum = g.players.reduce((a, p) => a + p.score, 0) + g.kyoutaku * 1000;
      expect(sum).toBe(100000);
      expect(st.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    }
    const wins = results.filter((r) => r.type === 'win').length;
    const draws = results.filter((r) => r.type === 'draw').length;
    console.log(`games=${games} rounds=${results.length} wins=${wins} draws=${draws}`);
    const yakuCount = new Map<string, number>();
    for (const r of results) for (const w of r.wins) for (const y of w.result.yaku) yakuCount.set(y.name, (yakuCount.get(y.name) ?? 0) + 1);
    console.log([...yakuCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
    expect(wins).toBeGreaterThan(0);
  }, 120000);
});
