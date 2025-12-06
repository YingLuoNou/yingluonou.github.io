(function () {
  const SNOW_COUNT = 40;         // 同时在天上的雪花数量
  const ACCUM_INTERVAL = 10000;   // 每隔多久增加一点积雪（ms）
  const MELT_ON_SCROLL = 0.08;   // 滚动一次减少多少积雪
  const MELT_ON_PAGE = 1.0;      // 切换页面直接融掉的比例（0~1）

  let snowLayer;
  let accumTimer = null;

  let snowflakes = [];          // 存所有雪花节点
  let snowHitTimer = null;      // 碰撞检测定时器
  // let snowContainerRects = [];  // 缓存容器的矩形信息


  /** 初始化雪层 */
    function initSnowLayer() {
    snowLayer = document.getElementById('snow-layer');
    if (!snowLayer) {
      snowLayer = document.createElement('div');
      snowLayer.id = 'snow-layer';
      document.body.appendChild(snowLayer);
    }

    snowLayer.innerHTML = '';
    snowflakes = [];

    for (let i = 0; i < SNOW_COUNT; i++) {
      const s = document.createElement('span');
      s.className = 'snowflake';
      s.textContent = '❄';

      resetSnowflakeStyle(s, true);
      snowLayer.appendChild(s);
      s.addEventListener("animationiteration", () => {
      resetSnowflakeStyle(s, false);
    });
      snowflakes.push(s);     // ★ 存起来
    }
  }


  /** 随机设置雪花参数 */
  function resetSnowflakeStyle(el, initial = false) {
    // 随机水平位置（0~100vw）
    const left = Math.random() * 100;

    // 随机下落时间（越多越自然）
    const duration = 8 + Math.random() * 10; // 8~18s

    // 初始渲染使用负 delay，让屏幕上已经有雪
    const delay = initial ? -(Math.random() * duration) : 0;

    // 1. 清除 transform 和动画，让雪花回到顶部的真实位置
    el.style.animation = 'none';
    el.style.transform = 'none';
    void el.offsetWidth; // 强制 reflow，保证动画能重新开始

    // 2. 随机新的 X 位置（顶部排队等待下落）
    el.style.left = left + 'vw';
    el.style.top = '-15px';  // 明确放在顶部外一点点

    // 3. 设置下一轮动画（从顶部自然落下）
    el.style.animation = `snow-fall ${duration}s linear infinite`;
    el.style.animationDelay = delay + 's';
  }



  /** 获取所有需要“堆雪”的卡片容器 */
  function getSnowContainers() {
    const cardSelectors = ['.recent-post-item', '.card-widget', '#post'];
    return Array.from(document.querySelectorAll(cardSelectors.join(',')));
  }

    /** 更新所有会积雪容器的矩形缓存 */
  // function updateSnowContainerRects() {
  //   const cards = getSnowContainers();
  //   snowContainerRects = cards.map(card => ({
  //     el: card,
  //     rect: card.getBoundingClientRect()
  //   }));
  // }

    /** 检测雪花是否“砸中”某个容器：部分命中就消失并增加一点积雪 */
  function checkSnowHits() {
    if (!snowflakes.length) return;

    const cards = getSnowContainers();
    if (!cards.length) return;

    // 每次检查时，重新获取容器当前的位置（包括滚动后的）
    const rects = cards.map(card => ({
      el: card,
      rect: card.getBoundingClientRect()
    }));

    snowflakes.forEach(flake => {
      const fRect = flake.getBoundingClientRect();
      const fyBottom = fRect.bottom;                    // 雪花底部
      const fxCenter = fRect.left + fRect.width / 2;    // 雪花水平中心

      rects.forEach(({ el, rect }) => {
        const topY = rect.top;

        // 横向命中：雪花中心落在容器宽度范围内
        const hitX = fxCenter >= rect.left && fxCenter <= rect.right;

        const Y1 = fyBottom - topY;

        // 纵向命中：雪花底部离容器顶部不超过 5px
        const hitY =  (Y1>=3)&&(Y1<=15);

        const current = parseFloat(
              getComputedStyle(el).getPropertyValue('--snow-level')
            ) || 0;

        if (hitX && hitY) {
          if (Math.random() < 0.79-current*0.72) {
            // 给命中的容器稍微加一点积雪
            const current = parseFloat(
              getComputedStyle(el).getPropertyValue('--snow-level')
            ) || 0;
            const next = Math.min(1, current + 0.01);
            el.style.setProperty('--snow-level', next.toString());

            // 重置雪花回到天空（记得这里 reset 时要清 transform / animation）
            resetSnowflakeStyle(flake, false);
          }
        }
      });
    });
  }





  /** 将所有容器积雪增加一点（上限 1） */
  function accumulateSnow() {
    const cards = getSnowContainers();
    cards.forEach(card => {
      const current = parseFloat(getComputedStyle(card).getPropertyValue('--snow-level')) || 0;
      const next = Math.min(1, current + 0.012); // 每次增加 0.15
      card.style.setProperty('--snow-level', next.toString());
    });
    autoSnowFall();
  }

  /** 按比例融雪（ratio: 0~1，withChunks 控制是否生成掉落雪块） */
    function meltSnow(ratio, withChunks = false) {
    const cards = getSnowContainers();
    cards.forEach(card => {
        const current = parseFloat(
        getComputedStyle(card).getPropertyValue('--snow-level')
        ) || 0;
        if (current <= 0) return;

        // 融雪
        const next = Math.max(0, current - ratio);
        card.style.setProperty('--snow-level', next.toString());

        // 同时生成掉落雪块
        if (withChunks && current > next) {
        spawnSnowChunk(card);
        }
    });
    autoSnowFall();
    }

    /** 当积雪达到满值时自动掉落碎雪（真实压重效果） */
    function autoSnowFall() {
    const cards = getSnowContainers();

    cards.forEach(card => {
        const level = parseFloat(
        getComputedStyle(card).getPropertyValue('--snow-level')
        ) || 0;

        // 约满值（≥0.95）才触发
        if (level < 0.95) return;

        // 每张卡片独立的掉落冷却计时器，避免同一时间全部掉落
        if (!card._autoSnowTimer) {
        const interval = 1200 + Math.random() * 1300; // 1.2s ~ 2.5s
        card._autoSnowTimer = setInterval(() => {
            
            // 雪开始掉落前，再检查一次是否仍满雪
            const current = parseFloat(
            getComputedStyle(card).getPropertyValue('--snow-level')
            ) || 0;
            if (current < 0.95) return;

            // 根据积雪厚度决定掉落强度（0~1）
            const intensity = Math.min(0.4, (current - 0.9) / 0.1);

            // 自动掉落碎雪（用全新的参数集）
            spawnSnowChunk(card, intensity-0.2);

        }, interval);
        }
    });
    }



  /** 启动积雪定时器 */
  function startAccum() {
    if (accumTimer) clearInterval(accumTimer);
    accumTimer = setInterval(accumulateSnow, ACCUM_INTERVAL);
  }

  /** 停止积雪定时器 */
  function stopAccum() {
    if (accumTimer) {
      clearInterval(accumTimer);
      accumTimer = null;
    }
  }

  /** 初始化整套下雪系统 */
  function initSnowSystem() {
    initSnowLayer();
    startAccum();
    // updateSnowContainerRects(); 
    startSnowHitLoop(); 
  }

  // --- 事件绑定 ---

  // 初始加载
  document.addEventListener('DOMContentLoaded', () => {
    initSnowSystem();
  });

  window.addEventListener('resize', () => {
    updateSnowContainerRects();
  });

  // PJAX 完成后重新获取卡片、继续积雪（Butterfly 用到了 PJAX）
  document.addEventListener('pjax:complete', () => {
    // 融掉上一页的雪，给人“切换页面雪被抖掉”的感觉
    meltSnow(MELT_ON_PAGE);
    // 重新初始化雪层（如果列表变了）
    initSnowSystem();
  });

 // ==== 滚动速度感知用的全局变量 ====
let lastScrollY = window.scrollY;
let lastScrollTime = performance.now();

/** 根据滚动速度计算强度（0~1），用于控制掉落速度和数量 */
function getScrollIntensity() {
  const now = performance.now();
  const dy = Math.abs(window.scrollY - lastScrollY);
  const dt = now - lastScrollTime || 16;

  lastScrollY = window.scrollY;
  lastScrollTime = now;

  const v = dy / dt;              // px / ms
  const normalized = Math.min(1, v / 1.2); // 1.2 这个参数可以自己调
  return normalized;              // 0：很慢，1：很快
}

/** 生成碎雪：滚动越快 + 雪越厚 -> 碎雪越多、掉得越快 */
function spawnSnowChunk(card, scrollIntensity = 0) {
  // 当前积雪厚度
  const level = parseFloat(
    getComputedStyle(card).getPropertyValue('--snow-level')
  ) || 0;

  if (level <= 0.05) return;

  // 压重强度（积雪越厚越容易掉）
  const heavyIntensity = Math.min(1, (level - 0.7) / 0.3); // 0.7~1 → 0~1

  // 最终掉落强度 = 滚动影响 + 压重影响
  // 自动掉落会 scrollIntensity=0，只受 heavyIntensity 控制
  const intensity = Math.min(1, scrollIntensity * 0.7 + heavyIntensity * 1.0);

  // 雪块数量：基础数 + 压重 + 滚动
  const countBase = 1 + Math.floor(level * 4);
  const countHeavy = Math.floor(heavyIntensity * 3);
  const countScroll = Math.floor(scrollIntensity * 2);

  const chunkCount = countBase + countHeavy + countScroll;

  for (let i = 0; i < chunkCount; i++) {
    if (Math.random() > 0.85) continue;

    const chunk = document.createElement('div');
    chunk.className = 'snow-chunk';

    const leftPercent = 10 + Math.random() * 80;
    chunk.style.left = leftPercent + '%';

    // 抛物线随机参数
    const dy = 80 + intensity * 80; // 80~160px
    const dx = (Math.random() * 30) * (Math.random() > 0.5 ? 1 : -1);
    const rot = (8 + Math.random() * 14) * (Math.random() > 0.5 ? 1 : -1);

    chunk.style.setProperty('--snow-dx', dx + 'px');
    chunk.style.setProperty('--snow-dy', dy + 'px');
    chunk.style.setProperty('--snow-rot', rot + 'deg');

    // 更重的雪掉落更快
    const minD = 1.4;
    const maxD = 3.0;
    const duration = maxD - (maxD - minD) * intensity;
    chunk.style.animationDuration = duration + 's';

    card.appendChild(chunk);

    chunk.addEventListener('animationend', () => chunk.remove());
  }
}


/** 按比例融雪（ratio: 0~1，withChunks 控制是否生成掉落雪块） */
function meltSnow(ratio, withChunks = false) {
  const cards = getSnowContainers();
  const intensity = getScrollIntensity(); // 0~1

  cards.forEach(card => {
    const current = parseFloat(
      getComputedStyle(card).getPropertyValue('--snow-level')
    ) || 0;
    if (current <= 0) return;

    const next = Math.max(0, current - ratio);
    card.style.setProperty('--snow-level', next.toString());

    if (withChunks && current > next) {
      spawnSnowChunk(card, intensity);
    }
  });
}

// ==== 替换原来的滚动事件监听 ====
let scrollTimeout = null;
window.addEventListener('scroll', () => {
  if (scrollTimeout) return;
  scrollTimeout = setTimeout(() => {
    // 滚动时，一边稍微融雪，一边根据速度生成碎雪
    meltSnow(MELT_ON_SCROLL, true);
    scrollTimeout = null;
  }, 110); // 节流时间可以再调小一点，碎雪更密集
});

  /** 启动雪花命中检测循环 */
  function startSnowHitLoop() {
    if (snowHitTimer) clearInterval(snowHitTimer);
    snowHitTimer = setInterval(checkSnowHits, 160); // 每 160ms 检查一次
  }



})();


