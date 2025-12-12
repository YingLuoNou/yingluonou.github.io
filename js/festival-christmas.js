(function () {
  // ================= 配置常量 =================
  const SNOW_COUNT = 40;          // 雪花数量
  const ACCUM_INTERVAL = 10000;   // 积雪增加间隔
  const MELT_ON_SCROLL = 0.08;    // 滚动融雪比例
  const MELT_ON_PAGE = 1.0;       // 换页融雪比例

  // ================= 全局变量 =================
  let snowLayer;
  let accumTimer = null;
  let snowHitTimer = null;
  let snowflakes = [];
  let scrollTimeout = null;
  let sleighTimer = null; // 雪橇防抖定时器
  
  // 状态标记：是否开启下雪 (从本地存储读取，默认为 true)
  let isSnowing = localStorage.getItem('festival_snow_enabled') !== 'false';

  // ==========================================
  //           事件处理函数 (防堆叠)
  // ==========================================

  // 1. 窗口大小改变时的处理（重绘灯泡）
  const onResize = () => {
    if (!isSnowing) return;
    document.getElementById('christmas-lights-container')?.remove();
    initChristmasLights(); 
  };

  // 2. 页面滚动时的处理（融雪）
  const onScroll = () => {
    if (!isSnowing) return;
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      meltSnow(MELT_ON_SCROLL, true);
      scrollTimeout = null;
    }, 110);
  };

  // 3. 雪橇的滚动监听
  const onSleighScroll = () => {
    if (!isSnowing) return;
    if (sleighTimer) return;
    
    sleighTimer = setTimeout(() => {
      const img = document.getElementById('santa-sleigh');
      // 如果图片不存在或者已经在飞，就不管
      if (!img || img.classList.contains('sleigh-active')) { 
        sleighTimer = null; 
        return; 
      }

      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const clientHeight = window.innerHeight;

      // 触底触发 (保留 50px 余量)
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        img.classList.add('sleigh-active');
        
        // 动画结束后移除 class，方便下次触发
        const onEnd = (e) => {
          if (e.animationName === 'sleigh-fly-once') {
            img.classList.remove('sleigh-active');
            img.removeEventListener('animationend', onEnd);
          }
        };
        img.addEventListener('animationend', onEnd);
      }
      sleighTimer = null;
    }, 100);
  };

  // 4. 点击出糖果
  const onClickCandy = (e) => {
    if (!isSnowing) return;
    // 忽略交互元素
    if (['A', 'BUTTON', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    
    const candyTypes = ['🍬', '🍭', '🍫', '🧁', '🍪', '🍩'];
    const candy = document.createElement('span');
    candy.className = 'click-candy';
    candy.textContent = candyTypes[Math.floor(Math.random() * candyTypes.length)];
    candy.style.left = e.clientX + 'px';
    candy.style.top = e.clientY + 'px';
    candy.style.setProperty('--rot', ((Math.random() - 0.5) * 40) + 'deg');
    document.body.appendChild(candy);
    candy.addEventListener('animationend', () => candy.remove());
  };


  // ==========================================
  //                核心逻辑区
  // ==========================================


  //footer 添加
  function addfooter(){
    const frameworkInfo = document.querySelector('#footer > div > div.footer-copyright > span.framework-info');
    if (frameworkInfo) {
      const newContent = document.createElement('festival');
      const newContent2 = document.createElement('theme-info');
      newContent.innerHTML = '<theme-info id = "theme-info1"> |  <festival style="color: #fbff00ff">圣诞节</festival> 节日主题</theme-info>';
      frameworkInfo.appendChild(newContent2);
      frameworkInfo.appendChild(newContent);
    }
  }

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
      snowflakes.push(s);
    }
  }

  function resetSnowflakeStyle(el, initial = false) {
    const left = Math.random() * 100;
    const duration = 8 + Math.random() * 10;
    const delay = initial ? -(Math.random() * duration) : 0;
    el.style.animation = 'none';
    el.style.transform = 'none';
    void el.offsetWidth; 
    el.style.left = left + 'vw';
    el.style.top = '-15px';
    el.style.animation = `snow-fall ${duration}s linear infinite`;
    el.style.animationDelay = delay + 's';
  }

  function getSnowContainers() {
    const cardSelectors = ['.recent-post-item', '.card-widget', '#post', '#page'];
    return Array.from(document.querySelectorAll(cardSelectors.join(',')));
  }

  function checkSnowHits() {
    if (!snowflakes.length) return;
    const cards = getSnowContainers();
    if (!cards.length) return;

    const rects = cards.map(card => ({
      el: card,
      rect: card.getBoundingClientRect()
    }));

    snowflakes.forEach(flake => {
      const fRect = flake.getBoundingClientRect();
      const fxCenter = fRect.left + fRect.width / 2;
      const fyBottom = fRect.bottom;
      rects.forEach(({ el, rect }) => {
        if (fxCenter >= rect.left && fxCenter <= rect.right) {
          const Y1 = fyBottom - rect.top;
          if (Y1 >= 3 && Y1 <= 15) {
            const current = parseFloat(getComputedStyle(el).getPropertyValue('--snow-level')) || 0;
            if (Math.random() < 0.79 - current * 0.72) {
              const next = Math.min(1, current + 0.01);
              el.style.setProperty('--snow-level', next.toString());
              resetSnowflakeStyle(flake, false);
            }
          }
        }
      });
    });
  }

  function accumulateSnow() {
    getSnowContainers().forEach(card => {
      const current = parseFloat(getComputedStyle(card).getPropertyValue('--snow-level')) || 0;
      const next = Math.min(1, current + 0.012);
      card.style.setProperty('--snow-level', next.toString());
    });
    autoSnowFall();
  }

  function meltSnow(ratio, withChunks = false) {
    const cards = getSnowContainers();
    const intensity = getScrollIntensity();
    cards.forEach(card => {
      const current = parseFloat(getComputedStyle(card).getPropertyValue('--snow-level')) || 0;
      if (current <= 0) return;
      const next = Math.max(0, current - ratio);
      card.style.setProperty('--snow-level', next.toString());
      if (withChunks && current > next) {
        spawnSnowChunk(card, intensity);
      }
    });
  }

  let lastScrollY = window.scrollY;
  let lastScrollTime = performance.now();
  function getScrollIntensity() {
    const now = performance.now();
    const dy = Math.abs(window.scrollY - lastScrollY);
    const dt = now - lastScrollTime || 16;
    lastScrollY = window.scrollY;
    lastScrollTime = now;
    return Math.min(1, (dy / dt) / 1.2);
  }

  function autoSnowFall() {
    getSnowContainers().forEach(card => {
      const level = parseFloat(getComputedStyle(card).getPropertyValue('--snow-level')) || 0;
      if (level < 0.95) return;
      if (!card._autoSnowTimer) {
        const interval = 1200 + Math.random() * 1300;
        card._autoSnowTimer = setInterval(() => {
          const cur = parseFloat(getComputedStyle(card).getPropertyValue('--snow-level')) || 0;
          if (cur < 0.95) return;
          spawnSnowChunk(card, Math.min(0.4, (cur - 0.9) / 0.1) - 0.2);
        }, interval);
      }
    });
  }

  function spawnSnowChunk(card, scrollIntensity = 0) {
    if (!isSnowing) return;
    const level = parseFloat(getComputedStyle(card).getPropertyValue('--snow-level')) || 0;
    if (level <= 0.05) return;
    const heavyIntensity = Math.min(1, (level - 0.7) / 0.3);
    const intensity = Math.min(1, scrollIntensity * 0.7 + heavyIntensity * 1.0);
    const count = 1 + Math.floor(level * 4) + Math.floor(heavyIntensity * 3) + Math.floor(scrollIntensity * 2);

    for (let i = 0; i < count; i++) {
      if (Math.random() > 0.85) continue;
      const chunk = document.createElement('div');
      chunk.className = 'snow-chunk';
      chunk.style.left = (10 + Math.random() * 80) + '%';
      const dy = 80 + intensity * 80;
      const dx = (Math.random() * 30) * (Math.random() > 0.5 ? 1 : -1);
      const rot = (8 + Math.random() * 14) * (Math.random() > 0.5 ? 1 : -1);
      chunk.style.setProperty('--snow-dx', dx + 'px');
      chunk.style.setProperty('--snow-dy', dy + 'px');
      chunk.style.setProperty('--snow-rot', rot + 'deg');
      chunk.style.animationDuration = (3.0 - (3.0 - 1.4) * intensity) + 's';
      card.appendChild(chunk);
      chunk.addEventListener('animationend', () => chunk.remove());
    }
  }


  // ==========================================
  //            组件初始化
  // ==========================================

  function initChristmasLights() {
    if (!isSnowing) return; 
    if (document.getElementById('christmas-lights-container')) return;

    const container = document.createElement('div');
    container.id = 'christmas-lights-container';
    const ul = document.createElement('ul');
    ul.className = 'christmas-lights';
    const count = Math.ceil(window.innerWidth / 45) + 2;
    for (let i = 0; i < count; i++) {
      ul.appendChild(document.createElement('li'));
    }
    container.appendChild(ul);
    document.body.appendChild(container);
  }

  function initSantaSleigh() {
    let img = document.getElementById('santa-sleigh');
    if (!img) {
      img = document.createElement('img');
      img.id = 'santa-sleigh';
      img.src = '/img/theme_christmas/santa.png';
      img.onerror = function() { this.remove(); };
      document.body.appendChild(img);
    }
  }

  function startAccum() {
    if (accumTimer) clearInterval(accumTimer);
    accumTimer = setInterval(accumulateSnow, ACCUM_INTERVAL);
  }

  function startSnowHitLoop() {
    if (snowHitTimer) clearInterval(snowHitTimer);
    snowHitTimer = setInterval(checkSnowHits, 160);
  }


  // ==========================================
  //           系统启动与销毁
  // ==========================================

  /** 启动所有特效 */
  function initSnowSystem() {
    if (!isSnowing) return; 

    // ★ 关键：添加类名，让 CSS 装饰生效
    document.documentElement.classList.add('christmas-on');
    addfooter();

    // 1. 初始化 DOM
    initSnowLayer();
    initChristmasLights();
    initSantaSleigh();

    // 2. 启动定时器
    startAccum();
    startSnowHitLoop();

    // 3. 绑定事件（先移除旧的，防止堆叠！）
    window.removeEventListener('resize', onResize);
    window.addEventListener('resize', onResize);

    window.removeEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll);

    window.removeEventListener('scroll', onSleighScroll);
    window.addEventListener('scroll', onSleighScroll);

    document.removeEventListener('click', onClickCandy);
    document.addEventListener('click', onClickCandy);
  }

  /** 销毁所有特效 */
  function destroySnowSystem() {
    // ★ 关键：移除类名，恢复鼠标、滚动条、头像等默认样式
    document.documentElement.classList.remove('christmas-on');

    // 1. 清除定时器
    if (accumTimer) clearInterval(accumTimer);
    if (snowHitTimer) clearInterval(snowHitTimer);
    
    // 2. 移除 DOM 元素
    document.getElementById('snow-layer')?.remove();
    document.getElementById('christmas-lights-container')?.remove();
    document.getElementById('theme-info1')?.remove();
    
    const sleigh = document.getElementById('santa-sleigh');
    if (sleigh) sleigh.style.display = 'none';

    // 3. 解绑事件
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('scroll', onSleighScroll);
    document.removeEventListener('click', onClickCandy);
    
    // 4. 清理积雪残留变量
    getSnowContainers().forEach(c => c.style.setProperty('--snow-level', '0'));
  }


  // ==========================================
  //           右下角控制按钮
  // ==========================================

  function initSnowButton() {
    const container = document.getElementById('rightside-config-hide');
    const directContainer = document.getElementById('rightside');

    if (!container && !directContainer) return;
    if (document.getElementById('snow-switch')) return;

    const btn = document.createElement('button');
    btn.id = 'snow-switch';
    btn.type = 'button';
    btn.title = isSnowing ? '关闭节日特效' : '开启节日特效'; 
    
    const updateIcon = () => {
        btn.innerHTML = `<i class="fas fa-gift" style="${isSnowing ? 'color: #f1c40f;' : ''}"></i>`;
    };
    updateIcon();

    btn.onclick = () => {
      isSnowing = !isSnowing;
      localStorage.setItem('festival_snow_enabled', isSnowing);
      
      btn.title = isSnowing ? '关闭节日特效' : '开启节日特效';
      updateIcon();

      if (isSnowing) {
        const sleigh = document.getElementById('santa-sleigh');
        if (sleigh) sleigh.style.display = 'block';
        initSnowSystem();
      } else {
        destroySnowSystem();
      }
    };

    if (container) {
      container.insertBefore(btn, container.firstChild);
    } else {
      directContainer.insertBefore(btn, directContainer.firstChild);
    }
  }


  // ================= 入口与 PJAX =================
  
  // 页面首次加载
  document.addEventListener('DOMContentLoaded', () => {
    initSnowButton();
    if (isSnowing) {
      initSnowSystem();
    }
  });

  // PJAX 切换页面完成
  document.addEventListener('pjax:complete', () => {
    initSnowButton(); // 确保按钮存在

    if (isSnowing) {
       meltSnow(MELT_ON_PAGE); 
       // 重新运行初始化
       initSnowSystem(); 
    } else {
       // 确保关闭状态下清理干净（防止 PJAX 残留）
       destroySnowSystem();
    }
  });

})();