(function() {
  // ================= 配置区 =================
  const CONFIG = {
    triggerProb: 0.02, // 自动燃放概率
    gravity: 0.015,     
    friction: 0.96,     
    stepSize: 1.0,      
    colors: [
      '#FFD700', '#FF0000', '#00FF00', '#00BFFF', 
      '#FF4500', '#FFFFFF', '#9400D3', '#FF69B4'
    ]
  };

  // ================= 变量区 =================
  let canvas, ctx;
  let w, h;
  let fireworks = [];
  let particles = [];
  let animationId = null;
  let headerElement;
  let isSpring = localStorage.getItem('festival_spring_enabled') !== 'false';

  // [新增] 判断是否为首页 (支持 / 和 /index.html)
  // 如果你希望在 /page/2/ 等分页也显示，可以改用正则判定
  const isHome = () => {
      const path = window.location.pathname;
      return path === '/' || path === '/index.html';
  };

  // ================= 辅助函数 =================
  function random(min, max) {
    return Math.random() * (max - min) + min;
  }
  
  function randomColor() {
      return CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
  }

  function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ================= 核心类定义 (坐标系已改为：文档绝对坐标) =================

  // 1. 升空烟花 (Rocket)
  class Firework {
    constructor(targetType = 'random') {
      const rect = headerElement.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;

      // [核心修复] 初始位置 = 视口位置 + 滚动偏移量
      // 这样烟花位置就是相对于文档顶部的绝对位置
      this.x = rect.left + scrollX + Math.random() * rect.width;
      this.y = rect.bottom + scrollY; 
      
      this.sx = this.x;
      this.sy = this.y;
      
      const types = ['mega', 'willow', 'strobe', 'burst', 'ring'];
      this.type = targetType === 'random' ? types[Math.floor(Math.random() * types.length)] : targetType;

      let minH = 0.15, maxH = 0.3;
      if (this.type === 'mega') { minH = 0.1; maxH = 0.25; }
      
      const headerH = rect.height;
      // 目标高度也必须转换为绝对坐标
      this.tx = this.x + (Math.random() - 0.5) * 200; 
      this.ty = (rect.top + scrollY) + headerH * minH + Math.random() * (headerH * maxH); 

      this.distanceToTarget = Math.sqrt(Math.pow(this.tx - this.sx, 2) + Math.pow(this.ty - this.sy, 2));
      
      const angle = Math.atan2(this.ty - this.sy, this.tx - this.sx);
      const speed = (this.type === 'mega') ? 2.5 : 3;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      
      this.brightness = random(60, 80);
      this.coordinates = [];
      this.coordinateCount = 3;
      for(let i=0; i<this.coordinateCount; i++) this.coordinates.push([this.x, this.y]);
    }

    update(index) {
      this.coordinates.pop();
      this.coordinates.unshift([this.x, this.y]);

      this.x += this.vx * CONFIG.stepSize;
      this.y += this.vy * CONFIG.stepSize;
      
      const currentDistance = Math.sqrt(Math.pow(this.x - this.sx, 2) + Math.pow(this.y - this.sy, 2));

      if (currentDistance >= this.distanceToTarget) {
        createExplosion(this.tx, this.ty, this.type);
        fireworks.splice(index, 1);
      }
    }

    draw() {
      // [核心修复] 绘制时，将 绝对坐标 减去 当前滚动条，转换回 屏幕坐标
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;

      ctx.beginPath();
      ctx.moveTo(
          this.coordinates[this.coordinates.length - 1][0] - scrollX, 
          this.coordinates[this.coordinates.length - 1][1] - scrollY
      );
      ctx.lineTo(this.x - scrollX, this.y - scrollY);
      
      ctx.strokeStyle = `hsl(${random(30, 50)}, 100%, ${this.brightness}%)`; 
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // 2. 爆炸粒子 (Particle)
  class Particle {
    constructor(x, y, type, colorOverride, velocityOverride) {
      this.x = x;
      this.y = y;
      this.type = type;
      
      this.coordinates = [];
      this.coordinateCount = 5;
      for(let i=0; i<this.coordinateCount; i++) this.coordinates.push([this.x, this.y]);

      this.color = colorOverride || randomColor();
      if (type === 'willow') this.color = '#FFD700'; 
      if (type === 'burst_parent') this.color = '#FFFFFF'; 

      this.alpha = 1;
      this.friction = CONFIG.friction;
      this.gravity = CONFIG.gravity;
      this.decay = random(0.008, 0.015); 

      if (type === 'willow') {
        this.friction = 0.94; 
        this.gravity = 0.04;  
        this.decay = random(0.003, 0.006); 
      } 
      else if (type === 'burst_parent') {
        this.friction = 0.94;
        this.decay = random(0.01, 0.02); 
      }
      else if (type === 'mega') {
        this.friction = 0.96; 
        this.decay = random(0.005, 0.009);
      }
      else if (type === 'mini') {
        this.friction = 0.95;
        this.gravity = 0.06;
        this.decay = random(0.015, 0.03); 
      }

      if (velocityOverride) {
        this.vx = velocityOverride.x;
        this.vy = velocityOverride.y;
      } else {
        const angle = random(0, Math.PI * 2);
        let speed = random(1, 8);
        if (type === 'mega') speed = random(2, 14); 
        if (type === 'mini') speed = random(1, 5);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
      }
      
      this.hasExploded = false; 
    }

    update(index) {
      this.coordinates.pop();
      this.coordinates.unshift([this.x, this.y]);

      this.vx *= this.friction;
      this.vy *= this.friction;
      this.vy += this.gravity; 

      this.x += this.vx * CONFIG.stepSize;
      this.y += this.vy * CONFIG.stepSize;
      
      this.alpha -= this.decay;

      if (this.type === 'burst_parent' && !this.hasExploded && this.alpha < 0.3) {
          createExplosion(this.x, this.y, 'sub_burst'); 
          this.hasExploded = true;
          this.alpha = 0; 
      }
      
      if (this.alpha <= 0) particles.splice(index, 1);
    }

    draw() {
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;

      // 柳叶金砂
      if (this.type === 'willow' && this.alpha < 0.5) {
          const isWhiteFlash = Math.random() < 0.2;
          const r = isWhiteFlash ? 255 : 255;
          const g = isWhiteFlash ? 255 : 215;
          const b = isWhiteFlash ? 255 : 0;
          const flickerAlpha = Math.random() < 0.5 ? this.alpha * 2 : 0; 
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${flickerAlpha})`;
          const size = isWhiteFlash ? 2.5 : 1.5;
          
          // 绘制矩形时也要减去 scroll
          ctx.fillRect(this.x - scrollX, this.y - scrollY, size, size);
          return; 
      }

      ctx.beginPath();
      // 减去 scroll 实现跟随页面滚动
      ctx.moveTo(
          this.coordinates[this.coordinates.length - 1][0] - scrollX, 
          this.coordinates[this.coordinates.length - 1][1] - scrollY
      );
      ctx.lineTo(this.x - scrollX, this.y - scrollY);
      
      let lineWidth = 1.5;
      let visualAlpha = this.alpha;

      if (this.type === 'strobe') {
          visualAlpha = Math.sin(Date.now() / 30) > 0 ? this.alpha : 0.1;
          lineWidth = 2;
      }

      ctx.strokeStyle = hexToRgba(this.color, visualAlpha);
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  // ================= 爆炸工厂函数 =================
  function createExplosion(x, y, type) {
    if (type === 'mega') {
      const count = 200;
      const c1 = randomColor();
      const c2 = randomColor();
      for (let i = 0; i < count; i++) particles.push(new Particle(x, y, 'mega', Math.random() < 0.5 ? c1 : c2));
    } 
    else if (type === 'burst') {
      const count = 20; 
      for (let i = 0; i < count; i++) {
         const angle = random(0, Math.PI * 2);
         const speed = random(4, 10);
         particles.push(new Particle(x, y, 'burst_parent', '#FFFFFF', { x: Math.cos(angle)*speed, y: Math.sin(angle)*speed }));
      }
    }
    else if (type === 'sub_burst') {
      const count = 12; 
      const subColor = randomColor();
      for (let i = 0; i < count; i++) {
         const angle = random(0, Math.PI * 2);
         const speed = random(1, 4); 
         particles.push(new Particle(x, y, 'normal', subColor, { x: Math.cos(angle)*speed, y: Math.sin(angle)*speed }));
      }
    }
    else if (type === 'willow') {
      const count = 100;
      for (let i = 0; i < count; i++) {
         const angle = random(0, Math.PI * 2);
         const speed = random(3, 10);
         particles.push(new Particle(x, y, 'willow', null, { x: Math.cos(angle)*speed, y: Math.sin(angle)*speed }));
      }
    }
    else if (type === 'ring') {
       const count = 80;
       const angleStep = (Math.PI * 2) / count;
       const color = randomColor();
       for (let i = 0; i < count; i++) {
         const speed = 6;
         particles.push(new Particle(x, y, 'normal', color, { x: Math.cos(angleStep * i) * speed, y: Math.sin(angleStep * i) * speed }));
       }
    }
    else if (type === 'mini') {
       const count = 25;
       const color = randomColor();
       for (let i = 0; i < count; i++) particles.push(new Particle(x, y, 'mini', color));
    }
    else {
      const count = 80;
      const color = randomColor();
      for (let i = 0; i < count; i++) particles.push(new Particle(x, y, type === 'strobe' ? 'strobe' : 'normal', color));
    }
  }

  // ================= 主循环 =================

  function loop() {
    if (!isSpring) {
        if(animationId) cancelAnimationFrame(animationId);
        return;
    }
    
    animationId = requestAnimationFrame(loop);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; 
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter'; 

    // [修复 Bug 2] 自动燃放仅在首页触发
    if (headerElement && isHome()) {
        const rect = headerElement.getBoundingClientRect();
        // 仅当顶图在视野内时燃放
        if (rect.bottom > 0 && fireworks.length < 4 && Math.random() < CONFIG.triggerProb) {
            fireworks.push(new Firework('random'));
        }
    }

    let i = fireworks.length;
    while (i--) { fireworks[i].draw(); fireworks[i].update(i); }

    let j = particles.length;
    while (j--) { particles[j].draw(); particles[j].update(j); }
  }

  // ================= 交互与初始化 =================

  function handleClick(e) {
      if (!isSpring) return;

      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      
      // 转换点击坐标为绝对坐标
      const absoluteX = e.clientX + scrollX;
      const absoluteY = e.clientY + scrollY;

      // [修复 Bug 2] 只有在首页且点击的是顶图区域，才触发大烟花
      let isHeaderClick = false;
      if (headerElement && isHome()) {
          const rect = headerElement.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
              isHeaderClick = true;
          }
      }

      if (isHeaderClick) {
          const types = ['mega', 'burst', 'willow', 'strobe'];
          const type = types[Math.floor(Math.random() * types.length)];
          createExplosion(absoluteX, absoluteY, type);
      } else {
          // 其他页面或非顶图区域：迷你烟花
          createExplosion(absoluteX, absoluteY, 'mini');
      }
  }

  function initCanvas() {
    headerElement = document.getElementById('page-header');
    // 注意：非首页可能也有 page-header，但自动逻辑里已经加了 isHome 判断

    const old = document.getElementById('spring-header-canvas');
    if(old) old.remove();

    canvas = document.createElement('canvas');
    canvas.id = 'spring-header-canvas';
    
    // 全屏固定画布
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none'; 
    canvas.style.zIndex = '9999'; 
    
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('click', handleClick);
  }

  function resizeCanvas() {
    if (!canvas) return;
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function stopSpringEffect() {
    document.documentElement.classList.remove('spring-on');
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    
    const c = document.getElementById('spring-header-canvas');
    if (c) c.remove();
    
    window.removeEventListener('resize', resizeCanvas);
    document.removeEventListener('click', handleClick);
    //删除footer
    document.getElementById('theme-info1')?.remove();

    fireworks = []; particles = [];
  }

  function startSpringEffect() {
    stopSpringEffect();
    addfooter();
    if (!isSpring) return;
    
    headerElement = document.getElementById('page-header');
    document.documentElement.classList.add('spring-on');
    initCanvas();
    loop();
  }

  //footer 添加
  function addfooter(){
    const frameworkInfo = document.querySelector('#footer > div > div.footer-copyright > span.framework-info');
    if (frameworkInfo) {
      const newContent = document.createElement('festival');
      const newContent2 = document.createElement('theme-info');
      newContent.innerHTML = '<theme-info id = "theme-info1"> |  <festival style="color: rgb(255, 0, 0)">春节</festival> 节日主题</theme-info>';
      frameworkInfo.appendChild(newContent2);
      frameworkInfo.appendChild(newContent);
    }
  }

  
  // ================= 开关控制 =================
  function initSpringButton() {
    const container = document.getElementById('rightside-config-hide');
    const directContainer = document.getElementById('rightside');
    if (!container && !directContainer) return;
    if (document.getElementById('spring-switch')) return;
    
    const btn = document.createElement('button');
    btn.id = 'spring-switch'; btn.type = 'button';
    const updateIcon = () => {
        btn.title = isSpring ? '关闭春节特效' : '开启春节特效'; 
        btn.innerHTML = `<i class="fas fa-star" style="${isSpring ? 'color: #ff4500; animation: bounce-thrice 2s infinite;' : ''}"></i>`;
    };
    updateIcon();

    btn.onclick = () => {
      isSpring = !isSpring;
      localStorage.setItem('festival_spring_enabled', isSpring);
      updateIcon();
      if (isSpring) startSpringEffect(); else stopSpringEffect();
    };

    if (container) container.insertBefore(btn, container.firstChild);
    else directContainer.insertBefore(btn, directContainer.firstChild);
  }
  
  // ================= 事件监听 =================
  document.addEventListener('DOMContentLoaded', () => { initSpringButton(); if(isSpring) startSpringEffect(); });
  document.addEventListener('pjax:send', () => { stopSpringEffect(); });
  document.addEventListener('pjax:complete', () => { initSpringButton(); if(isSpring) startSpringEffect(); });

})();