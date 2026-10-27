/**
 * dsh-prompt-gallery — Client half.
 *
 * Renders three surfaces inside the Harness Web UI:
 *   1. `conversation.input.left` — two compact composer buttons: prompt
 *      library and AI prompt optimization.
 *   2. `shell.overlay` — the prompt library panel, its create/edit dialogs,
 *      category manager, and the toast viewport.
 *   3. DOM capture buttons appended to each durable *user* message action row
 *      (`[data-conversation-scroll] [data-clock="start"]`), so one click saves
 *      that message to the library.
 *
 * The Host half serves `/prompt-gallery/api/*`; this module talks to it with
 * same-origin `fetch`.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-gallery',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'prompt-gallery';
    /** Plugin Web API prefix (served by the Host half). */
    const API = '/prompt-gallery/api';
    /** Protected category id mirrored from the Host half. */
    const UNCATEGORIZED_ID = 'uncategorized';
    /** Marker attribute on injected user-message capture buttons. */
    const CAPTURE_MARK = 'data-pg-capture';
    /** Inline SVG for the injected capture button (trusted static markup). */
    const CAPTURE_ICON_SVG =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4.5L5 21V4.5A1.5 1.5 0 0 1 6.5 3Z"/><path d="M12 8v5M9.5 10.5h5"/></svg>';

    // ---------------------------------------------------------------------
    // Dictionaries
    // ---------------------------------------------------------------------

    const zh = {
      'toolbar.library': '提示词库',
      'toolbar.optimize': '优化提示词',
      'toolbar.optimizeBusy': '优化中…',
      'toast.emptyDraft': '输入框为空，无法优化',
      'toast.optimized': '已用 AI 优化提示词，可撤销',
      'toast.optimizeFailed': '优化失败',
      'toast.emptyOptimized': '模型返回了空内容',
      'toast.applyFailed': '无法写回输入框',
      'toast.inserted': '已插入输入框',
      'toast.insertFailed': '插入失败：输入框不可用',
      'toast.saved': '已保存',
      'toast.deleted': '已删除',
      'toast.categoryDeleted': '分类已删除，提示词已移入未分类',
      'toast.savedToLibrary': '已收藏到提示词库',
      'toast.alreadySaved': '这条提示词已在词库中',
      'toast.captureEmpty': '没有可收藏的文本',
      'toast.loadFailed': '加载失败',
      'toast.saveFailed': '保存失败',
      'toast.deleteFailed': '删除失败',
      'toast.categorySaveFailed': '分类保存失败',
      'action.close': '关闭',
      'action.cancel': '取消',
      'action.save': '保存',
      'action.undo': '撤销',
      'action.editDetails': '编辑详情',
      'action.retry': '重试',
      'action.insert': '插入',
      'action.edit': '编辑',
      'action.delete': '删除',
      'action.confirmDelete': '确认删除',
      'action.newPrompt': '新建提示词',
      'action.manageCategories': '管理分类',
      'action.newCategory': '新建分类',
      'action.add': '添加',
      'action.rename': '重命名',
      'panel.title': '提示词库',
      'panel.all': '全部',
      'panel.uncategorized': '未分类',
      'panel.searchPlaceholder': '搜索标题、描述、正文或标签…',
      'panel.empty': '还没有提示词，点「新建提示词」添加第一条',
      'panel.emptyFiltered': '没有匹配的提示词',
      'panel.loading': '加载中…',
      'panel.count': '{n} 条',
      'panel.usedTimes': '已用 {n} 次',
      'panel.updated': '更新于 {when}',
      'panel.originChat': '来自聊天',
      'panel.noDescription': '暂无作用描述',
      'seed.writing': '写作',
      'seed.coding': '编程',
      'seed.translation': '翻译',
      'seed.analysis': '分析',
      'seed.office': '办公',
      'panel.notFound': '提示词不存在或已删除',
      'editor.createTitle': '新建提示词',
      'editor.editTitle': '编辑提示词',
      'editor.title': '标题',
      'editor.titlePlaceholder': '给这条提示词起个名字',
      'editor.category': '分类',
      'editor.description': '作用描述',
      'editor.descriptionPlaceholder': '这条提示词用来做什么、适合什么场景（会显示在词库列表中）',
      'editor.body': '正文',
      'editor.bodyPlaceholder': '输入提示词正文，可用 {{变量}} 作为占位符',
      'editor.tags': '标签',
      'editor.tagsPlaceholder': '用逗号分隔，例如：周报, 总结',
      'editor.bodyRequired': '正文不能为空',
      'category.manageTitle': '管理分类',
      'category.namePlaceholder': '分类名称',
      'category.newPlaceholder': '输入新分类名称',
      'category.deleteHint': '删除分类后，其下的提示词会移入「未分类」',
      'category.protected': '「未分类」不可删除',
      'category.empty': '还没有自定义分类',
      'category.renamePrompt': '输入新的分类名称',
      'capture.button': '收藏这条提示词到词库',
      'time.justNow': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'search.clear': '清除搜索',
    };

    const en = {
      'toolbar.library': 'Prompt library',
      'toolbar.optimize': 'Optimize prompt',
      'toolbar.optimizeBusy': 'Optimizing…',
      'toast.emptyDraft': 'The composer is empty — nothing to optimize',
      'toast.optimized': 'Prompt optimized — undo is available',
      'toast.optimizeFailed': 'Optimization failed',
      'toast.emptyOptimized': 'The model returned an empty result',
      'toast.applyFailed': 'Could not write the result into the composer',
      'toast.inserted': 'Inserted into the composer',
      'toast.insertFailed': 'Insert failed: the composer is unavailable',
      'toast.saved': 'Saved',
      'toast.deleted': 'Deleted',
      'toast.categoryDeleted': 'Category deleted; its prompts moved to Uncategorized',
      'toast.savedToLibrary': 'Saved to your prompt library',
      'toast.alreadySaved': 'This prompt is already in your library',
      'toast.captureEmpty': 'Nothing to save',
      'toast.loadFailed': 'Failed to load',
      'toast.saveFailed': 'Save failed',
      'toast.deleteFailed': 'Delete failed',
      'toast.categorySaveFailed': 'Saving the category failed',
      'action.close': 'Close',
      'action.cancel': 'Cancel',
      'action.save': 'Save',
      'action.undo': 'Undo',
      'action.editDetails': 'Edit details',
      'action.retry': 'Retry',
      'action.insert': 'Insert',
      'action.edit': 'Edit',
      'action.delete': 'Delete',
      'action.confirmDelete': 'Confirm delete',
      'action.newPrompt': 'New prompt',
      'action.manageCategories': 'Manage categories',
      'action.newCategory': 'New category',
      'action.add': 'Add',
      'action.rename': 'Rename',
      'panel.title': 'Prompt Gallery',
      'panel.all': 'All',
      'panel.uncategorized': 'Uncategorized',
      'panel.searchPlaceholder': 'Search title, description, body or tags…',
      'panel.empty': 'No prompts yet — create your first one',
      'panel.emptyFiltered': 'No matching prompts',
      'panel.loading': 'Loading…',
      'panel.count': '{n} prompts',
      'panel.usedTimes': 'Used {n}×',
      'panel.updated': 'Updated {when}',
      'panel.originChat': 'From chat',
      'panel.noDescription': 'No description yet',
      'seed.writing': 'Writing',
      'seed.coding': 'Coding',
      'seed.translation': 'Translation',
      'seed.analysis': 'Analysis',
      'seed.office': 'Productivity',
      'panel.notFound': 'The prompt no longer exists',
      'editor.createTitle': 'New prompt',
      'editor.editTitle': 'Edit prompt',
      'editor.title': 'Title',
      'editor.titlePlaceholder': 'Name this prompt',
      'editor.category': 'Category',
      'editor.description': 'What it does',
      'editor.descriptionPlaceholder': 'When should this prompt be used? This shows up in the library list.',
      'editor.body': 'Prompt body',
      'editor.bodyPlaceholder': 'The prompt text; {{variables}} work as placeholders',
      'editor.tags': 'Tags',
      'editor.tagsPlaceholder': 'Comma-separated, e.g. weekly report, summary',
      'editor.bodyRequired': 'The prompt body is required',
      'category.manageTitle': 'Manage categories',
      'category.namePlaceholder': 'Category name',
      'category.newPlaceholder': 'New category name',
      'category.deleteHint': 'Deleting a category moves its prompts to Uncategorized',
      'category.protected': 'Uncategorized cannot be removed',
      'category.empty': 'No custom categories yet',
      'category.renamePrompt': 'Enter the new category name',
      'capture.button': 'Save this prompt to the library',
      'time.justNow': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'search.clear': 'Clear search',
    };

    // ---------------------------------------------------------------------
    // i18n
    // ---------------------------------------------------------------------

    /** Locale dictionaries registered on the Host half of the locale service. */
    const dictionaries = { zh, en };
    /** Active translator, replaced whenever the UI locale changes. */
    let translate = (key, params) => interpolate(zh[key] ?? en[key] ?? key, params);
    /** Registered locale-change listeners (React components and injector). */
    const localeListeners = new Set();

    /** Interpolate `{name}` placeholders in one dictionary string. */
    function interpolate(template, params) {
      if (typeof template !== 'string') return String(template);
      if (params === undefined || params === null) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
      );
    }

    /** Return the current active locale id (`zh` or `en`). */
    function currentLocale() {
      try {
        const snapshot = localeContext !== null ? localeContext.getLocale() : null;
        return snapshot !== null && typeof snapshot.active === 'string' ? snapshot.active : 'zh';
      } catch (error) {
        return 'zh';
      }
    }

    /** Re-render a component whenever the UI locale changes. */
    function useT() {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        const listener = () => bump((value) => value + 1);
        localeListeners.add(listener);
        return () => {
          localeListeners.delete(listener);
        };
      }, []);
      return translate;
    }

    /** Locale service captured at apply time (needed by capture buttons). */
    let localeContext = null;

    // ---------------------------------------------------------------------
    // Global UI store
    // ---------------------------------------------------------------------

    /** Global floating UI state shared by the composer toolbar and the overlay. */
    const ui = {
      dialog: null,
      toasts: [],
      revision: 0,
      listeners: new Set(),
      token: 0,
      toastToken: 0,
    };
    /** Pending toast dismissal timers keyed by toast id. */
    const toastTimers = new Map();

    /** Publish a UI store change. */
    function emit() {
      ui.revision += 1;
      for (const listener of Array.from(ui.listeners)) {
        try {
          listener();
        } catch (error) {
          /* a broken listener must not break the store */
        }
      }
    }

    /** Subscribe one component to the global UI store. */
    function useUi() {
      React.useSyncExternalStore(
        (listener) => {
          ui.listeners.add(listener);
          return () => ui.listeners.delete(listener);
        },
        () => ui.revision,
        () => ui.revision,
      );
      return ui;
    }

    /** Open the prompt library dialog. */
    function openLibrary(options) {
      ui.token += 1;
      ui.dialog = {
        kind: 'library',
        token: ui.token,
        editPromptId: options && options.editPromptId ? options.editPromptId : null,
        categoryId: options && options.categoryId ? options.categoryId : null,
      };
      emit();
    }

    /** Close the prompt library dialog. */
    function closeLibrary() {
      if (ui.dialog === null) return;
      ui.dialog = null;
      emit();
    }

    /** Show one transient toast; `action` renders a trailing text button. */
    function showToast(text, options) {
      const config = options || {};
      ui.toastToken += 1;
      const toast = {
        id: `toast-${ui.toastToken}`,
        text,
        tone: config.tone || 'info',
        action: config.action || null,
      };
      ui.toasts = [...ui.toasts, toast];
      emit();
      const duration = Number.isFinite(config.duration) ? config.duration : 4000;
      if (duration > 0) {
        toastTimers.set(
          toast.id,
          setTimeout(() => {
            dismissToast(toast.id);
          }, duration),
        );
      }
      return toast.id;
    }

    /** Dismiss one toast by id. */
    function dismissToast(id) {
      const timer = toastTimers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        toastTimers.delete(id);
      }
      if (!ui.toasts.some((toast) => toast.id === id)) return;
      ui.toasts = ui.toasts.filter((toast) => toast.id !== id);
      emit();
    }

    // ---------------------------------------------------------------------
    // Client diagnostics (mirrored to the Host /presence route)
    // ---------------------------------------------------------------------

    /** What this Client half successfully mounted; surfaced through /health. */
    const diagnostics = {
      toolbar: false,
      overlay: false,
      captureButtons: 0,
      userRows: 0,
      locale: 'zh',
    };

    /** Push the latest diagnostics snapshot to the Host (best effort). */
    function reportPresence() {
      diagnostics.locale = currentLocale();
      try {
        fetch(`${API}/presence`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(diagnostics),
          credentials: 'same-origin',
        }).catch(() => {});
      } catch (error) {
        /* diagnostics never break the UI */
      }
    }

    /** Report once immediately, then on a slow heartbeat. */
    function startPresenceReporting() {
      reportPresence();
      const timer = setInterval(reportPresence, 15000);
      return () => {
        clearInterval(timer);
      };
    }

    // ---------------------------------------------------------------------
    // Composer bridge
    // ---------------------------------------------------------------------

    /** Actions published by the mounted composer toolbar component. */
    const composer = {
      insert: null,
      replace: null,
      sessionId: null,
    };

    // ---------------------------------------------------------------------
    // Web API
    // ---------------------------------------------------------------------

    /** One JSON request against the plugin Host API. */
    async function request(path, options) {
      const config = options || {};
      let response;
      try {
        response = await fetch(`${API}${path}`, {
          method: config.method || 'GET',
          headers:
            config.body === undefined ? undefined : { 'content-type': 'application/json' },
          body: config.body === undefined ? undefined : JSON.stringify(config.body),
          credentials: 'same-origin',
        });
      } catch (error) {
        throw new Error(`${translate('toast.loadFailed')}: ${error instanceof Error ? error.message : String(error)}`);
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (!response.ok || (payload !== null && payload.ok === false)) {
        const message =
          payload !== null && payload.error && typeof payload.error.message === 'string'
            ? payload.error.message
            : `HTTP ${response.status}`;
        throw new Error(message);
      }
      return payload === null ? {} : payload;
    }

    const api = {
      state: () => request(`/state?locale=${encodeURIComponent(currentLocale())}`),
      createPrompt: (payload) => request('/prompts', { method: 'POST', body: payload }),
      updatePrompt: (id, payload) =>
        request(`/prompts/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
      deletePrompt: (id) => request(`/prompts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      markUsed: (id) =>
        request(`/prompts/${encodeURIComponent(id)}/use`, { method: 'POST', body: {} }),
      createCategory: (payload) => request('/categories', { method: 'POST', body: payload }),
      updateCategory: (id, payload) =>
        request(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
      deleteCategory: (id) =>
        request(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      optimize: (payload) => request('/optimize', { method: 'POST', body: payload }),
    };

    // ---------------------------------------------------------------------
    // Icons
    // ---------------------------------------------------------------------

    /** Build one stroke icon element. */
    function icon(children, size) {
      return h(
        'svg',
        {
          width: size || 16,
          height: size || 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        ...(Array.isArray(children) ? children : [children]),
      );
    }

    const IconBookmark = () =>
      icon([
        h('path', { key: 'a', d: 'M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4.5L5 21V4.5A1.5 1.5 0 0 1 6.5 3Z' }),
      ]);
    const IconSparkle = () =>
      icon([
        h('path', { key: 'a', d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z' }),
        h('path', { key: 'b', d: 'M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z' }),
      ]);
    const IconSpinner = () =>
      h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          'aria-hidden': 'true',
          className: 'pg-spin',
        },
        h('path', { d: 'M21 12a9 9 0 1 1-6.2-8.56' }),
      );
    const IconClose = (props) =>
      icon(
        [h('path', { key: 'a', d: 'M6 6l12 12M18 6L6 18' })],
        props !== null && props !== undefined && typeof props.size === 'number' ? props.size : 16,
      );
    const IconPlus = () =>
      icon([h('path', { key: 'a', d: 'M12 5v14M5 12h14' })]);
    const IconSearch = () =>
      icon([
        h('circle', { key: 'a', cx: 11, cy: 11, r: 6.5 }),
        h('path', { key: 'b', d: 'M16 16l4.5 4.5' }),
      ]);
    const IconTrash = () =>
      icon([
        h('path', { key: 'a', d: 'M4 7h16M9 7V4.5h6V7M6.5 7l.8 13h9.4l.8-13' }),
        h('path', { key: 'b', d: 'M10 11v5M14 11v5' }),
      ]);
    const IconPencil = () =>
      icon([
        h('path', { key: 'a', d: 'M4 20l4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z' }),
        h('path', { key: 'b', d: 'M13.5 5.5l3 3' }),
      ]);
    const IconInsert = () =>
      icon([
        h('path', { key: 'a', d: 'M5 12h11' }),
        h('path', { key: 'b', d: 'M12 5l7 7-7 7' }),
      ]);
    const IconTag = () =>
      icon([
        h('path', { key: 'a', d: 'M4 5h7l9 9-6 6-9-9V5Z' }),
        h('circle', { key: 'b', cx: 9, cy: 9.5, r: 1.2 }),
      ]);

    // ---------------------------------------------------------------------
    // Styles
    // ---------------------------------------------------------------------

    const STYLES = `
.pg-toolbar{display:inline-flex;align-items:center;gap:2px}
.pg-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;flex:0 0 auto}
.pg-icon-btn:hover:not(:disabled){background:rgba(128,134,148,.16);color:var(--dsw-alias-label-primary,#111)}
.pg-icon-btn:disabled{opacity:.55;cursor:default}
.pg-spin{animation:pg-spin 1s linear infinite}
@keyframes pg-spin{to{transform:rotate(360deg)}}
.pg-capture-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#8a8f98);cursor:pointer;flex:0 0 auto}
.pg-capture-btn:hover{background:rgba(128,134,148,.16);color:var(--dsw-alias-label-primary,#111)}
.pg-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,17,21,.38)}
.pg-backdrop.pg-nested{z-index:2147483050}
.pg-modal{display:flex;flex-direction:column;width:min(780px,94vw);max-height:min(660px,82vh);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.28);overflow:hidden;font-family:inherit}
.pg-modal.pg-modal-sm{width:min(460px,92vw);max-height:min(560px,80vh)}
.pg-modal-header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.pg-modal-title{display:flex;align-items:center;gap:8px;margin:0;font-size:15px;font-weight:600}
.pg-modal-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);font-weight:400}
.pg-grow{flex:1 1 auto}
.pg-modal-body{display:flex;flex:1 1 auto;min-height:0}
.pg-rail{display:flex;flex-direction:column;gap:2px;width:172px;flex:0 0 auto;padding:10px 8px;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#f6f7f9))}
.pg-rail-item{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#111);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.pg-rail-item:hover{background:rgba(128,134,148,.14)}
.pg-rail-item.pg-active{background:rgba(128,134,148,.2);font-weight:600}
.pg-rail-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-rail-count{flex:0 0 auto;font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}
.pg-rail-divider{height:1px;margin:6px 8px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.pg-rail-add{display:flex;align-items:center;gap:6px;width:100%;padding:7px 10px;border:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.pg-rail-add:hover{color:var(--dsw-alias-label-primary,#111);background:rgba(128,134,148,.1)}
.pg-main{display:flex;flex-direction:column;flex:1 1 auto;min-width:0}
.pg-search{display:flex;align-items:center;gap:8px;margin:12px 16px 8px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:10px;background:var(--dsw-alias-bg-base,#f6f7f9);color:var(--dsw-alias-label-secondary,#6b7280)}
.pg-search input{flex:1 1 auto;min-width:0;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary,#111);font:inherit;font-size:13px}
.pg-search-clear{display:inline-flex;align-items:center;justify-content:center;padding:2px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
.pg-search-clear:hover{background:rgba(128,134,148,.16)}
.pg-list{flex:1 1 auto;overflow:auto;padding:0 16px 14px}
.pg-card{padding:12px;margin-bottom:10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
.pg-card:hover{box-shadow:0 2px 12px rgba(0,0,0,.09)}
.pg-card-head{display:flex;align-items:flex-start;gap:8px}
.pg-card-title{flex:1 1 auto;margin:0;font-size:14px;font-weight:600;word-break:break-word}
.pg-badge{flex:0 0 auto;padding:1px 7px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:999px;font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap}
.pg-card-desc{margin:6px 0 0;font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#6b7280);word-break:break-word;white-space:pre-wrap}
.pg-card-body{display:-webkit-box;margin:8px 0 0;font-size:12.5px;line-height:1.55;color:var(--dsw-alias-label-primary,#111);opacity:.82;word-break:break-word;white-space:pre-wrap;overflow:hidden;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.pg-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.pg-tag{padding:1px 7px;border-radius:999px;background:rgba(128,134,148,.16);font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}
.pg-card-foot{display:flex;align-items:center;gap:6px;margin-top:10px}
.pg-card-meta{flex:1 1 auto;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280)}
.pg-modal-footer{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.pg-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#111);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}
.pg-btn:hover:not(:disabled){background:rgba(128,134,148,.16)}
.pg-btn:disabled{opacity:.55;cursor:default}
.pg-btn-primary{background:var(--dsw-alias-brand-primary,#2563eb);color:#fff}
.pg-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary,#2563eb);filter:brightness(1.06)}
.pg-btn-danger{color:var(--dsw-alias-state-error-primary,#dc2626)}
.pg-btn-danger.pg-armed{background:var(--dsw-alias-state-error-primary,#dc2626);color:#fff}
.pg-btn-ghost{color:var(--dsw-alias-label-secondary,#6b7280)}
.pg-btn-ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary,#111)}
.pg-empty{padding:44px 12px;text-align:center;font-size:13px;color:var(--dsw-alias-label-secondary,#6b7280)}
.pg-error{margin:8px 16px;padding:8px 10px;border-radius:8px;background:rgba(220,38,38,.1);color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12.5px}
.pg-form{display:flex;flex-direction:column;gap:12px;padding:16px;overflow:auto}
.pg-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.pg-form-row{display:flex;gap:12px}
.pg-form-row>.pg-field{flex:1 1 0}
.pg-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b7280)}
.pg-input,.pg-textarea,.pg-select{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:9px;background:var(--dsw-alias-bg-base,#f6f7f9);color:var(--dsw-alias-label-primary,#111);font:inherit;font-size:13px;outline:none}
.pg-input:focus,.pg-textarea:focus,.pg-select:focus{border-color:var(--dsw-alias-brand-primary,#2563eb)}
.pg-textarea{min-height:150px;resize:vertical;line-height:1.55}
.pg-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280)}
.pg-cat-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}
.pg-cat-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.pg-cat-new{display:flex;gap:8px;padding:10px 16px 4px}
.pg-toast-viewport{position:fixed;left:50%;bottom:28px;z-index:2147483100;display:flex;flex-direction:column;align-items:center;gap:8px;transform:translateX(-50%);pointer-events:none}
.pg-toast{display:flex;align-items:center;gap:10px;max-width:min(580px,90vw);padding:9px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:10px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#111);box-shadow:0 8px 28px rgba(0,0,0,.22);font-size:13px;pointer-events:auto}
.pg-toast-error{border-color:var(--dsw-alias-state-error-primary,#dc2626)}
.pg-toast-success{border-color:var(--dsw-alias-state-success-primary,#16a34a)}
.pg-toast-warn{border-color:var(--dsw-alias-state-warn-primary,#d97706)}
.pg-toast-text{flex:1 1 auto;word-break:break-word}
.pg-toast-action{padding:2px 4px;border:0;background:transparent;color:var(--dsw-alias-brand-primary,#2563eb);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.pg-toast-close{display:inline-flex;align-items:center;justify-content:center;padding:2px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer}
.pg-toast-close:hover{background:rgba(128,134,148,.16)}
`;

    /** Inject the plugin stylesheet once; disposed with the plugin fiber. */
    function injectStyles() {
      const existing = document.querySelector('style[data-dsh-prompt-gallery]');
      if (existing !== null) existing.remove();
      const element = document.createElement('style');
      element.setAttribute('data-dsh-prompt-gallery', '');
      element.textContent = STYLES;
      document.head.appendChild(element);
      return () => {
        element.remove();
      };
    }

    // ---------------------------------------------------------------------
    // Small shared helpers
    // ---------------------------------------------------------------------

    /** Built-in seed category ids whose labels follow the UI locale. */
    const SEED_CATEGORY_KEYS = {
      writing: 'seed.writing',
      coding: 'seed.coding',
      translation: 'seed.translation',
      analysis: 'seed.analysis',
      office: 'seed.office',
    };

    /** Display label for one category, localized for untouched seed categories. */
    function categoryLabel(category, t) {
      if (category === null || category === undefined) return '';
      if (category.builtin === 'seed') {
        const key = SEED_CATEGORY_KEYS[category.id];
        if (typeof key === 'string') return t(key);
      }
      if (category.id === UNCATEGORIZED_ID) return t('panel.uncategorized');
      return category.name;
    }

    /** Locale-aware relative timestamp. */
    function formatWhen(timestamp, t) {
      if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
      const delta = Date.now() - timestamp;
      if (delta < 60_000) return t('time.justNow');
      if (delta < 3_600_000) return t('time.minutes', { n: Math.floor(delta / 60_000) });
      if (delta < 86_400_000) return t('time.hours', { n: Math.floor(delta / 3_600_000) });
      try {
        return new Date(timestamp).toLocaleDateString(currentLocale() === 'en' ? 'en-US' : 'zh-CN');
      } catch (error) {
        return new Date(timestamp).toISOString().slice(0, 10);
      }
    }

    /** Derive a short title from a prompt body. */
    function deriveTitle(text) {
      const source = typeof text === 'string' ? text : '';
      const firstLine =
        source
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line !== '') || source.trim();
      const cleaned = firstLine.replace(/^[#>*+\-\s]+/, '').replace(/[`*_]/g, '').trim();
      const value = cleaned === '' ? source.trim() : cleaned;
      return value.length > 40 ? `${value.slice(0, 40)}…` : value;
    }

    /** Parse the comma/whitespace separated tag input into a tag array. */
    function parseTags(value) {
      return String(value || '')
        .split(/[,，、]/)
        .map((tag) => tag.trim())
        .filter((tag, index, list) => tag !== '' && list.indexOf(tag) === index)
        .slice(0, 20);
    }

    /** True when a value is a non-empty trimmed string. */
    function hasText(value) {
      return typeof value === 'string' && value.trim() !== '';
    }

    // ---------------------------------------------------------------------
    // Composer toolbar
    // ---------------------------------------------------------------------

    /** Two compact controls at the left of the composer tool row. */
    function ComposerToolbar(props) {
      const t = useT();
      const inputActions = props.inputActions;
      const draft = props.useInput((state) => (state && typeof state.draft === 'string' ? state.draft : ''));
      const draftRef = React.useRef(draft);
      draftRef.current = draft;
      const modelProjection = props.useProjection('modelSelection');
      const selection =
        modelProjection === undefined || modelProjection === null
          ? null
          : modelProjection.next || modelProjection.lastUsed || null;
      const [optimizing, setOptimizing] = React.useState(false);
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : null;

      React.useEffect(() => {
        diagnostics.toolbar = true;
        reportPresence();
        return () => {
          diagnostics.toolbar = false;
        };
      }, []);

      React.useEffect(() => {
        composer.replace = (text) => {
          try {
            if (inputActions && typeof inputActions.setDraft === 'function') {
              inputActions.setDraft(text);
              return true;
            }
          } catch (error) {
            /* fall through */
          }
          return false;
        };
        composer.insert = (text) => {
          const current = draftRef.current || '';
          try {
            if (
              inputActions &&
              typeof inputActions.captureInsertion === 'function' &&
              typeof inputActions.insertText === 'function'
            ) {
              const span = inputActions.captureInsertion();
              if (inputActions.insertText(text, span) === true) return true;
            }
          } catch (error) {
            /* fall through */
          }
          try {
            if (inputActions && typeof inputActions.setDraft === 'function') {
              inputActions.setDraft(
                current.trim() === '' ? text : `${current.replace(/\s+$/, '')}\n\n${text}`,
              );
              return true;
            }
          } catch (error) {
            /* ignore */
          }
          return false;
        };
        composer.sessionId = sessionId;
        return () => {
          composer.insert = null;
          composer.replace = null;
          composer.sessionId = null;
        };
      }, [inputActions, sessionId]);

      /** Ask the Host to rewrite the draft and write the result back. */
      const optimize = async () => {
        if (optimizing) return;
        const original = draftRef.current || '';
        if (!hasText(original)) {
          showToast(t('toast.emptyDraft'), { tone: 'warn' });
          return;
        }
        setOptimizing(true);
        try {
          const payload = { text: original, locale: currentLocale() };
          if (selection !== null) {
            if (typeof selection.provider === 'string') payload.provider = selection.provider;
            if (typeof selection.model === 'string') payload.model = selection.model;
            if (typeof selection.reasoningEffort === 'string') {
              payload.reasoningEffort = selection.reasoningEffort;
            }
          }
          const result = await api.optimize(payload);
          const optimized = typeof result.optimized === 'string' ? result.optimized : '';
          if (!hasText(optimized)) throw new Error(t('toast.emptyOptimized'));
          if (composer.replace === null || composer.replace(optimized) !== true) {
            throw new Error(t('toast.applyFailed'));
          }
          showToast(t('toast.optimized'), {
            tone: 'success',
            duration: 12000,
            action: {
              label: t('action.undo'),
              run: () => {
                if (composer.replace !== null) composer.replace(original);
              },
            },
          });
        } catch (error) {
          showToast(`${t('toast.optimizeFailed')}: ${error instanceof Error ? error.message : String(error)}`, {
            tone: 'error',
            duration: 8000,
          });
        } finally {
          setOptimizing(false);
        }
      };

      return h(
        'div',
        { className: 'pg-toolbar' },
        h(
          'button',
          {
            type: 'button',
            className: 'pg-icon-btn',
            title: t('toolbar.library'),
            'aria-label': t('toolbar.library'),
            onClick: () => openLibrary(),
          },
          h(IconBookmark, null),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'pg-icon-btn',
            title: optimizing ? t('toolbar.optimizeBusy') : t('toolbar.optimize'),
            'aria-label': t('toolbar.optimize'),
            disabled: optimizing,
            'aria-busy': optimizing ? 'true' : undefined,
            onClick: optimize,
          },
          optimizing ? h(IconSpinner, null) : h(IconSparkle, null),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // Library panel
    // ---------------------------------------------------------------------

    /** Category chip row for the optional category rail. */
    function countOf(library, categoryId) {
      if (library === null) return 0;
      if (categoryId === null) return library.prompts.length;
      return library.prompts.filter((prompt) => prompt.categoryId === categoryId).length;
    }

    /** The main prompt library dialog. */
    function LibraryPanel(props) {
      const t = useT();
      React.useSyncExternalStore(
        (listener) => {
          ui.listeners.add(listener);
          return () => ui.listeners.delete(listener);
        },
        () => ui.revision,
        () => ui.revision,
      );
      const dialog = ui.dialog || {};
      const [library, setLibrary] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [loadError, setLoadError] = React.useState('');
      const [query, setQuery] = React.useState('');
      const [categoryId, setCategoryId] = React.useState(
        dialog.categoryId === undefined || dialog.categoryId === null ? 'all' : dialog.categoryId,
      );
      const [editor, setEditor] = React.useState(null);
      const [categoryManager, setCategoryManager] = React.useState(false);
      const [armedDelete, setArmedDelete] = React.useState(null);
      const searchRef = React.useRef(null);
      const pendingEditRef = React.useRef(dialog.editPromptId || null);
      const armTimerRef = React.useRef(null);

      /** Load the whole library document. */
      const reload = React.useCallback(async () => {
        setLoadError('');
        try {
          const document = await api.state();
          setLibrary({
            categories: Array.isArray(document.categories) ? document.categories : [],
            prompts: Array.isArray(document.prompts) ? document.prompts : [],
          });
        } catch (error) {
          setLoadError(error instanceof Error ? error.message : String(error));
        } finally {
          setLoading(false);
        }
      }, []);

      React.useEffect(() => {
        reload();
      }, [reload]);


      React.useEffect(() => {
        const input = searchRef.current;
        if (input !== null) {
          try {
            input.focus();
          } catch (error) {
            /* ignore */
          }
        }
      }, []);

      // Open the requested prompt for editing once the document arrives.
      React.useEffect(() => {
        if (library === null) return;
        const pending = pendingEditRef.current;
        if (pending === null) return;
        pendingEditRef.current = null;
        const prompt = library.prompts.find((candidate) => candidate.id === pending);
        if (prompt === undefined) {
          showToast(t('panel.notFound'), { tone: 'warn' });
          return;
        }
        setEditor({ mode: 'edit', prompt });
      }, [library]);

      // Close the panel on Escape unless a nested dialog owns the keyboard.
      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          if (editor !== null || categoryManager) return;
          props.onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [editor, categoryManager, props]);

      // Disarm delete confirmation after a pause.
      React.useEffect(() => {
        if (armedDelete === null) return;
        const timer = setTimeout(() => setArmedDelete(null), 4000);
        return () => clearTimeout(timer);
      }, [armedDelete]);

      React.useEffect(
        () => () => {
          if (armTimerRef.current !== null) clearTimeout(armTimerRef.current);
        },
        [],
      );

      const categories = library === null ? [] : library.categories;
      const prompts = library === null ? [] : library.prompts;
      const normalizedQuery = query.trim().toLowerCase();
      const visible = prompts
        .filter((prompt) => (categoryId === 'all' ? true : prompt.categoryId === categoryId))
        .filter((prompt) => {
          if (normalizedQuery === '') return true;
          const haystack = [
            prompt.title,
            prompt.description,
            prompt.body,
            Array.isArray(prompt.tags) ? prompt.tags.join(' ') : '',
          ]
            .join('\n')
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        });

      /** Insert one prompt's body at the composer caret. */
      const insertPrompt = (prompt) => {
        const ok = composer.insert !== null && composer.insert(prompt.body) === true;
        if (!ok) {
          showToast(t('toast.insertFailed'), { tone: 'error' });
          return;
        }
        showToast(t('toast.inserted'), { tone: 'success' });
        api.markUsed(prompt.id).catch(() => {});
        props.onClose();
      };

      /** Delete one prompt after the second click confirms it. */
      const removePrompt = async (prompt) => {
        if (armedDelete !== prompt.id) {
          setArmedDelete(prompt.id);
          return;
        }
        setArmedDelete(null);
        try {
          await api.deletePrompt(prompt.id);
          showToast(t('toast.deleted'), { tone: 'success' });
          await reload();
        } catch (error) {
          showToast(`${t('toast.deleteFailed')}: ${error instanceof Error ? error.message : String(error)}`, {
            tone: 'error',
          });
        }
      };

      /** Persist a created/updated prompt coming back from the editor. */
      const handleSaved = async () => {
        setEditor(null);
        showToast(t('toast.saved'), { tone: 'success' });
        await reload();
      };

      const railItems = [
        { id: 'all', label: t('panel.all'), count: countOf(library, null) },
        ...categories
          .filter((category) => category.id === UNCATEGORIZED_ID)
          .map((category) => ({ id: category.id, label: t('panel.uncategorized'), count: countOf(library, category.id) })),
        ...categories
          .filter((category) => category.id !== UNCATEGORIZED_ID)
          .map((category) => ({
            id: category.id,
            label: categoryLabel(category, t),
            count: countOf(library, category.id),
          })),
      ];

      return h(
        React.Fragment,
        null,
        h(
          'div',
          {
            className: 'pg-backdrop',
            onMouseDown: (event) => {
              if (event.target === event.currentTarget) props.onClose();
            },
          },
          h(
            'div',
            {
              className: 'pg-modal',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('panel.title'),
            },
            h(
              'div',
              { className: 'pg-modal-header' },
              h('h2', { className: 'pg-modal-title' }, h(IconBookmark, null), t('panel.title')),
              h('span', { className: 'pg-modal-sub' }, t('panel.count', { n: prompts.length })),
              h('span', { className: 'pg-grow' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'pg-btn pg-btn-ghost',
                  title: t('action.manageCategories'),
                  onClick: () => setCategoryManager(true),
                },
                IconTag(),
                t('action.manageCategories'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'pg-icon-btn',
                  title: t('action.close'),
                  'aria-label': t('action.close'),
                  onClick: () => props.onClose(),
                },
                h(IconClose, null),
              ),
            ),
            h(
              'div',
              { className: 'pg-modal-body' },
              h(
                'div',
                { className: 'pg-rail' },
                ...railItems.map((item) =>
                  h(
                    'button',
                    {
                      key: item.id,
                      type: 'button',
                      className: `pg-rail-item${categoryId === item.id ? ' pg-active' : ''}`,
                      onClick: () => setCategoryId(item.id),
                    },
                    h('span', { className: 'pg-rail-name' }, item.label),
                    h('span', { className: 'pg-rail-count' }, String(item.count)),
                  ),
                ),
                h('div', { className: 'pg-rail-divider' }),
                h(
                  'button',
                  { type: 'button', className: 'pg-rail-add', onClick: () => setCategoryManager(true) },
                  IconPlus(),
                  t('action.newCategory'),
                ),
              ),
              h(
                'div',
                { className: 'pg-main' },
                h(
                  'label',
                  { className: 'pg-search' },
                  IconSearch(),
                  h('input', {
                    ref: searchRef,
                    value: query,
                    placeholder: t('panel.searchPlaceholder'),
                    onChange: (event) => setQuery(event.target.value),
                  }),
                  query === ''
                    ? null
                    : h(
                        'button',
                        {
                          type: 'button',
                          className: 'pg-search-clear',
                          title: t('search.clear'),
                          'aria-label': t('search.clear'),
                          onClick: () => setQuery(''),
                        },
                        h(IconClose, { size: 14 }),
                      ),
                ),
                loadError !== ''
                  ? h(
                      React.Fragment,
                      null,
                      h('div', { className: 'pg-error' }, `${t('toast.loadFailed')}: ${loadError}`),
                      h(
                        'div',
                        { style: { padding: '0 16px' } },
                        h(
                          'button',
                          { type: 'button', className: 'pg-btn', onClick: () => reload() },
                          t('action.retry'),
                        ),
                      ),
                    )
                  : null,
                h(
                  'div',
                  { className: 'pg-list', onClick: (event) => event.stopPropagation() },
                  loading
                    ? h('div', { className: 'pg-empty' }, t('panel.loading'))
                    : visible.length === 0
                      ? h(
                          'div',
                          { className: 'pg-empty' },
                          prompts.length === 0 ? t('panel.empty') : t('panel.emptyFiltered'),
                        )
                      : visible.map((prompt) =>
                          h(
                            'div',
                            { key: prompt.id, className: 'pg-card' },
                            h(
                              'div',
                              { className: 'pg-card-head' },
                              h('h3', { className: 'pg-card-title' }, prompt.title),
                              prompt.origin === 'chat'
                                ? h('span', { className: 'pg-badge' }, t('panel.originChat'))
                                : null,
                            ),
                            hasText(prompt.description)
                              ? h('p', { className: 'pg-card-desc' }, prompt.description)
                              : h('p', { className: 'pg-card-desc', style: { opacity: 0.7 } }, t('panel.noDescription')),
                            h('p', { className: 'pg-card-body' }, prompt.body),
                            Array.isArray(prompt.tags) && prompt.tags.length > 0
                              ? h(
                                  'div',
                                  { className: 'pg-tags' },
                                  ...prompt.tags.map((tag) =>
                                    h('span', { key: tag, className: 'pg-tag' }, tag),
                                  ),
                                )
                              : null,
                            h(
                              'div',
                              { className: 'pg-card-foot' },
                              h(
                                'span',
                                { className: 'pg-card-meta' },
                                [
                                  prompt.useCount > 0
                                    ? t('panel.usedTimes', { n: prompt.useCount })
                                    : null,
                                  formatWhen(prompt.updatedAt, t) !== ''
                                    ? t('panel.updated', { when: formatWhen(prompt.updatedAt, t) })
                                    : null,
                                ]
                                  .filter((part) => part !== null && part !== '')
                                  .join(' · '),
                              ),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'pg-btn pg-btn-primary',
                                  onClick: () => insertPrompt(prompt),
                                },
                                IconInsert(),
                                t('action.insert'),
                              ),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'pg-btn pg-btn-ghost',
                                  title: t('action.edit'),
                                  onClick: () => setEditor({ mode: 'edit', prompt }),
                                },
                                IconPencil(),
                                t('action.edit'),
                              ),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: `pg-btn pg-btn-danger${armedDelete === prompt.id ? ' pg-armed' : ''}`,
                                  title: t('action.delete'),
                                  onClick: () => removePrompt(prompt),
                                },
                                IconTrash(),
                                armedDelete === prompt.id ? t('action.confirmDelete') : t('action.delete'),
                              ),
                            ),
                          ),
                        ),
                ),
              ),
            ),
            h(
              'div',
              { className: 'pg-modal-footer' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'pg-btn pg-btn-primary',
                  onClick: () =>
                    setEditor({
                      mode: 'create',
                      prompt: {
                        categoryId:
                          categoryId === 'all' || categoryId === ''
                            ? UNCATEGORIZED_ID
                            : categoryId,
                      },
                    }),
                },
                IconPlus(),
                t('action.newPrompt'),
              ),
              h('span', { className: 'pg-grow' }),
              h(
                'button',
                { type: 'button', className: 'pg-btn pg-btn-ghost', onClick: () => props.onClose() },
                t('action.close'),
              ),
            ),
          ),
        ),
        editor === null
          ? null
          : h(PromptEditor, {
              key: editor.mode === 'edit' ? `edit-${editor.prompt ? editor.prompt.id : 'new'}` : 'create',
              library: library,
              initial: editor,
              onCancel: () => setEditor(null),
              onSaved: handleSaved,
            }),
        categoryManager
          ? h(CategoryManager, {
              library: library,
              onClose: () => setCategoryManager(false),
              onChanged: async () => {
                await reload();
              },
            })
          : null,
      );
    }

    // ---------------------------------------------------------------------
    // Prompt editor
    // ---------------------------------------------------------------------

    /** Create/edit one prompt. */
    function PromptEditor(props) {
      const t = useT();
      const initial = props.initial;
      const prompt = initial.mode === 'edit' ? initial.prompt : null;
      const categories = props.library === null ? [] : props.library.categories;
      const [title, setTitle] = React.useState(prompt !== null ? prompt.title : '');
      const [description, setDescription] = React.useState(prompt !== null ? prompt.description : '');
      const [body, setBody] = React.useState(prompt !== null ? prompt.body : '');
      const requestedCategory =
        prompt !== null
          ? prompt.categoryId
          : initial.prompt !== null && initial.prompt !== undefined && typeof initial.prompt.categoryId === 'string'
            ? initial.prompt.categoryId
            : UNCATEGORIZED_ID;
      const [categoryId, setCategoryId] = React.useState(
        requestedCategory === 'all' || requestedCategory === '' ? UNCATEGORIZED_ID : requestedCategory,
      );
      const [tagsText, setTagsText] = React.useState(
        prompt !== null && Array.isArray(prompt.tags) ? prompt.tags.join(', ') : '',
      );
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState('');
      const bodyRef = React.useRef(null);

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          props.onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [props]);

      React.useEffect(() => {
        if (bodyRef.current !== null) bodyRef.current.focus();
      }, []);

      /** Validate and persist the form. */
      const submit = async () => {
        if (saving) return;
        const bodyText = body.trim();
        if (bodyText === '') {
          setError(t('editor.bodyRequired'));
          return;
        }
        setSaving(true);
        setError('');
        const payload = {
          title: title.trim() === '' ? deriveTitle(bodyText) : title.trim(),
          description: description.trim(),
          body: bodyText,
          categoryId: categoryId,
          tags: parseTags(tagsText),
          origin: prompt !== null ? prompt.origin : 'manual',
        };
        try {
          const result =
            prompt !== null
              ? await api.updatePrompt(prompt.id, payload)
              : await api.createPrompt(payload);
          if (result.duplicate === true) {
            setError(t('toast.alreadySaved'));
            setSaving(false);
            return;
          }
          await props.onSaved(result.prompt);
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : String(submitError));
          setSaving(false);
        }
      };

      return h(
        'div',
        { className: 'pg-backdrop pg-nested', onMouseDown: (event) => {
            if (event.target === event.currentTarget) props.onCancel();
          } },
        h(
          'div',
          {
            className: 'pg-modal pg-modal-sm',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': prompt !== null ? t('editor.editTitle') : t('editor.createTitle'),
          },
          h(
            'div',
            { className: 'pg-modal-header' },
            h(
              'h2',
              { className: 'pg-modal-title' },
              prompt !== null ? t('editor.editTitle') : t('editor.createTitle'),
            ),
            h('span', { className: 'pg-grow' }),
            h(
              'button',
              {
                type: 'button',
                className: 'pg-icon-btn',
                title: t('action.close'),
                'aria-label': t('action.close'),
                onClick: () => props.onCancel(),
              },
              h(IconClose, null),
            ),
          ),
          h(
            'div',
            { className: 'pg-form' },
            error !== '' ? h('div', { className: 'pg-error' }, error) : null,
            h(
              'div',
              { className: 'pg-form-row' },
              h(
                'div',
                { className: 'pg-field' },
                h('label', { className: 'pg-label' }, t('editor.title')),
                h('input', {
                  className: 'pg-input',
                  value: title,
                  placeholder: t('editor.titlePlaceholder'),
                  onChange: (event) => setTitle(event.target.value),
                }),
              ),
              h(
                'div',
                { className: 'pg-field' },
                h('label', { className: 'pg-label' }, t('editor.category')),
                h(
                  'select',
                  {
                    className: 'pg-select',
                    value: categoryId,
                    onChange: (event) => setCategoryId(event.target.value),
                  },
                  ...categories.map((category) =>
                    h(
                      'option',
                      { key: category.id, value: category.id },
                      categoryLabel(category, t),
                    ),
                  ),
                ),
              ),
            ),
            h(
              'div',
              { className: 'pg-field' },
              h('label', { className: 'pg-label' }, t('editor.description')),
              h('textarea', {
                className: 'pg-textarea',
                style: { minHeight: 64 },
                value: description,
                placeholder: t('editor.descriptionPlaceholder'),
                onChange: (event) => setDescription(event.target.value),
              }),
            ),
            h(
              'div',
              { className: 'pg-field' },
              h('label', { className: 'pg-label' }, t('editor.body')),
              h('textarea', {
                ref: bodyRef,
                className: 'pg-textarea',
                value: body,
                placeholder: t('editor.bodyPlaceholder'),
                onChange: (event) => setBody(event.target.value),
              }),
            ),
            h(
              'div',
              { className: 'pg-field' },
              h('label', { className: 'pg-label' }, t('editor.tags')),
              h('input', {
                className: 'pg-input',
                value: tagsText,
                placeholder: t('editor.tagsPlaceholder'),
                onChange: (event) => setTagsText(event.target.value),
              }),
            ),
          ),
          h(
            'div',
            { className: 'pg-modal-footer' },
            h('span', { className: 'pg-grow' }),
            h(
              'button',
              { type: 'button', className: 'pg-btn pg-btn-ghost', onClick: () => props.onCancel() },
              t('action.cancel'),
            ),
            h(
              'button',
              { type: 'button', className: 'pg-btn pg-btn-primary', disabled: saving, onClick: submit },
              saving ? t('panel.loading') : t('action.save'),
            ),
          ),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // Category manager
    // ---------------------------------------------------------------------

    /** Add, rename and delete categories. */
    function CategoryManager(props) {
      const t = useT();
      const categories = props.library === null ? [] : props.library.categories;
      const [newName, setNewName] = React.useState('');
      const [renamingId, setRenamingId] = React.useState(null);
      const [renameValue, setRenameValue] = React.useState('');
      const [armedDelete, setArmedDelete] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          props.onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [props]);

      React.useEffect(() => {
        if (armedDelete === null) return;
        const timer = setTimeout(() => setArmedDelete(null), 4000);
        return () => clearTimeout(timer);
      }, [armedDelete]);

      /** Run one category mutation and reload the parent library. */
      const run = async (operation) => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          await operation();
          await props.onChanged();
        } catch (operationError) {
          setError(operationError instanceof Error ? operationError.message : String(operationError));
        } finally {
          setBusy(false);
        }
      };

      const addCategory = () =>
        run(async () => {
          const name = newName.trim();
          if (name === '') return;
          await api.createCategory({ name });
          setNewName('');
        });

      const saveRename = (id) =>
        run(async () => {
          const name = renameValue.trim();
          if (name === '') return;
          await api.updateCategory(id, { name });
          setRenamingId(null);
          setRenameValue('');
        });

      const removeCategory = (id) =>
        run(async () => {
          if (armedDelete !== id) {
            setArmedDelete(id);
            return;
          }
          setArmedDelete(null);
          await api.deleteCategory(id);
          showToast(t('toast.categoryDeleted'), { tone: 'success' });
        });

      return h(
        'div',
        { className: 'pg-backdrop pg-nested', onMouseDown: (event) => {
            if (event.target === event.currentTarget) props.onClose();
          } },
        h(
          'div',
          {
            className: 'pg-modal pg-modal-sm',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('category.manageTitle'),
          },
          h(
            'div',
            { className: 'pg-modal-header' },
            h('h2', { className: 'pg-modal-title' }, IconTag(), t('category.manageTitle')),
            h('span', { className: 'pg-grow' }),
            h(
              'button',
              {
                type: 'button',
                className: 'pg-icon-btn',
                title: t('action.close'),
                'aria-label': t('action.close'),
                onClick: () => props.onClose(),
              },
              h(IconClose, null),
            ),
          ),
          h(
            'div',
            { className: 'pg-cat-new' },
            h('input', {
              className: 'pg-input',
              value: newName,
              placeholder: t('category.newPlaceholder'),
              onChange: (event) => setNewName(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCategory();
                }
              },
            }),
            h(
              'button',
              { type: 'button', className: 'pg-btn pg-btn-primary', disabled: busy, onClick: addCategory },
              IconPlus(),
              t('action.add'),
            ),
          ),
          error !== '' ? h('div', { className: 'pg-error' }, error) : null,
          h(
            'div',
            { className: 'pg-form', style: { gap: 0 } },
            h('div', { className: 'pg-hint', style: { marginBottom: 6 } }, t('category.deleteHint')),
            ...categories.map((category) => {
              const protectedRow = category.id === UNCATEGORIZED_ID;
              const label = categoryLabel(category, t);
              return h(
                'div',
                { key: category.id, className: 'pg-cat-row' },
                renamingId === category.id
                  ? h(
                      React.Fragment,
                      null,
                      h('input', {
                        className: 'pg-input',
                        style: { flex: '1 1 auto' },
                        value: renameValue,
                        placeholder: t('category.namePlaceholder'),
                        onChange: (event) => setRenameValue(event.target.value),
                        onKeyDown: (event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveRename(category.id);
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            setRenamingId(null);
                          }
                        },
                      }),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'pg-btn pg-btn-primary',
                          disabled: busy,
                          onClick: () => saveRename(category.id),
                        },
                        t('action.save'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'pg-btn pg-btn-ghost',
                          onClick: () => setRenamingId(null),
                        },
                        t('action.cancel'),
                      ),
                    )
                  : h(
                      React.Fragment,
                      null,
                      h('span', { className: 'pg-cat-name' }, label),
                      protectedRow
                        ? h('span', { className: 'pg-hint' }, t('category.protected'))
                        : h(
                            React.Fragment,
                            null,
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'pg-btn pg-btn-ghost',
                                title: t('action.rename'),
                                onClick: () => {
                                  setRenamingId(category.id);
                                  setRenameValue(category.name);
                                },
                              },
                              IconPencil(),
                            ),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: `pg-btn pg-btn-danger${armedDelete === category.id ? ' pg-armed' : ''}`,
                                title: t('action.delete'),
                                onClick: () => removeCategory(category.id),
                              },
                              IconTrash(),
                              armedDelete === category.id ? t('action.confirmDelete') : null,
                            ),
                          ),
                    ),
              );
            }),
          ),
          h(
            'div',
            { className: 'pg-modal-footer' },
            h('span', { className: 'pg-grow' }),
            h(
              'button',
              { type: 'button', className: 'pg-btn pg-btn-ghost', onClick: () => props.onClose() },
              t('action.close'),
            ),
          ),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // Toasts and overlay host
    // ---------------------------------------------------------------------

    /** Bottom-centered toast stack. */
    function ToastViewport() {
      const t = useT();
      const state = useUi();
      return h(
        'div',
        { className: 'pg-toast-viewport', 'aria-live': 'polite' },
        ...state.toasts.map((toast) =>
          h(
            'div',
            { key: toast.id, className: `pg-toast pg-toast-${toast.tone}` },
            h('span', { className: 'pg-toast-text' }, toast.text),
            toast.action !== null && toast.action !== undefined
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'pg-toast-action',
                    onClick: () => {
                      dismissToast(toast.id);
                      try {
                        toast.action.run();
                      } catch (error) {
                        /* an action failure must not break the toast stack */
                      }
                    },
                  },
                  toast.action.label,
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'pg-toast-close',
                title: t('action.close'),
                'aria-label': t('action.close'),
                onClick: () => dismissToast(toast.id),
              },
              h(IconClose, { size: 14 }),
            ),
          ),
        ),
      );
    }

    /** Root-scoped floating layer: library dialog plus toasts. */
    function OverlayHost() {
      const state = useUi();
      const dialog = state.dialog;
      React.useEffect(() => {
        diagnostics.overlay = true;
        reportPresence();
        return () => {
          diagnostics.overlay = false;
        };
      }, []);
      return h(
        React.Fragment,
        null,
        dialog !== null && dialog.kind === 'library'
          ? h(LibraryPanel, { key: `library-${dialog.token}`, onClose: closeLibrary })
          : null,
        h(ToastViewport, null),
      );
    }

    // ---------------------------------------------------------------------
    // User-message capture buttons
    // ---------------------------------------------------------------------

    /** Read the visible text of one durable user message row. */
    function readUserMessageText(actionRow) {
      const userRow = actionRow.parentElement;
      if (userRow === null) return '';
      const clone = userRow.cloneNode(true);
      for (const node of Array.from(clone.querySelectorAll('[data-clock], [data-message-attachments], [data-pg-capture]'))) {
        node.remove();
      }
      const text = (clone.textContent || '').replace(/\u00a0/g, ' ').trim();
      return text;
    }

    /** Save one captured chat message straight into the library. */
    async function quickCapture(text) {
      const body = typeof text === 'string' ? text.trim() : '';
      if (body === '') {
        showToast(translate('toast.captureEmpty'), { tone: 'warn' });
        return;
      }
      try {
        const result = await api.createPrompt({
          title: deriveTitle(body),
          description: '',
          body,
          categoryId: UNCATEGORIZED_ID,
          tags: [],
          origin: 'chat',
        });
        const prompt = result.prompt || null;
        const openEditor = () => {
          if (prompt !== null) openLibrary({ editPromptId: prompt.id });
          else openLibrary();
        };
        if (result.duplicate === true) {
          showToast(translate('toast.alreadySaved'), {
            tone: 'warn',
            duration: 6000,
            action: { label: translate('action.editDetails'), run: openEditor },
          });
          return;
        }
        showToast(translate('toast.savedToLibrary'), {
          tone: 'success',
          duration: 6000,
          action: { label: translate('action.editDetails'), run: openEditor },
        });
      } catch (error) {
        showToast(
          `${translate('toast.saveFailed')}: ${error instanceof Error ? error.message : String(error)}`,
          { tone: 'error', duration: 6000 },
        );
      }
    }

    /**
     * Append a capture button to every durable user-message action row inside
     * the chat transcript. React may replace action rows while streaming, so a
     * MutationObserver re-installs the buttons; removal is tied to the fiber.
     */
    function startCaptureButtons() {
      const buttons = new Set();
      let scheduled = false;
      let stopped = false;
      let frameHandle = 0;

      /** Latest reported `buttons/rows` signature, to avoid chatter. */
      let lastReportedSignature = '';

      /** Update localized labels on every live button. */
      const updateLabels = () => {
        for (const button of Array.from(buttons)) {
          if (!button.isConnected) {
            buttons.delete(button);
            continue;
          }
          const label = translate('capture.button');
          button.setAttribute('title', label);
          button.setAttribute('aria-label', label);
        }
      };

      /** Build and attach one capture button for an action row. */
      const install = (row) => {
        if (row.querySelector(`:scope > [${CAPTURE_MARK}]`) !== null) return;
        if (row.closest('[data-submission-echo]') !== null) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pg-capture-btn';
        button.setAttribute(CAPTURE_MARK, '');
        button.innerHTML = CAPTURE_ICON_SVG;
        const label = translate('capture.button');
        button.setAttribute('title', label);
        button.setAttribute('aria-label', label);
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const text = readUserMessageText(row);
          if (text === '') return;
          quickCapture(text);
        });
        row.appendChild(button);
        buttons.add(button);
      };

      /** Scan the transcript for action rows that still need a button. */
      const scan = () => {
        if (stopped) return;
        try {
          const rows = document.querySelectorAll('[data-conversation-scroll] [data-clock="start"]');
          for (const row of Array.from(rows)) {
            const parent = row.parentElement;
            if (parent !== null && parent.closest('[data-conversation-scroll]') === null) continue;
            install(row);
          }
          updateLabels();
          const signature = `${buttons.size}/${rows.length}`;
          if (signature !== lastReportedSignature) {
            lastReportedSignature = signature;
            diagnostics.captureButtons = buttons.size;
            diagnostics.userRows = rows.length;
            reportPresence();
          }
        } catch (error) {
          /* a transient DOM shape must not break the observer */
        }
      };

      const schedule = () => {
        if (scheduled || stopped) return;
        scheduled = true;
        frameHandle = window.requestAnimationFrame(() => {
          scheduled = false;
          scan();
        });
      };

      const observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const initialTimer = setTimeout(scan, 400);
      const titleTimer = setInterval(updateLabels, 4000);

      return () => {
        stopped = true;
        observer.disconnect();
        clearTimeout(initialTimer);
        clearInterval(titleTimer);
        if (frameHandle !== 0) window.cancelAnimationFrame(frameHandle);
        for (const button of buttons) button.remove();
        buttons.clear();
        diagnostics.captureButtons = 0;
        diagnostics.userRows = 0;
        reportPresence();
      };
    }

    // ---------------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------------

    /** Refresh the translator and notify locale consumers. */
    function refreshLocale() {
      if (localeContext !== null) {
        try {
          translate = localeContext.bind(NS);
        } catch (error) {
          translate = (key, params) => interpolate(zh[key] ?? en[key] ?? key, params);
        }
      }
      for (const listener of Array.from(localeListeners)) {
        try {
          listener();
        } catch (error) {
          /* ignore one broken listener */
        }
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        localeContext = ctx.locale;
        ctx.effect(
          () => ctx.locale.register(NS, dictionaries),
          'dsh-prompt-gallery: locale dictionaries',
        );
        refreshLocale();
        ctx.effect(
          () => ctx.locale.subscribe(refreshLocale),
          'dsh-prompt-gallery: locale changes',
        );
        ctx.effect(() => injectStyles(), 'dsh-prompt-gallery: stylesheet');
        ctx.effect(
          () => startCaptureButtons(),
          'dsh-prompt-gallery: user-message capture buttons',
        );
        ctx.effect(
          () => startPresenceReporting(),
          'dsh-prompt-gallery: client diagnostics',
        );
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            { name: 'conversation.input.left', id: 'prompt-gallery', order: 40 },
            ComposerToolbar,
          ),
        );
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'prompt-gallery-overlay', order: 40 },
            OverlayHost,
          ),
        );
      },
    };
  },
});
