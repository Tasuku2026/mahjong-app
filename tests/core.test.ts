import { describe, it, expect } from 'vitest';
import { parseTiles, toCounts, kindOf, EAST, SOUTH } from '../src/core/tiles';
import { calcShanten, getWaits } from '../src/core/shanten';
import { evaluateWin, WinInput, ronPoints, tsumoPoints } from '../src/core/yaku';
import { DEFAULT_RULES, Meld } from '../src/core/types';

const sh = (s: string, melds = 0) => calcShanten(toCounts(parseTiles(s)), melds);

describe('shanten', () => {
  it('和了形', () => {
    expect(sh('123m456p789s11122z')).toBe(-1);
  });
  it('テンパイ', () => {
    expect(sh('123m456p789s1112z')).toBe(0);
    expect(sh('1199m1199p1199s1z')).toBe(0); // 七対子
    expect(sh('19m19p19s1234567z')).toBe(0); // 国士13面
  });
  it('1シャンテン', () => {
    expect(sh('123m456p78s11z359m')).toBe(1);
  });
  it('バラバラ', () => {
    expect(sh('147m258p369s1234z')).toBeGreaterThanOrEqual(5);
  });
  it('待ち', () => {
    const w = getWaits(toCounts(parseTiles('1112345678999m')), 0);
    expect(w).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]); // 九蓮宝燈 9面
  });
});

function win(hand: string, winTile: string, opts: Partial<WinInput> = {}, melds: Meld[] = []) {
  const tiles = parseTiles(hand);
  const wk = kindOf(parseTiles(winTile)[0]);
  const wt = tiles.find((t) => kindOf(t) === wk)!;
  return evaluateWin({
    hand: tiles, melds, winTile: wt, tsumo: false, riichi: 0,
    seatWind: SOUTH, roundWind: EAST, doraIndicators: [], uraIndicators: [],
    rules: { ...DEFAULT_RULES, aka: false }, ...opts,
  });
}

describe('役と点数', () => {
  it('役なしは null', () => {
    // 刻子含みの役なしロン
    expect(win('111m456p789s22333s', '3s')).toBeNull();
  });
  it('リーチのみ 40符1翻 子ロン 1300', () => {
    const r = win('111m456p789s22333s', '3s', { riichi: 1 })!;
    expect(r.han).toBe(1);
    // 20 + 門前ロン10 + 幺九暗刻8 + 中張明刻(シャンポンロン)2 = 40
    expect(r.fu).toBe(40);
    expect(ronPoints(r.base, false)).toBe(1300);
  });
  it('平和ツモ 20符', () => {
    const r = win('234m567p345s678s55p', '8s', { tsumo: true })!;
    const names = r.yaku.map((y) => y.name);
    expect(names).toContain('平和');
    expect(names).toContain('断幺九');
    expect(names).toContain('門前清自摸和');
    expect(r.fu).toBe(20);
    expect(r.han).toBe(3);
    // 20符3翻 子ツモ 700/1300
    expect(tsumoPoints(r.base, false)).toEqual({ dealer: 1300, other: 700 });
  });
  it('七対子 25符', () => {
    const r = win('1199m1199p1199s11z', '1z', { riichi: 1 })!;
    expect(r.fu).toBe(25);
    expect(r.han).toBe(5); // 立直+七対子+混老頭
  });
  it('国士無双', () => {
    const r = win('19m19p19s12345677z', '7z')!;
    expect(r.yakuman).toBe(1);
    expect(ronPoints(r.base, true)).toBe(48000);
  });
  it('清一色 一気通貫', () => {
    const r = win('11123456789999m', '9m')!;
    expect(r).not.toBeNull();
  });
  it('喰いタンなし', () => {
    const melds: Meld[] = [{ type: 'pon', tiles: parseTiles('555p'), from: 0 }];
    const rNo = win('234m456s678s88m', '6s', { rules: { ...DEFAULT_RULES, aka: false, kuitan: false } }, melds);
    expect(rNo).toBeNull();
    const rYes = win('234m456s678s88m', '6s', {}, melds);
    expect(rYes!.yaku.map((y) => y.name)).toEqual(['断幺九']);
    expect(rYes!.fu).toBe(30);
  });
  it('満貫', () => {
    const r = win('22234m555666777s', '7s', { riichi: 1, tsumo: true })!;
    expect(r.limit === '満貫' || r.han >= 5).toBe(true);
  });
  it('役牌と符', () => {
    const r = win('555z123m456p789s11p', '1p')!;
    // 20+10(門前ロン)+8(字牌暗刻)+2(単騎) = 40
    expect(r.fu).toBe(40);
    expect(r.yaku.map((y) => y.name)).toContain('役牌 白');
  });
});
