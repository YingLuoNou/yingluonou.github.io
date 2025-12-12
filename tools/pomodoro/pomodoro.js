function initPomodoro() {
    // 防止 PJAX 重复初始化
    const container = document.getElementById('pomodoro-app');
    if (!container || container.dataset.pomoInited === '1') return;
    container.dataset.pomoInited = '1';

    // === 默认配置 ===
    const DEFAULT_WORK_MIN = 25;
    const DEFAULT_BREAK_MIN = 5;
    const DEFAULT_LONG_BREAK_MIN = 15;
    const DEFAULT_ENABLE_SOUND = true;
    const DEFAULT_ENABLE_STORAGE = true;

    // === DOM 元素 ===
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
    const counterEl = document.getElementById('pomo-counter');
    const totalEl = document.getElementById('pomo-total');

    const enableSoundInput = document.getElementById('enable-sound');
    const enableStorageInput = document.getElementById('enable-storage');
    const clearStorageBtn = document.getElementById('clear-storage');
    const resetSettingsBtn = document.getElementById('reset-settings');
    const fullscreenBtn = document.getElementById('pomo-fullscreen-btn');

    // === 本地存储 ===
    const STORAGE_KEY = 'pomodoro_stats_v1';
    let pomoCount = 0;
    let totalFocusMinutes = 0;

    let enableSound = DEFAULT_ENABLE_SOUND;
    let enableStorage = DEFAULT_ENABLE_STORAGE;

    let longBreakTime = DEFAULT_LONG_BREAK_MIN * 60;
    let workTime = DEFAULT_WORK_MIN * 60;
    let breakTime = DEFAULT_BREAK_MIN * 60;

    // === 状态 ===
    let timerInterval = null;
    let isRunning = false;
    let isWorkSession = true;
    let currentTime = workTime;
    let endTimestamp = null;

    // === Web Audio ===
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    window.beepInterval = null;

    // === Wake Lock ===
    let wakeLock = null;

    document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement) {
            // 全屏被退出（无论自动还是手动）
            container.classList.remove("fullscreen-active");
            releaseWakeLock();
        }
    });


    async function requestWakeLock() {
        if (!("wakeLock" in navigator)) return;
        try {
            wakeLock = await navigator.wakeLock.request("screen");
            wakeLock.addEventListener("release", () => {});
            document.addEventListener("visibilitychange", handleVisibilityChange);
        } catch {}
    }
    function handleVisibilityChange() {
        if (document.visibilityState === "visible" && wakeLock === null) {
            requestWakeLock();
        }
    }
    function releaseWakeLock() {
        if (wakeLock) {
            wakeLock.release().catch(() => {});
            wakeLock = null;
        }
        document.removeEventListener("visibilitychange", handleVisibilityChange);
    }

    // === LocalStorage ===
    function getTodayString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function loadStatsFromStorage() {
        const today = getTodayString();
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        try {
            const saved = JSON.parse(raw);

            // 读取设置
            enableSound = saved.enableSound ?? DEFAULT_ENABLE_SOUND;
            enableStorage = saved.enableStorage ?? DEFAULT_ENABLE_STORAGE;

            if (saved.workTime) workTime = saved.workTime;
            if (saved.breakTime) breakTime = saved.breakTime;
            if (saved.longBreakTime) longBreakTime = saved.longBreakTime;

            // 读取今日统计
            if (saved.date === today) {
                pomoCount = saved.pomoCount || 0;
                totalFocusMinutes = saved.totalFocusMinutes || 0;
            }

            // 更新 UI
            workInput.value = Math.round(workTime / 60);
            breakInput.value = Math.round(breakTime / 60);
            longBreakInput.value = Math.round(longBreakTime / 60);
            enableSoundInput.checked = enableSound;
            enableStorageInput.checked = enableStorage;

        } catch {}
    }

    function saveStatsToStorage() {
        if (!enableStorage) return;
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    /**
     * 统一弹窗提醒
     * @param {string} message - 显示文本
     * @param {boolean} needAction - 是否需要“关闭”按钮（例如番茄完成提示）
     * @param {number} duration - 自动关闭时间（毫秒），为 0 则不自动关闭
     */
    function showSnackbar(message, needAction = false, duration = 3000) {
        //stopBeepLoop(); // 每次弹窗前先停止声音（如果是循环提示，则后面会重新开启）

        Snackbar.show({
            text: message,

            // ① 显示位置：居中顶部
            pos: "top-center",

            // ② 自动关闭时间
            duration: duration, // 毫秒；若要永不关闭则传 0

            // ③ 是否显示关闭按钮
            showAction: needAction,

            actionText: "关闭",

            // ④ 按下关闭动作
            onActionClick: function (element) {
                element.style.opacity = 0;//关闭弹窗
                stopBeepLoop();
            }
        });
    }


    // === 新版声音循环：哔哔 → 停 1 秒 → 哔哔 → 停 1 秒 → 循环 ===
    function startBeepLoop() {
        if (!enableSound) return;
        if (audioCtx.state === "suspended") audioCtx.resume();

        if (window.beepInterval) clearInterval(window.beepInterval);

        function doubleBeep() {
            const now = audioCtx.currentTime;

            // 第 1 声
            let osc1 = audioCtx.createOscillator();
            let gain1 = audioCtx.createGain();
            osc1.frequency.value = 1000;
            gain1.gain.value = 0.2;
            osc1.connect(gain1).connect(audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            // 第 2 声（0.3 秒后）
            let osc2 = audioCtx.createOscillator();
            let gain2 = audioCtx.createGain();
            osc2.frequency.value = 1000;
            gain2.gain.value = 0.2;
            osc2.connect(gain2).connect(audioCtx.destination);
            osc2.start(now + 0.3);
            osc2.stop(now + 0.45);
        }

        doubleBeep();
        window.beepInterval = setInterval(doubleBeep, 1000); // 1.5 秒一轮
    }

    function stopBeepLoop() {
        if (window.beepInterval) clearInterval(window.beepInterval);
    }

    // === 提醒用户（统一使用 Snackbar + 声音循环） ===
    function notifyUser(message) {
        startBeepLoop();
        showSnackbar(message,true,0);
    }

    // === UI 更新 ===
    function updateStatsUI() {
        counterEl.textContent = `你已经进行了 ${pomoCount} 个番茄专注！🍅`;
        totalEl.textContent = `今日累计专注：${Math.round(totalFocusMinutes)} 分钟`;
    }

    function updateDisplay() {
        const m = String(Math.floor(currentTime / 60)).padStart(2, "0");
        const s = String(currentTime % 60).padStart(2, "0");
        timerDisplay.textContent = `${m}:${s}`;

        if (isRunning) {
            document.title = `${isWorkSession ? "专注中" : "休息中"}(${m}:${s}) 番茄钟`;
        } else {
            document.title = "YangLuoNou's 番茄钟";
        }
    }

    // === 全屏控制 ===
    function enterFullscreen() {
        container.classList.add("fullscreen-active");
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
    }
    function exitFullscreen() {
        container.classList.remove("fullscreen-active");  // 永远移除样式

        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    }

    // === Timer 控制 ===
    function toggleTimer() {
        if (isRunning) pauseTimer();
        else startTimer();
    }

    function startTimer() {
        if (isRunning) return;

        isRunning = true;
        startBtn.textContent = isWorkSession ? "暂停" : "停止休息";

        if (isWorkSession) {
            statusDisplay.textContent = "专注ing";
            enterFullscreen();
            requestWakeLock();
        }
        

        // 关键：记录“应该结束”的绝对时间
        const now = Date.now();
        endTimestamp = now + currentTime * 1000;

        timerInterval = setInterval(() => {
            const now = Date.now();
            const diffMs = endTimestamp - now;
            currentTime = Math.max(0, Math.round(diffMs / 1000));

            updateDisplay();

            if (currentTime <= 0) {
                // 防止多次触发
                clearInterval(timerInterval);
                timerInterval = null;
                if (isRunning) {
                    // 保证只处理一次完成逻辑
                    handleTimerComplete();
                }
            }
        }, 1000);
    }


    function pauseTimer() {
        isRunning = false;
        clearInterval(timerInterval);
        timerInterval = null;
        endTimestamp = null;
        startBtn.textContent = "继续";
        releaseWakeLock();
    }


    function resetTimer() {
        pauseTimer();
        isWorkSession = true;
        currentTime = workTime;
        startBtn.textContent = "开始专注";
        statusDisplay.textContent = "准备专注";
        exitFullscreen();
        releaseWakeLock();
        updateDisplay();
    }

    function handleTimerComplete() {
        pauseTimer();
        releaseWakeLock();

        

        if (isWorkSession) {
            // 专注结束
            exitFullscreen();
            pomoCount++;
            totalFocusMinutes += workTime / 60;
            updateStatsUI();
            saveStatsToStorage();

            if (pomoCount % 4 === 0) {
                isWorkSession = false;
                currentTime = longBreakTime;
                statusDisplay.textContent = "🎉 长休息时间！";
                notifyUser("恭喜完成四次专注！进入长休息～");
            } else {
                isWorkSession = false;
                currentTime = breakTime;
                statusDisplay.textContent = "☕ 休息一下";
                notifyUser("专注结束！请休息一下。");
            }

        } else {
            // 休息结束
            isWorkSession = true;
            currentTime = workTime;
            statusDisplay.textContent = "准备专注";
            notifyUser("休息结束，准备开始新的专注！");
        }

        updateDisplay();
    }

    // === 事件绑定 ===
    startBtn.addEventListener("click", toggleTimer);
    resetBtn.addEventListener("click", resetTimer);

        // 页面从后台/锁屏恢复时，校正一次剩余时间
    let autoFinishedWhileHidden = false;

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && isRunning && endTimestamp) {
            const now = Date.now();
            const diffMs = endTimestamp - now;
            currentTime = Math.max(0, Math.round(diffMs / 1000));

            if (currentTime <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                autoFinishedWhileHidden = true;
                handleTimerComplete();
            } else {
                updateDisplay();
            }
        }
    });


    settingsBtn.addEventListener("click", () => {
        settingsPanel.classList.toggle("hidden");
    });

    saveSettingsBtn.addEventListener("click", () => {
        workTime = parseInt(workInput.value, 10) * 60;
        breakTime = parseInt(breakInput.value, 10) * 60;
        longBreakTime = parseInt(longBreakInput.value, 10) * 60;

        enableSound = enableSoundInput.checked;
        enableStorage = enableStorageInput.checked;

        if (!isRunning) {
            currentTime = isWorkSession ? workTime : breakTime;
            updateDisplay();
        }

        saveStatsToStorage();
        showSnackbar("设置已保存");
    });

    if (clearStorageBtn) {
        clearStorageBtn.addEventListener("click", () => {
            localStorage.removeItem(STORAGE_KEY);
            pomoCount = 0;
            totalFocusMinutes = 0;
            updateStatsUI();
            showSnackbar("本地统计数据已清除");
        });
    }

    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener("click", () => {
            workTime = DEFAULT_WORK_MIN * 60;
            breakTime = DEFAULT_BREAK_MIN * 60;
            longBreakTime = DEFAULT_LONG_BREAK_MIN * 60;

            enableSound = DEFAULT_ENABLE_SOUND;
            enableStorage = DEFAULT_ENABLE_STORAGE;

            workInput.value = DEFAULT_WORK_MIN;
            breakInput.value = DEFAULT_BREAK_MIN;
            longBreakInput.value = DEFAULT_LONG_BREAK_MIN;

            enableSoundInput.checked = enableSound;
            enableStorageInput.checked = enableStorage;

            if (!isRunning) {
                currentTime = workTime;
                updateDisplay();
            }

            saveStatsToStorage();
            showSnackbar("已恢复默认设置");
        });
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener("click", () => {
            if (isWorkSession && isRunning) enterFullscreen();
            else showSnackbar("只有在专注进行中才能进入全屏模式～");
        });
    }

    // === 初始化 ===
    loadStatsFromStorage();
    updateStatsUI();
    updateDisplay();
}

// 初始化（PJAX + 首次加载）
document.addEventListener("DOMContentLoaded", initPomodoro);
document.addEventListener("pjax:complete", initPomodoro);
document.addEventListener("pjax:end", initPomodoro);
