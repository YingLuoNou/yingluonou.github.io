document.addEventListener('DOMContentLoaded', () => {
    // === 默认配置（方便恢复默认设置） ===
    const DEFAULT_WORK_MIN = 25;
    const DEFAULT_BREAK_MIN = 5;
    const DEFAULT_LONG_BREAK_MIN = 15;
    const DEFAULT_ENABLE_SOUND = true;
    const DEFAULT_ENABLE_STORAGE = true;

    // === DOM 元素 ===
    const container = document.getElementById('pomodoro-app');
    const timerDisplay = document.getElementById('pomo-timer');
    const statusDisplay = document.getElementById('pomo-status-text');
    const startBtn = document.getElementById('pomo-start-btn');
    const resetBtn = document.getElementById('pomo-reset-btn');
    const settingsBtn = document.getElementById('pomo-settings-btn');
    const saveSettingsBtn = document.getElementById('pomo-save-settings');
    const settingsPanel = document.getElementById('pomo-settings-panel');
    const workInput = document.getElementById('work-duration');
    const breakInput = document.getElementById('break-duration');
    const longBreakInput = document.getElementById('longbreak-duration');

    const counterEl = document.getElementById('pomo-counter'); // 今日专注次数
    const totalEl = document.getElementById('pomo-total');     // 今日累计专注时间

    const enableSoundInput = document.getElementById('enable-sound');
    const enableStorageInput = document.getElementById('enable-storage');
    const clearStorageBtn = document.getElementById('clear-storage');
    const resetSettingsBtn = document.getElementById('reset-settings');
    const fullscreenBtn = document.getElementById('pomo-fullscreen-btn');

    // === 基本配置 ===
    const STORAGE_KEY = 'pomodoro_stats_v1';
    let longBreakTime = DEFAULT_LONG_BREAK_MIN * 60;  // 默认 15 分钟长休息
    let pomoCount = 0;                   // 今日已完成专注次数
    let totalFocusMinutes = 0;           // 今日累计专注时长（分钟）
    const cycleBeforeLongBreak = 4;      // 每 4 次专注触发一次长休息

    // 开关：声音 + 本地保存
    let enableSound = DEFAULT_ENABLE_SOUND;
    let enableStorage = DEFAULT_ENABLE_STORAGE;

    // 简单的提示音 (Web Audio)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // === 计时状态 ===
    let timerInterval = null;
    let isRunning = false;
    let isWorkSession = true; // true = 专注, false = 休息
    let workTime = DEFAULT_WORK_MIN * 60;
    let breakTime = DEFAULT_BREAK_MIN * 60;
    let currentTime = workTime;

    // === 工具函数：获取“今天”的字符串（用于按日清零） ===
    function getTodayString() {
        const d = new Date();
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // === 从 localStorage 读取数据 ===
    function loadStatsFromStorage() {
        const today = getTodayString();

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                // 没有数据 -> 初始化输入框和开关为默认值
                workTime = DEFAULT_WORK_MIN * 60;
                breakTime = DEFAULT_BREAK_MIN * 60;
                longBreakTime = DEFAULT_LONG_BREAK_MIN * 60;
                enableSound = DEFAULT_ENABLE_SOUND;
                enableStorage = DEFAULT_ENABLE_STORAGE;

                workInput.value = DEFAULT_WORK_MIN;
                breakInput.value = DEFAULT_BREAK_MIN;
                if (longBreakInput) longBreakInput.value = DEFAULT_LONG_BREAK_MIN;
                if (enableSoundInput) enableSoundInput.checked = enableSound;
                if (enableStorageInput) enableStorageInput.checked = enableStorage;

                currentTime = workTime;
                return;
            }

            const saved = JSON.parse(raw);

            // 读取开关配置
            if (typeof saved.enableSound === 'boolean') enableSound = saved.enableSound;
            if (typeof saved.enableStorage === 'boolean') enableStorage = saved.enableStorage;

            // 无论是不是今天，都可以继承上次的时长设置
            if (typeof saved.workTime === 'number') workTime = saved.workTime;
            if (typeof saved.breakTime === 'number') breakTime = saved.breakTime;
            if (typeof saved.longBreakTime === 'number') longBreakTime = saved.longBreakTime;

            // 更新输入框 & 开关 UI
            workInput.value = Math.round(workTime / 60);
            breakInput.value = Math.round(breakTime / 60);
            if (longBreakInput) longBreakInput.value = Math.round(longBreakTime / 60);
            if (enableSoundInput) enableSoundInput.checked = enableSound;
            if (enableStorageInput) enableStorageInput.checked = enableStorage;

            // 如果存储的是“今天”的数据 → 继承今日统计
            if (saved.date === today) {
                pomoCount = saved.pomoCount || 0;
                totalFocusMinutes = saved.totalFocusMinutes || 0;
            } else {
                // 日期不匹配 → 新的一天，统计清零
                pomoCount = 0;
                totalFocusMinutes = 0;
            }

            currentTime = workTime;
        } catch (e) {
            console.error('加载番茄钟本地数据失败:', e);
            // 出问题就用默认值
            workTime = DEFAULT_WORK_MIN * 60;
            breakTime = DEFAULT_BREAK_MIN * 60;
            longBreakTime = DEFAULT_LONG_BREAK_MIN * 60;
            enableSound = DEFAULT_ENABLE_SOUND;
            enableStorage = DEFAULT_ENABLE_STORAGE;

            workInput.value = DEFAULT_WORK_MIN;
            breakInput.value = DEFAULT_BREAK_MIN;
            if (longBreakInput) longBreakInput.value = DEFAULT_LONG_BREAK_MIN;
            if (enableSoundInput) enableSoundInput.checked = enableSound;
            if (enableStorageInput) enableStorageInput.checked = enableStorage;

            currentTime = workTime;
        }
    }

    // === 将当前统计与设置写入 localStorage ===
    function saveStatsToStorage() {
        if (!enableStorage) return; // 用户关闭本地保存则直接跳过

        const data = {
            date: getTodayString(),
            pomoCount,
            totalFocusMinutes,
            workTime,
            breakTime,
            longBreakTime,
            enableSound,
            enableStorage
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('保存番茄钟本地数据失败:', e);
        }
    }

    // === 更新统计显示（计数 + 总分钟数） ===
    function updateStatsUI() {
        if (counterEl) {
            counterEl.textContent = `你已经进行了${pomoCount}个番茄专注了！🍅🍅`;
        }
        if (totalEl) {
            const minutes = Math.round(totalFocusMinutes);
            totalEl.textContent = `今日累计专注：${minutes} 分钟`;
        }
    }

    // === 初始化：读取本地数据并刷新 UI ===
    loadStatsFromStorage();
    updateStatsUI();
    updateDisplay();

    // === 声音提示 ===
    function playSound() {
        if (!enableSound) return;

        // 确保 AudioContext 已被唤醒（需要用户交互触发）
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5); // 响 0.5 秒
    }

    // 一个统一的提示：先声音，后 alert
    function notifyUser(message) {
        // 先播声音
        playSound();

        // 给声音留一点时间，再弹窗（避免声音在 alert 阻塞期间被“静音”）
        setTimeout(() => {
            alert(message);
        }, enableSound ? 600 : 0);
    }

    // === 计时控制 ===
    function toggleTimer() {
        if (isRunning) {
            pauseTimer();
        } else {
            statusDisplay.textContent = "专注ing";
            startTimer();
        }
    }

    function startTimer() {
        if (isRunning) return;

        isRunning = true;
        startBtn.textContent = isWorkSession ? "暂停" : "停止休息";

        // 第一次点击时唤醒音频上下文
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }

        // 🚀 如果是专注时间，进入全屏沉浸模式
        if (isWorkSession) {
            enterFullscreen();
        }

        timerInterval = setInterval(() => {
            currentTime--;
            updateDisplay();

            if (currentTime <= 0) {
                handleTimerComplete();
            }
        }, 1000);
    }

    function pauseTimer() {
        isRunning = false;
        clearInterval(timerInterval);
        startBtn.textContent = "继续";
    }

    function resetTimer() {
        pauseTimer();
        isWorkSession = true;
        currentTime = workTime;
        startBtn.textContent = "开始专注";
        statusDisplay.textContent = "准备专注";
        exitFullscreen(); // 确保重置时退出全屏
        updateDisplay();
    }

    // === 一个阶段结束后的处理 ===
    function handleTimerComplete() {
        pauseTimer();

        if (isWorkSession) {
            // 🎉 专注完成 → 计数 +1、累计分钟数增加
            pomoCount++;
            const focusMinutes = workTime / 60; // 当前专注阶段时长（分钟）
            totalFocusMinutes += focusMinutes;

            // 更新统计并尝试保存
            updateStatsUI();
            saveStatsToStorage();

            // === 判断进入短休息还是长休息 ===
            if (pomoCount % cycleBeforeLongBreak === 0) {
                // ⭐ 第4次进入长休息
                isWorkSession = false;
                currentTime = longBreakTime;
                statusDisplay.textContent = "🎉 长休息时间！";
                startBtn.textContent = "开始长休息";
                exitFullscreen();
                notifyUser("恭喜完成四次专注！进入长休息～");
            } else {
                // ☕ 普通短休息
                isWorkSession = false;
                currentTime = breakTime;
                statusDisplay.textContent = "☕ 休息一下";
                startBtn.textContent = "开始休息";
                exitFullscreen();
                notifyUser("专注时间结束！请休息一下。");
            }

        } else {
            // === 休息结束 → 开始新的专注 ===
            isWorkSession = true;
            currentTime = workTime;
            statusDisplay.textContent = "准备专注";
            startBtn.textContent = "开始专注";
            notifyUser("休息结束，准备开始新的专注！");
        }

        updateDisplay();
    }

    // === 显示更新 ===
    function updateDisplay() {
        const minutes = Math.floor(currentTime / 60);
        const seconds = currentTime % 60;
        timerDisplay.textContent = `${pad(minutes)}:${pad(seconds)}`;

        // 动态更新网页标题
        if (isRunning) {
            if (isWorkSession) {
                document.title = `专注中(${pad(minutes)}:${pad(seconds)}) 番茄钟`;
            } else {
                document.title = `休息中(${pad(minutes)}:${pad(seconds)}) 番茄钟`;
            }
        } else {
            document.title = "YangLuoNou's番茄钟";
        }
    }

    function pad(num) {
        return num.toString().padStart(2, '0');
    }

    // === 全屏控制 ===
    function enterFullscreen() {
        container.classList.add('fullscreen-active');

        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        }
    }

    function exitFullscreen() {
        container.classList.remove('fullscreen-active');

        if (document.fullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    // 监听用户按 ESC 键手动退出全屏的情况
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && isRunning && isWorkSession) {
            container.classList.remove('fullscreen-active');
        }
    });

    // === 事件绑定 ===
    startBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);

    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
    });

    // 保存设置：时长 + 开关 + 存储
    saveSettingsBtn.addEventListener('click', () => {
        workTime = parseInt(workInput.value || String(DEFAULT_WORK_MIN), 10) * 60;
        breakTime = parseInt(breakInput.value || String(DEFAULT_BREAK_MIN), 10) * 60;
        longBreakTime = parseInt(longBreakInput.value || String(DEFAULT_LONG_BREAK_MIN), 10) * 60;

        if (enableSoundInput) enableSound = !!enableSoundInput.checked;
        if (enableStorageInput) enableStorage = !!enableStorageInput.checked;

        if (!isRunning) {
            currentTime = isWorkSession ? workTime : breakTime;
            updateDisplay();
        }

        saveStatsToStorage(); // 如果关闭了本地保存，此函数内部会直接 return

        settingsPanel.classList.add('hidden');
        alert("设置已保存");
    });

    // 清除本地统计数据
    if (clearStorageBtn) {
        clearStorageBtn.addEventListener('click', () => {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (e) {
                console.error('清除本地番茄钟数据失败:', e);
            }
            // 清空当前统计
            pomoCount = 0;
            totalFocusMinutes = 0;
            updateStatsUI();
            alert("本地统计数据已清除（不影响当前设置）");
        });
    }

    // 恢复默认设置（仅恢复：时长 + 声音开关 + 本地保存开关，不清空统计）
    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', () => {
            workTime = DEFAULT_WORK_MIN * 60;
            breakTime = DEFAULT_BREAK_MIN * 60;
            longBreakTime = DEFAULT_LONG_BREAK_MIN * 60;
            enableSound = DEFAULT_ENABLE_SOUND;
            enableStorage = DEFAULT_ENABLE_STORAGE;

            workInput.value = DEFAULT_WORK_MIN;
            breakInput.value = DEFAULT_BREAK_MIN;
            if (longBreakInput) longBreakInput.value = DEFAULT_LONG_BREAK_MIN;
            if (enableSoundInput) enableSoundInput.checked = enableSound;
            if (enableStorageInput) enableStorageInput.checked = enableStorage;

            if (!isRunning) {
                currentTime = isWorkSession ? workTime : breakTime;
                updateDisplay();
            }

            saveStatsToStorage();
            alert("已恢复默认设置");
        });
    }

    // 全屏按钮：在“专注运行中”时点击可以重新进入全屏
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (isWorkSession && isRunning) {
                enterFullscreen();
            } else {
                alert("只有在专注计时进行中才能进入全屏模式～");
            }
        });
    }
});
