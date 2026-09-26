// 合わない組み合わせ。見せ方ごとに、重ねると見づらくなる背景の飾りを挙げる（抽選から外す）
export const AVOID_DECOR = {
  pixel: ['dots', 'dotfade'], // 粗いマス目と網点がぶつかる
  duotone: ['dots', 'dotfade'], // 網点の上に網点
  scan: ['scanlines'], // 走査の光と走査線が重なる
  spotlight: ['halo', 'blur'], // 暗く沈めた絵の周りが明るくなり、スポットライトが効かない
  cinema: ['ticker'], // 上の黒帯とテロップが重なる
};
