export type Obstacle = { s: number; x: number; w: number; d: number; h: number; moving?: boolean };
export type Course = {
  id: string; name: string; subtitle: string; description: string; difficulty: number; length: number;
  accent: string; sky: number; road: number; checkpoints: number[]; obstacles: Obstacle[];
  gaps: { start: number; end: number }[]; pads: { s: number; x: number; w: number; d: number }[];
  elevation: number[][]; curve: [number, number, number, number]; route: [number, number];
};
type CourseRecipe = Omit<Course, 'checkpoints' | 'obstacles' | 'gaps' | 'pads' | 'elevation'> & {
  peaks: number[]; bars: number[]; holes: number[]; barHeight: number; gapWidth: number; sideCount: number;
};
function makeCourse(recipe: CourseRecipe): Course {
  const section = recipe.length / 4;
  const checkpoints = [section, section * 2, section * 3];
  const elevation = [[0, 0], [25, 0]];
  recipe.peaks.forEach((height, i) => { elevation.push([section * i + section * .5, height], [section * (i + 1) - 2, 0]); });
  elevation.push([recipe.length + 20, 0]);
  const sides = Array.from({ length: recipe.sideCount }, (_, i) => {
    const s = 38 + i * (recipe.length - 80) / Math.max(1, recipe.sideCount - 1);
    const routeX = Math.sin(s / recipe.route[1]) * recipe.route[0];
    return { s, x: routeX >= 0 ? -3.8 : 3.8, w: 1.8, d: 2, h: 2.3, moving: recipe.difficulty >= 3 && i % 2 === 1 };
  });
  return { ...recipe, checkpoints, elevation,
    obstacles: [...recipe.bars.map(s => ({ s, x: 0, w: 10.4, d: 1, h: recipe.barHeight })), ...sides],
    gaps: recipe.holes.map(start => ({ start, end: start + recipe.gapWidth })),
    pads: [28, ...checkpoints.map(s => s + 14)].map((s, i) => ({ s, x: i % 2 ? -3.4 : 3.4, w: 2, d: 4 })),
  };
}
export const CLASSIC_COURSE: Course = {
  id: 'sky-rush-v5', name: 'スカイライン', subtitle: 'SKYLINE', description: 'おなじみの空中コース。4つの坂を越えて。', difficulty: 3, length: 640,
  accent: '#a0ff54', sky: 0x061411, road: 0x182824, checkpoints: [160, 320, 480],
  obstacles: [...[72, 225, 385, 545].map((s, i) => ({ s, x: 0, w: 10.4, d: 1, h: 1.3 + i * .15 })), ...[40, 110, 185, 270, 345, 420, 505, 575].map((s, i) => ({ s, x: i % 2 ? 3.8 : -3.8, w: 1.8, d: 2, h: 2.3, moving: i % 2 === 1 }))],
  gaps: [145, 305, 465, 605].map(start => ({ start, end: start + 6 })),
  pads: [28, 174, 330, 490].map((s, i) => ({ s, x: i % 2 ? -3.4 : 3.4, w: 2, d: 4 })),
  elevation: [[0, 0], [25, 0], [82, 13], [158, 0], [215, 16], [318, 0], [380, 18], [478, 0], [540, 21], [630, 0], [660, 0]],
  curve: [26, 65, 12, 32], route: [1.15, 39],
};
export const COURSES: readonly Course[] = [
  makeCourse({ id: 'sky-rush-breeze-v1', name: 'はじまりの風', subtitle: 'FIRST BREEZE', description: 'ゆるやかな坂とカーブ。4回のジャンプで練習。', difficulty: 1, length: 640, accent: '#b6ff89', sky: 0x0a1815, road: 0x263d31, curve: [10, 95, 3, 45], route: [.7, 65], peaks: [2, 3, 2, 3], bars: [110, 430], holes: [270, 570], barHeight: .8, gapWidth: 3, sideCount: 4 }),
  makeCourse({ id: 'sky-rush-harbor-v1', name: 'ハーバーライト', subtitle: 'HARBOR LIGHTS', description: '港の灯りを抜ける、軽快な6連ジャンプ。', difficulty: 2, length: 680, accent: '#75e8ff', sky: 0x07151e, road: 0x20333b, curve: [18, 85, 5, 40], route: [1.1, 56], peaks: [6, 8, 7, 9], bars: [85, 425, 585], holes: [280, 485, 635], barHeight: 1.1, gapWidth: 4, sideCount: 6 }),
  makeCourse({ id: 'sky-rush-serpent-v1', name: 'リボンカーブ', subtitle: 'RIBBON CURVES', description: '左右へうねる道。ラインを追いかけよう。', difficulty: 2, length: 720, accent: '#e7b2ff', sky: 0x170e20, road: 0x31253a, curve: [35, 65, 15, 29], route: [2, 50], peaks: [7, 9, 8, 10], bars: [80, 260, 440, 620], holes: [140, 320, 500, 680], barHeight: 1.3, gapWidth: 5, sideCount: 8 }),
  CLASSIC_COURSE,
  makeCourse({ id: 'sky-rush-dive-v1', name: 'サンセットダイブ', subtitle: 'SUNSET DIVE', description: '高い坂の先に急降下。下りのスピードを楽しもう。', difficulty: 3, length: 800, accent: '#ffbc75', sky: 0x20110e, road: 0x3a2d27, curve: [25, 80, 9, 34], route: [1.5, 45], peaks: [25, 32, 28, 35], bars: [75, 275, 475, 675], holes: [150, 350, 550, 750], barHeight: 1.6, gapWidth: 6, sideCount: 12 }),
  makeCourse({ id: 'sky-rush-switch-v1', name: 'ジグザグラッシュ', subtitle: 'SWITCHBACK', description: '細かい切り返しと動くブロック。左右操作がカギ。', difficulty: 4, length: 840, accent: '#ffe779', sky: 0x18170b, road: 0x333325, curve: [30, 52, 14, 23], route: [2.65, 28], peaks: [14, 19, 22, 25], bars: [65, 275, 405, 485, 695, 825], holes: [135, 345, 555, 765], barHeight: 2, gapWidth: 6, sideCount: 18 }),
  makeCourse({ id: 'sky-rush-storm-v1', name: 'ストームリッジ', subtitle: 'STORM RIDGE', description: '尾根を越える12回の跳躍。早めに次の足場を見よう。', difficulty: 4, length: 900, accent: '#aaaaff', sky: 0x0c1023, road: 0x282e43, curve: [35, 61, 13, 26], route: [2.1, 36], peaks: [22, 28, 32, 36], bars: [55, 185, 280, 410, 505, 635, 730, 860], holes: [120, 345, 570, 795], barHeight: 2.4, gapWidth: 6, sideCount: 20 }),
  makeCourse({ id: 'sky-rush-crown-v1', name: 'クラウンロード', subtitle: 'CROWN ROAD', description: '最長の天空決戦。坂・カーブ・高い壁の総仕上げ。', difficulty: 5, length: 1040, accent: '#ff86bc', sky: 0x200d1c, road: 0x3b2536, curve: [40, 57, 17, 25], route: [2.7, 30], peaks: [32, 38, 42, 46], bars: [65, 205, 325, 465, 585, 725, 845, 985], holes: [135, 395, 655, 915], barHeight: 2.8, gapWidth: 7, sideCount: 24 }),
];
export function findCourse(id: unknown) { return COURSES.find(course => course.id === id); }
