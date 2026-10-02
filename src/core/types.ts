import { Tile } from './tiles';

export type MeldType = 'chi' | 'pon' | 'minkan' | 'ankan' | 'kakan';

export interface Meld {
  type: MeldType;
  tiles: Tile[];
  /** 鳴いた牌（暗槓以外） */
  calledTile?: Tile;
  /** 鳴いた相手の席（暗槓以外） */
  from?: number;
}

export interface Rules {
  gameLength: 'tonpu' | 'hanchan';
  /** 赤ドラ（各色の5に1枚ずつ） */
  aka: boolean;
  /** 喰いタン */
  kuitan: boolean;
  /** 切り上げ満貫 */
  kiriage: boolean;
  /** 持ち点が0未満で終了 */
  tobi: boolean;
  /** オーラスの親のアガリやめ */
  agariYame: boolean;
  /** 規定の局が終わっても誰も返し点に達していなければ延長（西入・南入） */
  extension: boolean;
  /** 待った（1手前の自分の番に戻れる） */
  undo: boolean;
  startScore: number;
  returnScore: number;
}

export const DEFAULT_RULES: Rules = {
  gameLength: 'tonpu',
  aka: true,
  kuitan: true,
  kiriage: false,
  tobi: true,
  agariYame: true,
  extension: true,
  undo: true,
  startScore: 25000,
  returnScore: 30000,
};

export const meldIsOpen = (m: Meld): boolean => m.type !== 'ankan';
export const meldIsKan = (m: Meld): boolean =>
  m.type === 'minkan' || m.type === 'ankan' || m.type === 'kakan';
