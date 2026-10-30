function dashboardApp() {
      return {
        keys: [],
        totalKeys: 0,
        usageSummary: {
          total: 0,
          quota_exhausted: 0,
          balance_insufficient: 0,
          today_tokens: null,
          today_requests: null
        },
        usageDisplayMode: 'used',
        hasMoreKeys: false,
        loadingMore: false,
        loading: false,
        refreshingKeys: {},
        togglingSchedule: {},
        clearingErrorId: null,
        countdown: 60,
        timer: null,
        searchQuery: '',
        sortBy: 'default',
        isAdmin: false,
        csrfToken: null,
        publicCsrfToken: null,
        draggedIndex: null,
        deleteConfirmId: null,
        deleteConfirmVisible: false,
        dragOverIndex: null,

        showLoginModal: false,
        loginForm: { username: '', password: '' },

        // Toast 通知
        toast: { show: false, message: '', type: 'success' },
        toastTimer: null,

        showToast(message, type = 'success') {
          this.toast = { show: true, message, type };
          if (this.toastTimer) clearTimeout(this.toastTimer);
          this.toastTimer = setTimeout(() => {
            this.toast.show = false;
          }, 3000);
        },

        showKeyModal: false,
        keyForm: {
          id: null, provider: 'zhipu', display_name: '', api_key: '',
          base_url: '', access_key_id: '', secret_access_key: '',
          organization_id: '', project_id: '', team: '', owner: '', member_count: 0,
          public_schedule_control: false, public_recover_control: false, admin_locked: false
        },

        PROVIDER_LIST: [
          { value: 'kimi', label: 'Kimi For Coding' },
          { value: 'zhipu', label: 'Zhipu GLM (智谱)' },
          { value: 'zhipu_team', label: 'Zhipu GLM Team (智谱团队)' },
          { value: 'minimax', label: 'MiniMax' },
          { value: 'volcengine', label: '火山方舟 (Volcengine)' },
          { value: 'zenmux', label: 'ZenMux' },
          { value: 'deepseek', label: 'DeepSeek (余额)' },
          { value: 'stepfun', label: 'StepFun (余额)' },
          { value: 'siliconflow', label: 'SiliconFlow (余额)' },
          { value: 'openrouter', label: 'OpenRouter (余额)' },
          { value: 'novita', label: 'Novita AI (余额)' }
        ],

        // Settings State
        iconList: [],
        settingsLoaded: false,
        settings: {
          site_title: 'Quota Dashboard',
          site_description: 'AI 模型 API Key 用量与配额监控',
          site_icon: '/favicon.svg',
          announcement: '',
          refresh_interval: 300,
          theme_mode: 'auto',
          theme_palette: 'teal',
          visible_fields: {
            display_name: true,
            team: true,
            owner: true,
            member_count: true,
            sub2api_groups: true,
            sub2api_schedulable: true,
            sub2api_status: true,
            usage_5h: true,
            usage_7d: true,
            usage_monthly: true,
            today_tokens: true,
            reset_time: true,
            last_updated: true
          }
        },
        showSettingsModal: false,
        settingsTab: 'basic',
        announcementDismissed: false,
        announcementCollapsed: true,
        settingsForm: {
          site_title: '',
          site_description: '',
          site_icon: '',
          announcement: '',
          refresh_interval: 300,
          theme_mode: 'auto',
          theme_palette: 'teal',
          sub2api_url: '',
          sub2api_sync_interval: 900,
          sub2api_admin_api_key: '',
          sub2api_control_api_key: '',
          sub2api_admin_api_key_set: false,
          sub2api_control_api_key_set: false,
          sub2api_control_mode: 'none',
          sub2api_admin_api_key_clear: false,
          sub2api_control_api_key_clear: false,
          visible_fields: {}
        },
        testingSub2api: false,
        sub2apiTestResult: null,
        syncingSub2api: false,
        syncingKeyId: null,
        showSub2apiAccountsModal: false,
        loadingSub2apiAccounts: false,
        sub2apiAccounts: [],
        sub2apiAccountSearch: '',
        sub2apiAccountsError: '',
        importingSub2apiAccounts: false,
        themeMode: 'auto',
        themePalette: 'teal',
        themePaletteList: [
          { id: 'teal', name: '经典青碧', desc: '默认理智科技', color: '#0f766e', darkColor: '#5fd4c3' },
          { id: 'zinc', name: '极简黑白', desc: '中性极简美学', color: '#18181b', darkColor: '#fafafa' },
          { id: 'slate', name: '极客深蓝', desc: '沉浸科技深蓝', color: '#2563eb', darkColor: '#38bdf8' }
        ],
        fontFamily: 'jinkai',
        fontWeight: 'medium',
        fontFamilyList: [
          { id: 'jinkai', name: '仓耳今楷', desc: '典雅楷书 · 文化雅韵' },
          { id: 'system', name: '系统默认', desc: '清晰规范 · 随系统默认' }
        ],
        fontWeightList: [
          { id: 'normal', name: '纤细常规', desc: '原始纤秀笔画 (400)' },
          { id: 'medium', name: '适中清晰', desc: '饱满清晰 (500，推荐)' },
          { id: 'bold', name: '沉稳加粗', desc: '浓墨醒目 (600)' }
        ],
        resolvedAppearance: 'light',
        themeMedia: null,
        tooltipElement: null,
        tooltipTarget: null,
        tooltipPointer: { x: 0, y: 0 },
        tooltipWatchFrame: null,
        tooltipWatch: null,
        passwordForm: {
          current_password: '',
          new_password: '',
          confirm_password: ''
        },

        async init() {
          localStorage.removeItem('adminToken');
          try {
            this.usageDisplayMode = localStorage.getItem('quotaUsageDisplayMode') === 'remaining'
              ? 'remaining'
              : 'used';
          } catch (_) {
            this.usageDisplayMode = 'used';
          }
          this.fetchIcons();
          this.initializeTheme();
          await Promise.all([
            this.fetchAdminSession(),
            this.fetchSettings().catch(e => {
              console.error('Settings load failed, using defaults:', e);
            })
          ]);
          await this.fetchData();
          // 管理员进入页面时静默触发一次上游刷新与 Sub2API 同步；访客仍只读缓存。
          if (this.isAdmin) {
            this.triggerFullRefresh(true).catch(() => {});
          }
          this.startCountdown();
          this.initializeTooltips();
        },

        async adminFetch(url, options = {}) {
          const method = String(options.method || 'GET').toUpperCase();
          const headers = new Headers(options.headers || {});
          if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const csrfToken = this.csrfToken;
            if (csrfToken) headers.set('x-csrf-token', csrfToken);
          }
          const response = await fetch(url, {
            ...options,
            method,
            headers,
            credentials: 'same-origin'
          });
          if (response.status === 401) {
            this.isAdmin = false;
            this.csrfToken = null;
          }
          return response;
        },

        async fetchAdminSession() {
          try {
            const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
            const json = await res.json();
            this.isAdmin = !!json.authenticated;
            this.csrfToken = json.csrfToken || null;
          } catch (_) {
            this.isAdmin = false;
            this.csrfToken = null;
          }
        },

        initializeTooltips() {
          this.tooltipElement = document.getElementById('app-tooltip');
          if (!this.tooltipElement || !window.matchMedia('(hover: hover)').matches) return;

          // 以指针坐标为准校验当前悬停目标，避免依赖不可靠的 pointerout 事件
          this.validateTooltipAtPointer = () => {
            if (!this.tooltipElement.classList.contains('is-visible')) return;
            const element = document.elementFromPoint(this.tooltipPointer.x, this.tooltipPointer.y);
            const target = element && element.closest ? element.closest('[data-tooltip]') : null;
            if (!target) {
              this.hideTooltip();
            } else if (target !== this.tooltipTarget) {
              this.showTooltip(target);
            }
          };

          // 浮层可见期间持续校验，确保指针进入无提示区域后立即隐藏
          this.tooltipWatch = () => {
            this.tooltipWatchFrame = null;
            if (!this.tooltipElement.classList.contains('is-visible')) return;
            this.validateTooltipAtPointer();
            if (this.tooltipElement.classList.contains('is-visible')) {
              this.tooltipWatchFrame = requestAnimationFrame(this.tooltipWatch);
            }
          };

          document.addEventListener('pointermove', (event) => {
            this.tooltipPointer.x = event.clientX;
            this.tooltipPointer.y = event.clientY;

            if (!this.tooltipTarget) {
              const target = event.target.closest ? event.target.closest('[data-tooltip]') : null;
              if (target) this.showTooltip(target);
              return;
            }

            if (!this.tooltipTarget.isConnected) {
              this.hideTooltip();
              return;
            }

            this.validateTooltipAtPointer();
          }, { passive: true });

          document.addEventListener('pointerdown', () => this.hideTooltip(), true);
          document.addEventListener('wheel', () => this.hideTooltip(), { passive: true, capture: true });
          document.addEventListener('touchstart', () => this.hideTooltip(), { passive: true, capture: true });
          document.addEventListener('pointerout', (event) => {
            if (!event.relatedTarget) this.hideTooltip();
          });
          window.addEventListener('resize', () => this.hideTooltip());
          window.addEventListener('scroll', () => this.hideTooltip(), true);
          window.addEventListener('blur', () => this.hideTooltip());
        },

        showTooltip(target) {
          if (!this.tooltipElement) return;
          const text = target.getAttribute('data-tooltip');
          if (!text || !text.trim()) {
            this.hideTooltip();
            return;
          }

          this.tooltipTarget = target;
          this.tooltipElement.textContent = text;
          this.tooltipElement.setAttribute('aria-hidden', 'false');
          this.tooltipElement.style.opacity = '0';
          this.tooltipElement.classList.add('is-visible');

          requestAnimationFrame(() => {
            if (this.tooltipTarget !== target) return;
            const rect = target.getBoundingClientRect();
            const tip = this.tooltipElement;
            const tipWidth = tip.offsetWidth;
            const tipHeight = tip.offsetHeight;
            const gap = 10;
            let top = rect.top - tipHeight - gap;
            let placement = 'top';

            if (top < 8) {
              top = rect.bottom + gap;
              placement = 'bottom';
            }

            const maxLeft = Math.max(8, window.innerWidth - tipWidth - 8);
            const left = Math.min(Math.max(8, rect.left + rect.width / 2 - tipWidth / 2), maxLeft);

            tip.dataset.placement = placement;
            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
            tip.style.opacity = '1';
          if (this.tooltipWatchFrame === null && this.tooltipWatch) this.tooltipWatch();
          });
        },

        hideTooltip() {
          if (!this.tooltipElement) return;
          this.tooltipTarget = null;
          this.tooltipElement.classList.remove('is-visible');
          this.tooltipElement.setAttribute('aria-hidden', 'true');
          // 清除 showTooltip 定位时写入的内联 opacity，否则会盖过类样式导致浮层残留
          this.tooltipElement.style.opacity = '';
        },

        async fetchIcons() {
          try {
            const res = await fetch('/api/icons');
            const json = await res.json();
            if (json.success) {
              this.iconList = json.data;
            }
          } catch (err) {
            console.error('Fetch icons error:', err);
          }
        },

        startCountdown() {
          if (this.timer) clearInterval(this.timer);
          const interval = parseInt(this.settings.refresh_interval, 10) || 300;
          this.countdown = interval;
          this.timer = setInterval(() => {
            this.countdown--;
            if (this.countdown <= 0) {
              this.fetchData();
              this.countdown = interval;
            }
          }, 1000);
        },

        async fetchSettings() {
          try {
            const res = await fetch('/api/settings');
            const json = await res.json();
            if (json.success && json.data) {
              this.settings = {
                ...this.settings,
                ...json.data
              };
              if (json.data.site_title) {
                document.title = `${json.data.site_title} - API Key 用量监控平台`;
              }
              if (json.data.site_icon) {
                this.updateFavicon(json.data.site_icon);
              }
              if (!localStorage.getItem('quotaThemeMode')) {
                this.themeMode = ['light', 'dark', 'auto'].includes(json.data.theme_mode) ? json.data.theme_mode : 'auto';
                this.applyThemeMode();
              }
              if (!localStorage.getItem('quotaThemePalette') && json.data.theme_palette) {
                this.themePalette = ['teal', 'zinc', 'slate'].includes(json.data.theme_palette) ? json.data.theme_palette : 'teal';
              }
                          if (!localStorage.getItem('quotaFontFamily') && json.data.font_family) {
                this.fontFamily = ['jinkai', 'system'].includes(json.data.font_family) ? json.data.font_family : 'jinkai';
              }
              if (!localStorage.getItem('quotaFontWeight') && json.data.font_weight) {
                this.fontWeight = ['normal', 'medium', 'bold'].includes(json.data.font_weight) ? json.data.font_weight : 'medium';
              }
}
          } catch (err) {
            console.error('Fetch settings error:', err);
          } finally {
            this.settingsLoaded = true;
          }
        },

        updateFavicon(iconPath) {
          let link = document.querySelector('link[rel="icon"]');
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = iconPath;
        },

        initializeTheme() {
          const savedMode = localStorage.getItem('quotaThemeMode');
          this.themeMode = ['light', 'dark', 'auto'].includes(savedMode) ? savedMode : (this.settings.theme_mode || 'auto');
          const savedPalette = localStorage.getItem('quotaThemePalette');
          this.themePalette = ['teal', 'zinc', 'slate'].includes(savedPalette) ? savedPalette : (this.settings.theme_palette || 'teal');
          const savedFontFamily = localStorage.getItem('quotaFontFamily');
          this.fontFamily = ['jinkai', 'system'].includes(savedFontFamily) ? savedFontFamily : (this.settings.font_family || 'jinkai');
          const savedFontWeight = localStorage.getItem('quotaFontWeight');
          this.fontWeight = ['normal', 'medium', 'bold'].includes(savedFontWeight) ? savedFontWeight : (this.settings.font_weight || 'medium');
          this.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
          this.themeMedia.addEventListener('change', () => {
            if (this.themeMode === 'auto') this.applyThemeMode();
          });
          this.applyThemeMode();
        },

        setThemeMode(mode) {
          if (!['light', 'dark', 'auto'].includes(mode)) return;
          this.themeMode = mode;
          localStorage.setItem('quotaThemeMode', mode);
          this.applyThemeMode();
          this.showToast(mode === 'auto' ? '已跟随系统主题' : `已切换到${mode === 'dark' ? '深色' : '浅色'}主题`);
        },

        setThemePalette(palette) {
          if (!['teal', 'zinc', 'slate'].includes(palette)) return;
          this.themePalette = palette;
          localStorage.setItem('quotaThemePalette', palette);
          const found = this.themePaletteList.find(p => p.id === palette);
          this.showToast(`已切换至「${found?.name || palette}」配色`);
        },

        setFontFamily(family) {
          if (!['jinkai', 'system'].includes(family)) return;
          this.fontFamily = family;
          localStorage.setItem('quotaFontFamily', family);
          const found = this.fontFamilyList.find(f => f.id === family);
          this.showToast(`已切换字体：${found?.name || family}`);
        },

        setFontWeight(weight) {
          if (!['normal', 'medium', 'bold'].includes(weight)) return;
          this.fontWeight = weight;
          localStorage.setItem('quotaFontWeight', weight);
          const found = this.fontWeightList.find(w => w.id === weight);
          this.showToast(`已调整字体粗细：${found?.name || weight}`);
        },

        applyThemeMode() {
          const dark = this.themeMode === 'dark' || (this.themeMode === 'auto' && this.themeMedia?.matches);
          this.resolvedAppearance = dark ? 'dark' : 'light';
        },

        async fetchData() {
          this.loading = true;
          try {
            if (this.isAdmin) {
              const [keysRes, usageRes] = await Promise.all([
                this.adminFetch('/api/admin/keys'),
                fetch('/api/usage')
              ]);
              const keysJson = await keysRes.json();
              const usageJson = await usageRes.json();
              if (keysJson.success && usageJson.success) {
                this.publicCsrfToken = usageJson.csrfToken || null;
                // 合并用量数据到所有 Key 中
                const usageMap = {};
                usageJson.data.forEach(u => { usageMap[u.id] = u; });
                this.keys = this.groupKeysByProvider(keysJson.data.map(k => ({
                  ...k,
                  usage: usageMap[k.id]?.usage || null,
                  risk: usageMap[k.id]?.risk || null,
                  control_actions: usageMap[k.id]?.control_actions || [],
                  control_token: usageMap[k.id]?.control_token || null
                })));
                this.totalKeys = keysJson.data.length;
                this.usageSummary = usageJson.summary || {
                  total: usageJson.total || 0,
                  quota_exhausted: 0,
                  balance_insufficient: 0,
                  today_tokens: null,
                  today_requests: null
                };
                this.hasMoreKeys = false;
              }
            } else {
              const res = await fetch('/api/usage?limit=500&offset=0');
              const json = await res.json();
              if (json.success) {
                this.publicCsrfToken = json.csrfToken || null;
                this.keys = this.groupKeysByProvider(json.data);
                this.totalKeys = json.total || json.data.length;
                this.usageSummary = json.summary || {
                  total: json.total || json.data.length,
                  quota_exhausted: 0,
                  balance_insufficient: 0,
                  today_tokens: null,
                  today_requests: null
                };
                this.hasMoreKeys = !!json.hasMore;
              }
            }
          } catch (err) {
            console.error('Fetch error:', err);
          } finally {
            this.loading = false;
          }
        },

        async loadMoreKeys() {
          if (!this.hasMoreKeys || this.loadingMore) return;
          this.loadingMore = true;
          try {
            const res = await fetch(`/api/usage?limit=500&offset=${this.keys.length}`);
            const json = await res.json();
            if (!json.success) {
              this.showToast(json.error || '加载更多失败', 'error');
              return;
            }
            const merged = new Map(this.keys.map(item => [item.id, item]));
            json.data.forEach(item => merged.set(item.id, item));
            this.keys = this.groupKeysByProvider(Array.from(merged.values()));
            this.publicCsrfToken = json.csrfToken || this.publicCsrfToken;
            this.totalKeys = json.total || this.keys.length;
            this.usageSummary = json.summary || this.usageSummary;
            this.hasMoreKeys = !!json.hasMore;
          } catch (err) {
            this.showToast('加载更多异常: ' + err.message, 'error');
          } finally {
            this.loadingMore = false;
          }
        },

        async refreshKey(id) {
          this.refreshingKeys = { ...this.refreshingKeys, [id]: true };
          try {
            if (!this.isAdmin) {
              await this.fetchData();
              this.showToast('已从服务端缓存刷新');
              return;
            }
            const res = await this.adminFetch(`/api/admin/usage/refresh/${id}`, { method: 'POST' });
            const json = await res.json();
            if (json.success) {
              await this.fetchData();
              this.showToast('刷新成功');
            } else {
              this.showToast(json.error || '刷新失败', 'error');
            }
          } catch (err) {
            this.showToast('刷新异常: ' + err.message, 'error');
          } finally {
            this.refreshingKeys = { ...this.refreshingKeys, [id]: false };
          }
        },

        async triggerFullRefresh(silent = false) {
          if (this.loading) return;
          if (!this.isAdmin) {
            await this.fetchData();
            return;
          }
          const res = await this.adminFetch('/api/admin/usage/refresh', { method: 'POST' });
          const json = await res.json();
          if (!json.success) {
            if (!silent) this.showToast(json.error || '刷新失败', 'error');
            return;
          }
          if (json.running) {
            for (let i = 0; i < 20; i++) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              const statusRes = await this.adminFetch('/api/admin/usage/status');
              const statusJson = await statusRes.json();
              if (!statusJson.running) break;
            }
          }
          await this.fetchData();
          this.showToast('刷新完成');
        },

        async toggleKey(id) {
          try {
            const res = await this.adminFetch(`/api/admin/keys/${id}/toggle`, { method: 'PUT' });
            const json = await res.json();
            if (json.success) {
              this.fetchData();
              this.showToast(json.enabled ? '已设为公开显示（所有用户可见）' : '已设为后台隐藏（仅管理员可见）');
            } else {
              this.showToast(json.error || '操作失败', 'error');
            }
          } catch (err) {
            this.showToast('操作异常: ' + err.message, 'error');
          }
        },

        async toggleSub2apiSchedule(item) {
          if (!item || !item.sub2api_linked || this.togglingSchedule[item.id]) return;
          const nextValue = !item.sub2api_schedulable;
          this.togglingSchedule = { ...this.togglingSchedule, [item.id]: true };
          try {
            const res = await fetch(`/api/usage/${item.id}/sub2api/schedulable`, {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': this.publicCsrfToken || ''
              },
              body: JSON.stringify({
                token: item.control_token,
                schedulable: nextValue,
                expectedState: !!item.sub2api_schedulable
              })
            });
            const json = await res.json();
            if (json.success) {
              item.sub2api_schedulable = json.schedulable ? 1 : 0;
              this.showToast(json.schedulable ? '已开启 Sub2API 账号调度' : '已关闭 Sub2API 账号调度');
            } else {
              this.showToast(json.error || '调度开关操作失败', 'error');
            }
          } catch (err) {
            this.showToast('调度开关操作异常: ' + err.message, 'error');
          } finally {
            this.togglingSchedule = { ...this.togglingSchedule, [item.id]: false };
          }
        },

        async clearSub2apiError(item) {
          if (!item || !item.sub2api_linked || this.clearingErrorId) return;
          this.clearingErrorId = item.id;
          try {
            const res = await fetch(`/api/usage/${item.id}/sub2api/clear-error`, {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': this.publicCsrfToken || ''
              },
              body: JSON.stringify({
                token: item.control_token,
                expectedStatus: item.sub2api_status
              })
            });
            const json = await res.json();
            if (json.status) {
              item.sub2api_status = json.status;
              item.sub2api_error_message = json.error_message || '';
              if (typeof json.schedulable === 'boolean') {
                item.sub2api_schedulable = json.schedulable ? 1 : 0;
              }
            }
            if (json.success) {
              this.showToast('Sub2API 账号状态已恢复正常');
            } else {
              this.showToast(json.error || '恢复操作失败', 'error');
            }
          } catch (err) {
            this.showToast('恢复操作异常: ' + err.message, 'error');
          } finally {
            this.clearingErrorId = null;
          }
        },

        setUsageDisplayMode(mode) {
          if (!['used', 'remaining'].includes(mode) || this.usageDisplayMode === mode) return;
          this.usageDisplayMode = mode;
          try {
            localStorage.setItem('quotaUsageDisplayMode', mode);
          } catch (_) {
            // Preference persistence is best-effort.
          }
        },

        getAccountStatusClass(status) {
          const s = (status || '').toLowerCase();
          if (s === 'active' || s === 'normal') {
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
          }
          if (s === 'error' || s === 'inactive') {
            return 'bg-rose-50 text-rose-700 border-rose-200';
          }
          if (s === 'warning' || s === 'throttled') {
            return 'bg-amber-50 text-amber-700 border-amber-200';
          }
          return 'bg-slate-100 text-slate-700 border-slate-200';
        },

        getAccountStatusTone(status) {
          const s = (status || '').toLowerCase();
          if (s === 'active' || s === 'normal') return 'green';
          if (s === 'temp_unschedulable' || s === 'throttled' || s === 'overloaded' || s === 'warning') return 'amber';
          if (s === 'error' || s === 'inactive') return 'rose';
          return '';
        },

        getUsageTone(percent) {
          if (percent == null) return 'muted';
          if (percent >= 80) return 'rose';
          if (percent >= 50) return 'amber';
          return 'green';
        },

        getBalanceTone(balance) {
          return balance != null && balance <= 0 ? 'rose' : 'green';
        },

        usageDisplayValue(usedPercent) {
          if (usedPercent === null || usedPercent === undefined) return null;
          const used = Number(usedPercent);
          if (!Number.isFinite(used)) return null;
          return this.usageDisplayMode === 'remaining'
            ? Math.max(0, 100 - used)
            : Math.max(0, used);
        },

        usageMeterValue(usedPercent) {
          const value = this.usageDisplayValue(usedPercent);
          return value === null ? 0 : Math.min(100, value);
        },

        usageWindowLabel(label) {
          return `${label}·${this.usageDisplayMode === 'remaining' ? '剩余' : '已用'}`;
        },

        normalizeAccountRisk(item) {
          const risk = item && item.risk;
          return {
            quota_windows: Array.isArray(risk && risk.quota_windows) ? risk.quota_windows : [],
            quota_exhausted: !!(risk && risk.quota_exhausted),
            balance_insufficient: !!(risk && risk.balance_insufficient)
          };
        },

        hasAccountRisk(item) {
          const risk = this.normalizeAccountRisk(item);
          return risk.quota_exhausted || risk.balance_insufficient;
        },

        riskWindowLabel(windowKey) {
          return ({ '5h': '5小时', '7d': '7天', '30d': '30天' })[windowKey] || windowKey;
        },

        usageWindowVisible(item) {
          if (!item.usage || this.balanceVisible(item)) return false;
          return item.usage.usage_5h != null ||
            item.usage.usage_7d != null ||
            item.usage.usage_monthly != null;
        },

        balanceVisible(item) {
          return this.isBalanceProvider(item.provider) && !!item.usage && item.usage.balance_remaining != null;
        },

        groupKeysByProvider(list) {
          if (!Array.isArray(list)) return [];
          const providerOrder = new Map();
          list.forEach(item => {
            const provider = item.provider || '';
            if (!providerOrder.has(provider)) {
              providerOrder.set(provider, providerOrder.size);
            }
          });

          return [...list].sort((a, b) => {
            const groupDiff = providerOrder.get(a.provider || '') - providerOrder.get(b.provider || '');
            if (groupDiff !== 0) return groupDiff;
            const sortDiff = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
            return sortDiff || ((Number(a.id) || 0) - (Number(b.id) || 0));
          });
        },

        formatCurrencyUnit(unit) {
          const code = String(unit || 'CNY').trim().toUpperCase();
          const labels = {
            CNY: '元',
            RMB: '元',
            USD: '美元',
            EUR: '欧元',
            GBP: '英镑',
            JPY: '日元',
            HKD: '港元'
          };
          return labels[code] || code;
        },

        formatAccountStatus(status) {
          const key = (status || '').toLowerCase();
          const map = {
            active: '正常',
            temp_unschedulable: '临时不可调度',
            throttled: '接口限流',
            overloaded: '服务过载',
            warning: '用量预警',
            inactive: '已停用',
            error: '账号异常',
            unknown: '状态未知'
          };
          return map[key] || status;
        },

        async openSettingsModal() {
          this.passwordForm = { current_password: '', new_password: '', confirm_password: '' };
          this.sub2apiTestResult = null;
          try {
            const res = await this.adminFetch('/api/admin/settings');
            const json = await res.json();
            if (json.success && json.data) {
              this.settingsForm = JSON.parse(JSON.stringify(json.data));
              if (!this.settingsForm.visible_fields) this.settingsForm.visible_fields = {};
              if (this.settingsForm.visible_fields.sub2api_groups === undefined) {
                this.settingsForm.visible_fields.sub2api_groups = true;
              }
              if (this.settingsForm.visible_fields.sub2api_schedulable === undefined) {
                this.settingsForm.visible_fields.sub2api_schedulable = true;
              }
              if (this.settingsForm.visible_fields.sub2api_status === undefined) {
                this.settingsForm.visible_fields.sub2api_status = true;
              }
              if (this.settingsForm.visible_fields.today_tokens === undefined) {
                this.settingsForm.visible_fields.today_tokens = true;
              }
              if (this.settingsForm.theme_mode === undefined) this.settingsForm.theme_mode = 'auto';
              if (this.settingsForm.theme_palette === undefined) this.settingsForm.theme_palette = 'teal';
              if (this.settingsForm.font_family === undefined) this.settingsForm.font_family = this.fontFamily || 'jinkai';
              if (this.settingsForm.font_weight === undefined) this.settingsForm.font_weight = this.fontWeight || 'medium';
              this.settingsForm.sub2api_admin_api_key ||= '';
              this.settingsForm.sub2api_control_api_key ||= '';
              this.settingsForm.sub2api_admin_api_key_clear = false;
              this.settingsForm.sub2api_control_api_key_clear = false;
            } else {
              this.settingsForm = JSON.parse(JSON.stringify(this.settings));
            }
          } catch (e) {
            this.settingsForm = JSON.parse(JSON.stringify(this.settings));
          }
          this.settingsTab = 'appearance';
          this.showSettingsModal = true;
        },

        async openSub2apiAccountsModal() {
          if (
            !this.settingsForm.sub2api_url?.trim() ||
            (!this.settingsForm.sub2api_admin_api_key?.trim() && !this.settingsForm.sub2api_admin_api_key_set)
          ) {
            return this.showToast('请先填写 Sub2API 服务地址和管理员 API Key', 'error');
          }

          this.sub2apiAccountSearch = '';
          try {
            const res = await this.adminFetch('/api/admin/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sub2api_url: this.settingsForm.sub2api_url.trim(),
                sub2api_admin_api_key: this.settingsForm.sub2api_admin_api_key || '',
                sub2api_control_api_key: this.settingsForm.sub2api_control_api_key || ''
              })
            });
            const json = await res.json();
            if (!json.success) {
              return this.showToast(json.error || '保存 Sub2API 配置失败', 'error');
            }
          } catch (err) {
            return this.showToast('保存 Sub2API 配置异常: ' + err.message, 'error');
          }
          this.showSettingsModal = false;
          this.showSub2apiAccountsModal = true;
          await this.fetchSub2apiAccounts();
        },

        async fetchSub2apiAccounts() {
          this.loadingSub2apiAccounts = true;
          this.sub2apiAccountsError = '';
          try {
            const res = await this.adminFetch('/api/admin/sub2api/accounts');
            const json = await res.json();
            if (json.success && json.data) {
              this.sub2apiAccounts = json.data.accounts || [];
            } else {
              this.sub2apiAccountsError = json.error || '获取 Sub2API 账号列表失败';
            }
          } catch (err) {
            this.sub2apiAccountsError = '网络请求异常: ' + err.message;
          } finally {
            this.loadingSub2apiAccounts = false;
          }
        },

        setAllSub2apiAccountsEnabled(val) {
          const target = val ? 1 : 0;
          this.filteredSub2apiAccounts.forEach(acc => {
            acc.enabled = target;
          });
        },

        get filteredSub2apiAccounts() {
          if (!this.sub2apiAccountSearch.trim()) return this.sub2apiAccounts;
          const q = this.sub2apiAccountSearch.toLowerCase();
          return this.sub2apiAccounts.filter(a => {
            const matchName = a.name && a.name.toLowerCase().includes(q);
            const matchPlatform = a.platform && a.platform.toLowerCase().includes(q);
            const matchGroup = a.sub2api_groups && a.sub2api_groups.toLowerCase().includes(q);
            return matchName || matchPlatform || matchGroup;
          });
        },

        async saveSub2apiAccountsImport() {
          if (this.sub2apiAccounts.length === 0) return;
          this.importingSub2apiAccounts = true;
          try {
            const res = await this.adminFetch('/api/admin/sub2api/accounts/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accounts: this.sub2apiAccounts.map(account => ({
                  sub2api_account_id: account.sub2api_account_id,
                  enabled: !!account.enabled
                }))
              })
            });
            const json = await res.json();
            if (json.success && json.data) {
              this.showToast(`成功同步 ${json.data.total} 个账号（新增 ${json.data.importedCount} 个，更新 ${json.data.updatedCount} 个）`);
              this.showSub2apiAccountsModal = false;
              await this.fetchData();
            } else {
              this.showToast(json.error || '导入失败', 'error');
            }
          } catch (err) {
            this.showToast('导入请求异常: ' + err.message, 'error');
          } finally {
            this.importingSub2apiAccounts = false;
          }
        },

        async testSub2apiConnection() {
          this.testingSub2api = true;
          this.sub2apiTestResult = null;
          try {
            const res = await this.adminFetch('/api/admin/sub2api/test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sub2api_url: this.settingsForm.sub2api_url,
                sub2api_admin_api_key: this.settingsForm.sub2api_admin_api_key || ''
              })
            });
            const json = await res.json();
            if (json.success && json.data) {
              this.sub2apiTestResult = json.data;
              this.showToast(json.data.message || '连接成功');
            } else {
              this.sub2apiTestResult = { success: false, message: json.error || '测试连接失败' };
              this.showToast(json.error || '测试连接失败', 'error');
            }
          } catch (err) {
            this.sub2apiTestResult = { success: false, message: '请求异常: ' + err.message };
            this.showToast('请求异常: ' + err.message, 'error');
          } finally {
            this.testingSub2api = false;
          }
        },

        async syncAllSub2apiGroups() {
          this.syncingSub2api = true;
          try {
            // 先保存配置
            const saveRes = await this.adminFetch('/api/admin/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.settingsForm)
            });
            const saveJson = await saveRes.json();
            if (!saveJson.success) {
              this.showToast(saveJson.error || '保存 Sub2API 配置失败', 'error');
              return;
            }

            const res = await this.adminFetch('/api/admin/sub2api/sync', { method: 'POST' });
            const json = await res.json();
            if (json.success) {
              this.showToast(json.data.message || '同步完成');
              await this.fetchData();
            } else {
              this.showToast(json.error || '同步失败', 'error');
            }
          } catch (err) {
            this.showToast('同步异常: ' + err.message, 'error');
          } finally {
            this.syncingSub2api = false;
          }
        },

        async syncSingleKeySub2api(keyId) {
          if (!keyId) return;
          this.syncingKeyId = keyId;
          try {
            const res = await this.adminFetch(`/api/admin/sub2api/sync/${keyId}`, { method: 'POST' });
            const json = await res.json();
            if (json.success) {
              const groupsStr = json.data.sub2api_groups;
              if (this.keyForm && this.keyForm.id === keyId) {
                this.keyForm.sub2api_groups = groupsStr || '';
              }
              this.showToast(groupsStr ? `已同步分组: ${groupsStr}` : 'Sub2API 中未匹配到该 Key 的分组');
              await this.fetchData();
            } else {
              this.showToast(json.error || '同步分组失败', 'error');
            }
          } catch (err) {
            this.showToast('同步异常: ' + err.message, 'error');
          } finally {
            this.syncingKeyId = null;
          }
        },

        async saveSettings() {
          try {
            const res = await this.adminFetch('/api/admin/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.settingsForm)
            });
            const json = await res.json();
            if (json.success) {
              await this.fetchSettings();
              if (this.settingsForm.font_family) {
                this.fontFamily = this.settingsForm.font_family;
                localStorage.setItem('quotaFontFamily', this.fontFamily);
              }
              if (this.settingsForm.font_weight) {
                this.fontWeight = this.settingsForm.font_weight;
                localStorage.setItem('quotaFontWeight', this.fontWeight);
              }
              this.startCountdown();
              this.showSettingsModal = false;
              this.showToast('系统设置已保存');
            } else {
              this.showToast(json.error || '保存设置失败', 'error');
            }
          } catch (err) {
            this.showToast('保存设置异常: ' + err.message, 'error');
          }
        },

        async changePassword() {
          if (this.passwordForm.new_password !== this.passwordForm.confirm_password) {
            return this.showToast('两次输入的新密码不一致', 'error');
          }
          try {
            const res = await this.adminFetch('/api/admin/password', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                current_password: this.passwordForm.current_password,
                new_password: this.passwordForm.new_password
              })
            });
            const json = await res.json();
            if (json.success) {
              this.csrfToken = json.csrfToken || this.csrfToken;
              this.passwordForm = { current_password: '', new_password: '', confirm_password: '' };
              this.showToast('密码修改成功，其它会话已全部退出');
              this.showSettingsModal = false;
            } else {
              this.showToast(json.error || '修改密码失败', 'error');
            }
          } catch (err) {
            this.showToast('修改密码异常: ' + err.message, 'error');
          }
        },

        get searchPlaceholder() {
          const vf = this.settings.visible_fields || {};
          const fields = [];
          if (vf.display_name !== false) fields.push('密钥名称');
          if (vf.team !== false) fields.push('团队');
          if (vf.owner !== false) fields.push('负责人');
          if (vf.sub2api_groups !== false) fields.push('Sub2API分组');

          if (fields.length === 0) return '搜索密钥名称 / 分组...';
          return `搜索 ${fields.join(' / ')}...`;
        },

        // Markdown 安全渲染引擎 (严格防止 XSS，支持标题、列表、粗体、斜体、代码、链接等)
        renderMarkdown(md) {
          if (!md || !md.trim()) return '';
          const escaped = String(md)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

          const lines = escaped.split(/\r?\n/);
          const out = [];
          let inList = false;
          let inQuote = false;
          let quoteBuffer = [];

          const flushQuote = () => {
            if (inQuote && quoteBuffer.length > 0) {
              out.push(`<blockquote class="announcement-quote">${quoteBuffer.join('<br>')}</blockquote>`);
              quoteBuffer = [];
              inQuote = false;
            }
          };

          const flushList = () => {
            if (inList) {
              out.push('</ul>');
              inList = false;
            }
          };

          for (const rawLine of lines) {
            const line = rawLine.trimEnd();

            // 引用块 (注意: > 已被转义为 &gt;，故匹配 (?:&gt;|>))
            const quoteMatch = line.match(/^\s*(?:&gt;|>)\s?(.*)$/);
            if (quoteMatch) {
              flushList();
              inQuote = true;
              quoteBuffer.push(this.parseInlineMarkdown(quoteMatch[1]));
              continue;
            } else {
              flushQuote();
            }

            // 无序列表
            const listMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
            if (listMatch) {
              if (!inList) {
                out.push('<ul class="list-disc list-inside space-y-1.5 my-2 text-xs">');
                inList = true;
              }
              out.push(`<li>${this.parseInlineMarkdown(listMatch[2])}</li>`);
              continue;
            } else {
              flushList();
            }

            // 标题
            if (/^###\s+/.test(line)) {
              out.push(`<h5 class="font-bold text-slate-900 dark:text-white text-xs mt-3.5 mb-1.5">${this.parseInlineMarkdown(line.replace(/^###\s+/, ''))}</h5>`);
              continue;
            }
            if (/^##\s+/.test(line)) {
              out.push(`<h4 class="font-bold text-slate-900 dark:text-white text-sm mt-4 mb-2">${this.parseInlineMarkdown(line.replace(/^##\s+/, ''))}</h4>`);
              continue;
            }
            if (/^#\s+/.test(line)) {
              out.push(`<h3 class="font-extrabold text-slate-900 dark:text-white text-base mt-4 mb-2">${this.parseInlineMarkdown(line.replace(/^#\s+/, ''))}</h3>`);
              continue;
            }

            // 空行
            if (!line.trim()) {
              out.push('<div class="h-2"></div>');
              continue;
            }

            // 普通段落
            out.push(`<p class="leading-relaxed text-xs text-slate-700 dark:text-slate-200">${this.parseInlineMarkdown(line)}</p>`);
          }

          flushList();
          flushQuote();
          return out.join('');
        },

        parseInlineMarkdown(str) {
          if (!str) return '';
          return str
            .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>')
            .replace(/__(.+?)__/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
            .replace(/_([^_]+)_/g, '<em class="italic">$1</em>')
            .replace(/~~(.+?)~~/g, '<del class="line-through opacity-70">$1</del>')
            .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 text-[11px] rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-mono border border-teal-200/50 dark:border-teal-800/50">$1</code>')
            .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-teal-600 dark:text-teal-400 underline decoration-teal-400/60 hover:text-teal-700 dark:hover:text-teal-300 font-medium inline-flex items-center gap-0.5">$1<svg class="w-2.5 h-2.5 inline-block opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>');
        },

        getAnnouncementHash(str) {
          if (!str) return '';
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
          }
          return String(hash);
        },

        get shouldShowAnnouncement() {
          const raw = this.settings.announcement;
          if (!raw || !raw.trim()) return false;
          if (this.announcementDismissed) {
            const currentHash = this.getAnnouncementHash(raw.trim());
            const dismissedHash = sessionStorage.getItem('qd_dismissed_announcement');
            if (dismissedHash === currentHash) return false;
          }
          return true;
        },

        dismissAnnouncement() {
          const raw = this.settings.announcement;
          if (raw && raw.trim()) {
            sessionStorage.setItem('qd_dismissed_announcement', this.getAnnouncementHash(raw.trim()));
          }
          this.announcementDismissed = true;
        },

        get isAnnouncementExpandable() {
          const raw = this.settings.announcement;
          if (!raw || !raw.trim()) return false;
          const lines = raw.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
          return lines.length > 3 || raw.trim().length > 130;
        },

        get filteredKeys() {
          let list = this.keys;
          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase();
            const vf = this.settings.visible_fields || {};
            list = this.keys.filter(k => {
              const matchName = (vf.display_name !== false) && k.display_name && k.display_name.toLowerCase().includes(q);
              const matchTeam = (vf.team !== false) && k.team && k.team.toLowerCase().includes(q);
              const matchOwner = (vf.owner !== false) && k.owner && k.owner.toLowerCase().includes(q);
              const matchGroup = (vf.sub2api_groups !== false) && k.sub2api_groups && k.sub2api_groups.toLowerCase().includes(q);
              return matchName || matchTeam || matchOwner || matchGroup;
            });
          }
          // 排序
          if (this.sortBy === 'default') return list;
          const field = this.sortBy;
          return [...list].sort((a, b) => {
            const va = a.usage?.[field];
            const vb = b.usage?.[field];
            // null 值排到最后
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            return vb - va;
          });
        },

        async login() {
          try {
            const res = await fetch('/api/admin/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.loginForm)
            });
            const json = await res.json();
            if (json.success) {
              this.csrfToken = json.csrfToken || this.csrfToken;
              this.isAdmin = true;
              this.showLoginModal = false;
              this.loginForm = { username: '', password: '' };
              this.fetchData();
            } else {
              this.showToast(json.error || '登录失败', 'error');
            }
          } catch (err) {
            this.showToast('登录异常: ' + err.message, 'error');
          }
        },

        async logout() {
          try {
            await this.adminFetch('/api/admin/logout', { method: 'POST' });
          } catch (_) {
            // Cookie cleanup is best-effort.
          } finally {
            this.csrfToken = null;
            this.isAdmin = false;
            await this.fetchData();
          }
        },

        openAddModal() {
          this.keyForm = {
            id: null, provider: 'zhipu', display_name: '', api_key: '',
            base_url: '', access_key_id: '', secret_access_key: '',
            organization_id: '', project_id: '', team: '', owner: '', member_count: 0,
            sub2api_groups: '', public_schedule_control: false,
            public_recover_control: false, admin_locked: false
          };
          this.showKeyModal = true;
        },

        openEditModal(item) {
          this.keyForm = { ...item, api_key: '', api_key_masked: '', sub2api_groups: item.sub2api_groups || '' };
          // 从管理员接口获取带掩码的 API Key
          this.adminFetch('/api/admin/keys').then(r => r.json()).then(json => {
            if (json.success) {
              const found = json.data.find(k => k.id === item.id);
              if (found) {
                this.keyForm.api_key_masked = found.api_key_masked;
              }
            }
          }).catch(() => {});
          this.showKeyModal = true;
        },

        async saveKey() {
          const isEdit = !!this.keyForm.id;
          const url = isEdit ? `/api/admin/keys/${this.keyForm.id}` : '/api/admin/keys';
          const method = isEdit ? 'PUT' : 'POST';

          try {
            const res = await this.adminFetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.keyForm)
            });
            const json = await res.json();
            if (json.success) {
              this.showKeyModal = false;
              this.fetchData();
            } else {
              this.showToast(json.error || '保存失败', 'error');
            }
          } catch (err) {
            this.showToast('请求异常: ' + err.message, 'error');
          }
        },

        deleteKey(id) {
          this.deleteConfirmId = id;
          this.deleteConfirmVisible = true;
        },

        async confirmDelete() {
          const id = this.deleteConfirmId;
          this.deleteConfirmVisible = false;
          this.deleteConfirmId = null;
          try {
            const res = await this.adminFetch(`/api/admin/keys/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
              this.fetchData();
            } else {
              this.showToast(json.error || '删除失败', 'error');
            }
          } catch (err) {
            this.showToast('删除异常: ' + err.message, 'error');
          }
        },

        // Drag & Drop Handlers
        handleDragStart(e, index) {
          if (!this.isAdmin || this.sortBy !== 'default' || this.searchQuery.trim()) return;

          const interactiveEl = e.target.closest('button, a, [role="switch"]');
          if (interactiveEl) {
            e.preventDefault();
            interactiveEl.click();
            return;
          }

          this.draggedIndex = index;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', index);
        },

        handleDragOver(e, index) {
          if (!this.isAdmin || this.sortBy !== 'default' || this.searchQuery.trim()) return;
          e.preventDefault();
          this.dragOverIndex = index;
        },

        handleDragLeave(e, index) {
          if (this.dragOverIndex === index) {
            this.dragOverIndex = null;
          }
        },

        async handleDrop(e, targetIndex) {
          if (!this.isAdmin || this.sortBy !== 'default' || this.searchQuery.trim()) return;
          e.preventDefault();
          if (this.draggedIndex === null || this.draggedIndex === targetIndex) {
            this.handleDragEnd();
            return;
          }

          // Reorder keys locally
          const movedItem = this.keys.splice(this.draggedIndex, 1)[0];
          this.keys.splice(targetIndex, 0, movedItem);

          this.handleDragEnd();

          // Persist order to backend
          const order = this.keys.map(k => k.id);
          try {
            const res = await this.adminFetch('/api/admin/keys/reorder', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order })
            });
            const json = await res.json();
            if (!json.success) {
              this.showToast(json.error || '保存排序失败', 'error');
              this.fetchData();
            }
          } catch (err) {
            console.error('Reorder error:', err);
            this.fetchData();
          }
        },

        handleDragEnd() {
          this.draggedIndex = null;
          this.dragOverIndex = null;
        },

        // Helper Formatters
        splitGroups(str) {
          if (!str) return [];
          return String(str).split(/[,，]/).map(s => s.trim()).filter(Boolean);
        },

        getProviderLogo(provider) {
          switch (provider) {
            case 'zhipu':
            case 'zhipu_team':
              return '/icons/zhipu.svg';
            case 'minimax':
              return '/icons/minimax.svg';
            case 'volcengine':
              return '/icons/huoshan.png';
            case 'kimi':
              return '/icons/kimi.svg';
            case 'deepseek':
              return '/icons/deepseek.svg';
            case 'openai':
              return '/icons/openai.svg';
            case 'claude':
            case 'anthropic':
              return '/icons/claude.svg';
            case 'gemini':
            case 'google':
              return '/icons/gemini.svg';
            case 'qwen':
              return '/icons/qwen.svg';
            case 'siliconflow':
              return '/icons/siliconflow.svg';
            case 'doubao':
              return '/icons/doubao.svg';
            case 'baidu':
            case 'wenxin':
              return '/icons/baidu.svg';
            case 'stepfun':
              return '/icons/stepfun.svg';
            case 'openrouter':
              return '/icons/openrouter.svg';
            case 'novita':
              return '/icons/novita.svg';
            case 'zenmux':
              return '/icons/zenmux.svg';
            default:
              return `/icons/${provider}.svg`;
          }
        },

        getProviderBadgeClass(provider) {
          switch (provider) {
            case 'zhipu':
            case 'zhipu_team':
              return 'bg-blue-600';
            case 'minimax':
              return 'bg-rose-500';
            case 'volcengine':
              return 'bg-amber-500';
            case 'kimi':
              return 'bg-indigo-600';
            default:
              return 'bg-slate-600';
          }
        },

        getProviderBadgeText(provider) {
          switch (provider) {
            case 'zhipu': return '智谱';
            case 'zhipu_team': return '智谱团队';
            case 'minimax': return 'MiniMax';
            case 'volcengine': return '火山方舟';
            case 'kimi': return 'Kimi';
            case 'zenmux': return 'ZenMux';
            case 'deepseek': return 'DeepSeek';
            case 'stepfun': return '阶跃星辰';
            case 'siliconflow': return '硅基流动';
            case 'openrouter': return 'OpenRouter';
            case 'novita': return 'Novita';
            default: return '大模型';
          }
        },

        getUsageColorClass(percent) {
          if (percent === null || percent === undefined) return 'text-slate-400 bg-slate-50';
          if (percent >= 80) return 'text-rose-600 bg-rose-50';
          if (percent >= 50) return 'text-amber-600 bg-amber-50';
          return 'text-emerald-600 bg-emerald-50';
        },

        formatPercent(val) {
          if (val === null || val === undefined) return '0%';
          return Math.round(val) + '%';
        },

        formatTokenMillions(tokens) {
          const value = Number(tokens);
          if (!Number.isFinite(value)) return '—';
          const millions = Math.max(0, value) / 1000000;
          return `${millions.toFixed(millions >= 100 ? 1 : 2)}M`;
        },

        formatInteger(value) {
          const number = Number(value);
          if (!Number.isFinite(number)) return '—';
          return new Intl.NumberFormat('zh-CN').format(Math.max(0, Math.trunc(number)));
        },

        isBalanceProvider(provider) {
          return ['deepseek', 'stepfun', 'siliconflow', 'openrouter', 'novita'].includes(provider);
        },

        formatBalanceValue(val, unit) {
          if (val == null) return '';
          const u = unit || '';
          return val.toFixed(2) + ' ' + u;
        },

        getProviderLabel(provider) {
          const item = this.PROVIDER_LIST.find(p => p.value === provider);
          return item ? item.label : '请选择';
        },

        formatResetTime(isoStr) {
          if (!isoStr) return '';
          const target = new Date(isoStr);
          if (Number.isNaN(target.getTime())) return '';
          const now = new Date();
          const diffMs = target - now;
          if (diffMs <= 0) return '即将重置';

          const diffMins = Math.floor(diffMs / (1000 * 60));
          const hours = Math.floor(diffMins / 60);
          const mins = diffMins % 60;
          const days = Math.floor(hours / 24);

          if (days > 0) return `⏱ ${days}天${hours % 24}小时后重置`;
          if (hours > 0) return `⏱ ${hours}小时${mins}分后重置`;
          return `⏱ ${mins}分钟后重置`;
        },

        formatResetDateTime(isoStr) {
          if (!isoStr) return '';
          const target = new Date(isoStr);
          if (Number.isNaN(target.getTime())) return '';

          const now = new Date();
          const pad = value => String(value).padStart(2, '0');
          const year = target.getFullYear() === now.getFullYear() ? '' : `${target.getFullYear()}年`;
          return `${year}${target.getMonth() + 1}月${target.getDate()}日 ${pad(target.getHours())}:${pad(target.getMinutes())}`;
        },

        formatRelativeTime(isoStr) {
          if (!isoStr) return '未知时间';
          const date = new Date(isoStr);
          const now = new Date();
          const diffSec = Math.floor((now - date) / 1000);

          if (diffSec < 60) return '刚刚';
          if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
          if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;
          return `${Math.floor(diffSec / 86400)}天前`;
        }
      }
    }
