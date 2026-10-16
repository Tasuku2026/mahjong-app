import { describe, expect, it } from 'vitest';
import { mergeMoved } from '../src/ui/moved';

describe('旧アドレスからの引っ越し', () => {
  const store = (o: Record<string, string>) => (k: string) => o[k] ?? null;

  it('まだ保存がない項目はそのまま入れ、麻雀以外のデータは入れない', () => {
    const out = mergeMoved({ 'mahjong-settings-v1': '{"a":1}', 'other-app': 'x', 'mahjong-bad': 5 }, store({}));
    expect(out).toEqual({ 'mahjong-settings-v1': '{"a":1}' });
  });

  it('新しいアドレスの設定はそのまま残す', () => {
    const out = mergeMoved({ 'mahjong-settings-v1': '{"old":1}' }, store({ 'mahjong-settings-v1': '{"new":1}' }));
    expect(out).toEqual({});
  });

  it('戦績は両方を合わせ、同じ対局は1つにして日時の順に並べる', () => {
    const a = [{ date: '2026-10-02', score: 100 }, { date: '2026-10-05', score: 300 }];
    const b = [{ date: '2026-10-01', score: 50 }, { date: '2026-10-02', score: 100 }];
    const out = mergeMoved({ 'mahjong-stats-v1': JSON.stringify(b) }, store({ 'mahjong-stats-v1': JSON.stringify(a) }));
    expect(JSON.parse(out['mahjong-stats-v1']).map((r: { date: string }) => r.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-05']);
  });
});
