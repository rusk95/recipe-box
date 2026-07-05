/* ============================================
   RecipeBox — Application Logic
   ============================================ */

(() => {
  'use strict';

  // ---- Constants ----
  const STORAGE_KEY = 'recipebox_recipes';
  const THEME_KEY = 'recipebox_theme';

  const CATEGORIES = {
    main:   { icon: '🥩', label: '主菜（メイン）', short: '主菜' },
    side:   { icon: '🥗', label: '副菜（おかず）', short: '副菜' },
    salad:  { icon: '🥬', label: 'サラダ',         short: 'サラダ' },
    soup:   { icon: '🍲', label: '汁物・スープ',   short: '汁物' },
    rice:   { icon: '🍚', label: 'ご飯もの',       short: 'ご飯もの' },
    noodle: { icon: '🍜', label: '麺類',           short: '麺類' }
  };

  // ---- State ----
  let recipes = [];
  let activeCategory = 'all';
  let searchQuery = '';
  let editingId = null;
  let confirmCallback = null;

  // ---- DOM Refs ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    recipeGrid:      $('#recipeGrid'),
    emptyState:      $('#emptyState'),
    noResults:       $('#noResults'),
    recipeCount:     $('#recipeCount'),
    searchInput:     $('#searchInput'),
    searchClear:     $('#searchClear'),
    categoryTabs:    $('#categoryTabs'),
    btnAddRecipe:    $('#btnAddRecipe'),
    btnToggleTheme:  $('#btnToggleTheme'),
    btnSettings:     $('#btnSettings'),

    // Form Modal
    formModal:       $('#formModal'),
    formModalTitle:  $('#formModalTitle'),
    formModalClose:  $('#formModalClose'),
    recipeForm:      $('#recipeForm'),
    recipeId:        $('#recipeId'),
    recipeName:      $('#recipeName'),
    recipeCategory:  $('#recipeCategory'),
    recipeCookTime:  $('#recipeCookTime'),
    recipeServings:  $('#recipeServings'),
    recipeUrl:       $('#recipeUrl'),
    recipeMemo:      $('#recipeMemo'),
    ingredientGroupsContainer: $('#ingredientGroupsContainer'),
    stepsList:       $('#stepsList'),
    btnAddIngredient:$('#btnAddIngredient'),
    btnAddIngredientGroup: $('#btnAddIngredientGroup'),
    btnAddStep:      $('#btnAddStep'),
    btnCancelForm:   $('#btnCancelForm'),
    btnSaveRecipe:   $('#btnSaveRecipe'),

    // URL Import
    importUrlInput:  $('#importUrlInput'),
    btnFetchUrl:     $('#btnFetchUrl'),
    importStatus:    $('#importStatus'),
    importStatusText:$('#importStatusText'),
    urlImportSection:$('#urlImportSection'),

    // Photo
    photoUpload:     $('#photoUpload'),
    photoInput:      $('#photoInput'),
    photoPreview:    $('#photoPreview'),
    photoPlaceholder:$('#photoPlaceholder'),
    photoRemove:     $('#photoRemove'),

    // Detail Modal
    detailModal:     $('#detailModal'),
    detailModalTitle:$('#detailModalTitle'),
    detailModalClose:$('#detailModalClose'),
    detailContent:   $('#detailContent'),

    // Settings Modal
    settingsModal:   $('#settingsModal'),
    settingsClose:   $('#settingsClose'),
    btnExport:       $('#btnExport'),
    btnImport:       $('#btnImport'),
    importInput:     $('#importInput'),
    btnDeleteAll:    $('#btnDeleteAll'),
    googleClientId:  $('#googleClientId'),
    gdriveStatus:    $('#gdriveStatus'),
    gdriveStatusText:$('#gdriveStatusText'),
    btnConnectGDrive:$('#btnConnectGDrive'),
    btnSyncNow:      $('#btnSyncNow'),
    btnDisconnectGDrive:$('#btnDisconnectGDrive'),

    // Confirm
    confirmModal:    $('#confirmModal'),
    confirmTitle:    $('#confirmTitle'),
    confirmText:     $('#confirmText'),
    confirmCancel:   $('#confirmCancel'),
    confirmOk:       $('#confirmOk'),

    // Toast
    toastContainer:  $('#toastContainer')
  };

  // ============================================
  // DATA LAYER
  // ============================================
  function loadRecipes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      recipes = raw ? JSON.parse(raw) : [];
    } catch {
      recipes = [];
    }
  }

  function saveRecipes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // --- Ingredient data helpers ---
  function migrateIngredients(recipe) {
    if (recipe.ingredientGroups && recipe.ingredientGroups.length > 0) {
      return recipe.ingredientGroups;
    }
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      return [{ title: '', items: recipe.ingredients }];
    }
    return [];
  }

  function getAllIngredients(recipe) {
    return migrateIngredients(recipe).flatMap(g => g.items || []);
  }

  // ============================================
  // THEME
  // ============================================
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  }

  // ============================================
  // RENDERING
  // ============================================
  function getFilteredRecipes() {
    let list = [...recipes];

    // Category filter
    if (activeCategory === 'favorite') {
      list = list.filter(r => r.favorite);
    } else if (activeCategory !== 'all') {
      list = list.filter(r => r.category === activeCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => {
        const nameMatch = r.name.toLowerCase().includes(q);
        const allIngs = getAllIngredients(r);
        const ingredientMatch = allIngs.some(
          ing => ing.name && ing.name.toLowerCase().includes(q)
        );
        const memoMatch = r.memo && r.memo.toLowerCase().includes(q);
        return nameMatch || ingredientMatch || memoMatch;
      });
    }

    // Sort: favorites first, then by creation date (newest first)
    list.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    return list;
  }

  function renderRecipes() {
    const filtered = getFilteredRecipes();
    dom.recipeGrid.innerHTML = '';

    // Update count
    dom.recipeCount.textContent = `${recipes.length} レシピ`;

    // Show/hide states
    if (recipes.length === 0) {
      dom.emptyState.style.display = 'flex';
      dom.noResults.style.display = 'none';
      dom.recipeGrid.style.display = 'none';
      return;
    }

    dom.emptyState.style.display = 'none';

    if (filtered.length === 0) {
      dom.noResults.style.display = 'flex';
      dom.recipeGrid.style.display = 'none';
      return;
    }

    dom.noResults.style.display = 'none';
    dom.recipeGrid.style.display = 'grid';

    filtered.forEach((recipe, index) => {
      const card = createRecipeCard(recipe, index);
      dom.recipeGrid.appendChild(card);
    });
  }

  function createRecipeCard(recipe, index) {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.style.animationDelay = `${index * 50}ms`;

    const cat = CATEGORIES[recipe.category] || { icon: '📋', short: '未分類' };
    const favIcon = recipe.favorite ? '⭐' : '☆';

    let imageHtml;
    if (recipe.photo) {
      imageHtml = `<img class="recipe-card__image" src="${recipe.photo}" alt="${escapeHtml(recipe.name)}" loading="lazy">`;
    } else {
      imageHtml = `<div class="recipe-card__image-placeholder">${cat.icon}</div>`;
    }

    let metaHtml = '';
    if (recipe.servings) {
      metaHtml += `<span class="recipe-card__meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/></svg>
        ${recipe.servings}人分
      </span>`;
    }
    if (recipe.cookTime) {
      metaHtml += `<span class="recipe-card__meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        ${recipe.cookTime}分
      </span>`;
    }
    const allIngs = getAllIngredients(recipe);
    if (allIngs.length > 0) {
      const count = allIngs.filter(i => i.name).length;
      if (count > 0) {
        metaHtml += `<span class="recipe-card__meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
          ${count}食材
        </span>`;
      }
    }

    card.innerHTML = `
      <button class="recipe-card__favorite ${recipe.favorite ? 'active' : ''}" data-action="toggle-favorite" data-id="${recipe.id}" aria-label="お気に入り">
        ${favIcon}
      </button>
      ${imageHtml}
      <div class="recipe-card__content">
        <span class="recipe-card__category">${cat.icon} ${cat.short}</span>
        <h3 class="recipe-card__name">${escapeHtml(recipe.name)}</h3>
        <div class="recipe-card__meta">${metaHtml}</div>
      </div>
    `;

    // Click on card → open detail
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="toggle-favorite"]')) return;
      openDetailModal(recipe.id);
    });

    // Favorite toggle
    const favBtn = card.querySelector('[data-action="toggle-favorite"]');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(recipe.id);
    });

    return card;
  }

  // ============================================
  // RECIPE CRUD
  // ============================================
  function toggleFavorite(id) {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    recipe.favorite = !recipe.favorite;
    saveRecipes();
    renderRecipes();
    showToast(recipe.favorite ? '⭐ お気に入りに追加しました' : 'お気に入りを解除しました');
    if (gdriveAccessToken) syncWithGDrive(true);
  }

  function deleteRecipe(id) {
    recipes = recipes.filter(r => r.id !== id);

    // Track deleted ID for Google Drive sync tombstone
    const deletedIds = JSON.parse(localStorage.getItem('recipebox_deleted_ids') || '[]');
    if (!deletedIds.includes(id)) {
      deletedIds.push(id);
      localStorage.setItem('recipebox_deleted_ids', JSON.stringify(deletedIds));
    }

    saveRecipes();
    renderRecipes();
    showToast('🗑️ レシピを削除しました');
    if (gdriveAccessToken) syncWithGDrive(true);
  }

  function saveRecipe(data) {
    if (editingId) {
      const idx = recipes.findIndex(r => r.id === editingId);
      if (idx !== -1) {
        recipes[idx] = { ...recipes[idx], ...data, updatedAt: Date.now() };
      }
      showToast('✅ レシピを更新しました');
    } else {
      const newRecipe = {
        id: generateId(),
        ...data,
        favorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      recipes.unshift(newRecipe);
      showToast('🎉 レシピを追加しました');
    }
    saveRecipes();
    renderRecipes();
    if (gdriveAccessToken) syncWithGDrive(true);
  }

  // ============================================
  // FORM MODAL
  // ============================================
  function openFormModal(recipeId) {
    editingId = recipeId || null;
    dom.formModalTitle.textContent = editingId ? 'レシピを編集' : 'レシピを追加';
    dom.btnSaveRecipe.textContent = editingId ? '更新する' : '保存する';

    // Show/hide URL import section (only for new recipes)
    dom.urlImportSection.style.display = editingId ? 'none' : 'block';

    resetForm();

    if (editingId) {
      const recipe = recipes.find(r => r.id === editingId);
      if (recipe) populateForm(recipe);
    } else {
      addIngredientGroup('', []);
      addStepRow();
    }

    openModal(dom.formModal);
    
    // Focus first input depending on edit/add without scrolling!
    if (editingId) {
      dom.recipeName.focus({ preventScroll: true });
    } else {
      dom.importUrlInput.focus({ preventScroll: true });
    }
  }

  function resetForm() {
    dom.recipeForm.reset();
    dom.recipeId.value = '';
    dom.ingredientGroupsContainer.innerHTML = '';
    dom.stepsList.innerHTML = '';
    clearPhoto();
    // Reset URL import
    dom.importUrlInput.value = '';
    setImportStatus('hidden', '');
  }

  function populateForm(recipe) {
    dom.recipeName.value = recipe.name || '';
    dom.recipeCategory.value = recipe.category || '';
    dom.recipeCookTime.value = recipe.cookTime || '';
    dom.recipeServings.value = recipe.servings || '';
    dom.recipeUrl.value = recipe.url || '';
    dom.recipeMemo.value = recipe.memo || '';

    // Photo
    if (recipe.photo) {
      dom.photoPreview.src = recipe.photo;
      dom.photoPreview.style.display = 'block';
      dom.photoPlaceholder.style.display = 'none';
      dom.photoRemove.style.display = 'flex';
    }

    // Ingredient Groups
    const groups = migrateIngredients(recipe);
    if (groups.length > 0) {
      groups.forEach(g => addIngredientGroup(g.title, g.items));
    } else {
      addIngredientGroup('', []);
    }

    // Steps
    if (recipe.steps && recipe.steps.length > 0) {
      recipe.steps.forEach(step => addStepRow(step));
    } else {
      addStepRow();
    }
  }

  function collectFormData() {
    const ingredientGroups = [];
    dom.ingredientGroupsContainer.querySelectorAll('.ingredient-group').forEach(groupEl => {
      const titleInput = groupEl.querySelector('.ingredient-group__title-input');
      const title = titleInput ? titleInput.value.trim() : '';
      const items = [];
      groupEl.querySelectorAll('.ingredient-row').forEach(row => {
        const inputs = row.querySelectorAll('.form-input');
        const name = inputs[0].value.trim();
        const amount = inputs[1].value.trim();
        if (name) items.push({ name, amount });
      });
      if (title || items.length > 0) {
        ingredientGroups.push({ title, items });
      }
    });

    const steps = [];
    dom.stepsList.querySelectorAll('.step-row .form-input').forEach(input => {
      const text = input.value.trim();
      if (text) steps.push(text);
    });

    return {
      name: dom.recipeName.value.trim(),
      category: dom.recipeCategory.value,
      servings: dom.recipeServings.value ? parseInt(dom.recipeServings.value, 10) : null,
      cookTime: dom.recipeCookTime.value ? parseInt(dom.recipeCookTime.value, 10) : null,
      ingredientGroups,
      steps,
      url: dom.recipeUrl.value.trim(),
      memo: dom.recipeMemo.value.trim(),
      photo: dom.photoPreview.style.display !== 'none' ? dom.photoPreview.src : null
    };
  }

  function validateForm(data) {
    if (!data.name) {
      showToast('⚠️ レシピ名を入力してください', 'error');
      dom.recipeName.focus();
      return false;
    }
    if (!data.category) {
      showToast('⚠️ カテゴリを選択してください', 'error');
      dom.recipeCategory.focus();
      return false;
    }
    return true;
  }

  // --- Ingredient Groups ---
  function addIngredientGroup(title = '', items = []) {
    const isDefault = !title && dom.ingredientGroupsContainer.children.length === 0;
    const group = document.createElement('div');
    group.className = `ingredient-group ${isDefault ? 'ingredient-group--default' : ''}`;

    let headerHtml = '';
    if (!isDefault) {
      headerHtml = `
        <div class="ingredient-group__header">
          <input type="text" class="ingredient-group__title-input" placeholder="見出し（例: ソース）" value="${escapeHtml(title)}">
          <button type="button" class="btn-remove-row" aria-label="グループ削除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>`;
    }

    group.innerHTML = `
      ${headerHtml}
      <div class="ingredient-group__items"></div>
      <button type="button" class="ingredient-group__add-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
        追加
      </button>
    `;

    // Bind remove group
    const removeBtn = group.querySelector('.ingredient-group__header .btn-remove-row');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        group.style.opacity = '0';
        group.style.transform = 'translateX(8px)';
        group.style.transition = 'all 0.2s ease-out';
        setTimeout(() => group.remove(), 200);
      });
    }

    // Bind add row within group
    const addBtn = group.querySelector('.ingredient-group__add-btn');
    const itemsContainer = group.querySelector('.ingredient-group__items');
    addBtn.addEventListener('click', () => addIngredientRow(itemsContainer));

    dom.ingredientGroupsContainer.appendChild(group);

    // Add items
    if (items.length > 0) {
      items.forEach(item => addIngredientRow(itemsContainer, item.name, item.amount));
    } else {
      addIngredientRow(itemsContainer);
    }

    return group;
  }

  function addIngredientRow(container, name = '', amount = '') {
    // If container not provided, add to the last group
    if (!container || !(container instanceof Element)) {
      // Shift args if called without container
      if (typeof container === 'string') {
        amount = name;
        name = container;
        container = null;
      }
      const groups = dom.ingredientGroupsContainer.querySelectorAll('.ingredient-group');
      if (groups.length === 0) {
        addIngredientGroup('', []);
        return;
      }
      container = groups[groups.length - 1].querySelector('.ingredient-group__items');
    }

    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
      <input type="text" class="form-input" placeholder="食材名" value="${escapeHtml(name || '')}">
      <input type="text" class="form-input" placeholder="分量" value="${escapeHtml(amount || '')}">
      <button type="button" class="btn-remove-row" aria-label="削除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;
    row.querySelector('.btn-remove-row').addEventListener('click', () => {
      row.style.animation = 'none';
      row.style.opacity = '0';
      row.style.transform = 'translateX(8px)';
      row.style.transition = 'all 0.2s ease-out';
      setTimeout(() => row.remove(), 200);
    });
    container.appendChild(row);
  }

  // --- Dynamic Step Rows ---
  function addStepRow(text = '') {
    const rows = dom.stepsList.querySelectorAll('.step-row');
    const num = rows.length + 1;

    const row = document.createElement('div');
    row.className = 'step-row';
    row.innerHTML = `
      <span class="step-row__number">${num}</span>
      <input type="text" class="form-input" placeholder="手順を入力..." value="${escapeHtml(text)}">
      <button type="button" class="btn-remove-row" aria-label="削除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;
    row.querySelector('.btn-remove-row').addEventListener('click', () => {
      row.style.animation = 'none';
      row.style.opacity = '0';
      row.style.transform = 'translateX(8px)';
      row.style.transition = 'all 0.2s ease-out';
      setTimeout(() => {
        row.remove();
        renumberSteps();
      }, 200);
    });
    dom.stepsList.appendChild(row);
  }

  function renumberSteps() {
    dom.stepsList.querySelectorAll('.step-row__number').forEach((el, i) => {
      el.textContent = i + 1;
    });
  }

  // --- Photo ---
  function handlePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('⚠️ 画像サイズは5MB以下にしてください', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Resize image to save storage
      resizeImage(ev.target.result, 800, 600, (resized) => {
        dom.photoPreview.src = resized;
        dom.photoPreview.style.display = 'block';
        dom.photoPlaceholder.style.display = 'none';
        dom.photoRemove.style.display = 'flex';
      });
    };
    reader.readAsDataURL(file);
  }

  function resizeImage(dataUrl, maxW, maxH, callback) {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;

      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = dataUrl;
  }

  function clearPhoto() {
    dom.photoPreview.src = '';
    dom.photoPreview.style.display = 'none';
    dom.photoPlaceholder.style.display = 'flex';
    dom.photoRemove.style.display = 'none';
    dom.photoInput.value = '';
  }

  // ============================================
  // URL AUTO-IMPORT
  // ============================================
  const CORS_PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  const IMAGE_PROXIES = [
    (url) => `https://images.weserv.nl/?url=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  // Category auto-detection keywords
  const CATEGORY_RULES = [
    { category: 'soup',   keywords: ['味噌汁','みそ汁','スープ','汁','ポタージュ','シチュー','豚汁','けんちん','お吸い物','ミネストローネ','チャウダー','コンソメ'] },
    { category: 'salad',  keywords: ['サラダ','マリネ','コールスロー','カプレーゼ','ドレッシング'] },
    { category: 'noodle', keywords: ['パスタ','うどん','そば','蕎麦','ラーメン','焼きそば','そうめん','素麺','冷麺','ビーフン','フォー','ペンネ','スパゲッティ','スパゲティ','麺'] },
    { category: 'rice',   keywords: ['チャーハン','炒飯','炊き込み','ピラフ','リゾット','丼','どんぶり','ドリア','オムライス','カレー','ハヤシ','雑炊','おにぎり','寿司','すし'] },
    { category: 'side',   keywords: ['きんぴら','和え物','胡麻和え','おひたし','お浸し','煮浸し','漬物','ナムル','酢の物','煮豆','佃煮','白和え','卵焼き','だし巻き'] },
    { category: 'main',   keywords: ['ハンバーグ','唐揚げ','からあげ','生姜焼き','しょうが焼き','ステーキ','トンカツ','とんかつ','焼肉','煮物','炒め','揚げ','焼き','グラタン','ムニエル','ソテー','フライ','天ぷら','餃子','ぎょうざ','肉','魚','チキン','ポーク','ビーフ'] }
  ];

  function detectCategory(name, ingredientGroups) {
    const allItems = (ingredientGroups || []).flatMap(g => g.items || []);
    const text = (name + ' ' + allItems.map(i => i.name || i).join(' ')).toLowerCase();
    for (const rule of CATEGORY_RULES) {
      for (const kw of rule.keywords) {
        if (text.includes(kw.toLowerCase())) {
          return rule.category;
        }
      }
    }
    return 'main'; // default
  }

  async function fetchRecipeFromUrl(url) {
    setImportStatus('loading', 'レシピページを取得中...');

    let html = null;

    // Try each CORS proxy
    for (const proxy of CORS_PROXIES) {
      try {
        const res = await fetch(proxy(url), { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          html = await res.text();
          break;
        }
      } catch {
        continue;
      }
    }

    if (!html) {
      setImportStatus('error', '⚠️ ページを取得できませんでした。URLを確認してください。');
      return null;
    }

    setImportStatus('loading', 'レシピ情報を解析中...');

    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try JSON-LD (schema.org/Recipe)
    let recipeData = extractJsonLd(doc);

    // Fallback: meta tags + page content heuristics
    if (!recipeData) {
      recipeData = extractFromMeta(doc, url);
    } else if (!recipeData.photoUrl) {
      // If JSON-LD successfully parsed but has no photo, attempt to extract og:image from meta
      const metaData = extractFromMeta(doc, url);
      if (metaData && metaData.photoUrl) {
        recipeData.photoUrl = metaData.photoUrl;
      }
    }

    if (!recipeData || !recipeData.name) {
      setImportStatus('error', '⚠️ レシピ情報を自動取得できませんでした。手動で入力してください。');
      return null;
    }

    // Resolve relative photoUrl to absolute
    if (recipeData.photoUrl) {
      try {
        recipeData.photoUrl = new URL(recipeData.photoUrl, url).href;
      } catch {}
    }

    // Auto-detect category
    recipeData.category = detectCategory(recipeData.name, recipeData.ingredientGroups);
    recipeData.url = url;

    setImportStatus('success', `✅「${recipeData.name}」を取得しました！`);
    return recipeData;
  }


  function extractJsonLd(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        let data = JSON.parse(script.textContent);

        // Handle @graph arrays
        if (data['@graph']) {
          data = data['@graph'].find(item => item['@type'] === 'Recipe') || null;
          if (!data) continue;
        }

        // Handle arrays
        if (Array.isArray(data)) {
          data = data.find(item => item['@type'] === 'Recipe') || null;
          if (!data) continue;
        }

        if (data['@type'] !== 'Recipe') continue;

        const result = { name: data.name || '' };

        // Cook time (parse ISO 8601 duration)
        if (data.totalTime || data.cookTime) {
          result.cookTime = parseIsoDuration(data.totalTime || data.cookTime);
        }

        // Servings
        if (data.recipeYield) {
          const yieldStr = Array.isArray(data.recipeYield) ? data.recipeYield[0] : data.recipeYield;
          const yieldMatch = String(yieldStr).match(/(\d+)/);
          if (yieldMatch) result.servings = parseInt(yieldMatch[1], 10);
        }

        // Ingredients → ingredientGroups
        if (data.recipeIngredient && Array.isArray(data.recipeIngredient)) {
          result.ingredientGroups = [{
            title: '',
            items: data.recipeIngredient.map(ing => parseIngredientString(ing))
          }];
        }

        // Steps
        if (data.recipeInstructions) {
          result.steps = parseInstructions(data.recipeInstructions);
        }

        // Image
        if (data.image) {
          if (typeof data.image === 'string') {
            result.photoUrl = data.image;
          } else if (Array.isArray(data.image)) {
            result.photoUrl = typeof data.image[0] === 'string' ? data.image[0] : data.image[0]?.url;
          } else if (data.image.url) {
            result.photoUrl = data.image.url;
          }
        }

        // Description as memo
        if (data.description) {
          result.memo = data.description;
        }

        return result;
      } catch {
        continue;
      }
    }
    return null;
  }

  function extractFromMeta(doc, url) {
    const result = {};

    // Try Open Graph / meta tags
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    const metaTitle = doc.querySelector('title');
    result.name = ogTitle?.content || metaTitle?.textContent || '';

    // Clean up common suffixes from title
    result.name = result.name
      .replace(/\s*[|\-–—]\s*[^|\-–—]*$/, '') // Remove site name after separator
      .replace(/\s*のレシピ.*$/, '') // Remove "のレシピ..." suffix
      .replace(/\s*レシピ・作り方.*$/, '')
      .trim();

    const ogDesc = doc.querySelector('meta[property="og:description"]');
    const metaDesc = doc.querySelector('meta[name="description"]');
    if (ogDesc?.content || metaDesc?.content) {
      result.memo = (ogDesc?.content || metaDesc?.content).trim();
    }

    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage?.content) {
      result.photoUrl = ogImage.content;
    }

    return result.name ? result : null;
  }

  function parseIsoDuration(iso) {
    if (!iso) return null;
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return null;
    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    return hours * 60 + minutes || null;
  }

  function parseIngredientString(str) {
    if (!str) return { name: '', amount: '' };
    str = str.trim();

    // Common patterns: "鶏もも肉 300g", "鶏もも肉：300g", "鶏もも肉…300g"
    const separators = /[：:\s…・]+/;
    const parts = str.split(separators);

    if (parts.length >= 2) {
      const name = parts[0].trim();
      const amount = parts.slice(1).join(' ').trim();
      return { name, amount };
    }

    // Try to split by amount pattern at the end
    const amountMatch = str.match(/^(.+?)\s*([\d½⅓¼⅕⅔¾]+[\s]*(?:g|kg|ml|cc|L|本|個|枚|切れ|丁|束|袋|缶|パック|大さじ|小さじ|カップ|合|適量|少々|お好み).*)$/i);
    if (amountMatch) {
      return { name: amountMatch[1].trim(), amount: amountMatch[2].trim() };
    }

    return { name: str, amount: '' };
  }

  function parseInstructions(instructions) {
    if (!instructions) return [];
    if (typeof instructions === 'string') {
      return instructions.split(/[\n。]+/).map(s => s.trim()).filter(Boolean);
    }
    if (Array.isArray(instructions)) {
      return instructions.flatMap(item => {
        if (typeof item === 'string') return [item.trim()];
        if (item.text) return [item.text.trim()];
        if (item['@type'] === 'HowToStep') return [item.text?.trim()].filter(Boolean);
        if (item['@type'] === 'HowToSection' && item.itemListElement) {
          return item.itemListElement.map(sub => sub.text?.trim()).filter(Boolean);
        }
        return [];
      }).filter(Boolean);
    }
    return [];
  }

  function setImportStatus(type, message) {
    const statusEl = dom.importStatus;
    const textEl = dom.importStatusText;

    if (type === 'hidden') {
      statusEl.style.display = 'none';
      return;
    }

    statusEl.style.display = 'flex';
    textEl.textContent = message;

    statusEl.classList.remove('url-import__status--error');
    const spinner = statusEl.querySelector('.url-import__spinner');

    if (type === 'loading') {
      spinner.style.display = 'block';
    } else if (type === 'error') {
      spinner.style.display = 'none';
      statusEl.classList.add('url-import__status--error');
    } else {
      spinner.style.display = 'none';
    }
  }

  function applyFetchedData(data) {
    if (!data) return;

    // Clear existing form inputs
    dom.ingredientGroupsContainer.innerHTML = '';
    dom.stepsList.innerHTML = '';

    // Fill basic fields
    if (data.name) dom.recipeName.value = data.name;
    if (data.category) dom.recipeCategory.value = data.category;
    if (data.servings) dom.recipeServings.value = data.servings;
    if (data.cookTime) dom.recipeCookTime.value = data.cookTime;
    if (data.url) dom.recipeUrl.value = data.url;
    if (data.memo) dom.recipeMemo.value = data.memo;

    // Ingredient Groups
    if (data.ingredientGroups && data.ingredientGroups.length > 0) {
      data.ingredientGroups.forEach(g => addIngredientGroup(g.title || '', g.items || []));
    } else {
      addIngredientGroup('', []);
    }

    // Steps
    if (data.steps && data.steps.length > 0) {
      data.steps.forEach(step => addStepRow(step));
    } else {
      addStepRow();
    }

    // Try to fetch photo from URL (cross-origin images may fail)
    if (data.photoUrl) {
      // Show external image URL immediately so it is visible
      dom.photoPreview.src = data.photoUrl;
      dom.photoPreview.style.display = 'block';
      dom.photoPlaceholder.style.display = 'none';
      dom.photoRemove.style.display = 'flex';

      // Try to convert to Base64 in background for offline use
      fetchImageAsBase64(data.photoUrl).then(base64 => {
        if (base64) {
          dom.photoPreview.src = base64;
        }
      }).catch(() => {});
    }
  }

  async function fetchImageAsBase64(imageUrl) {
    // 1. Try fetching directly first (some CDNs allow CORS for images)
    try {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resizeImage(reader.result, 800, 600, resolve);
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch (e) {
      // Fallback to proxies
    }

    // 2. Try via Image/CORS proxies
    for (const proxy of IMAGE_PROXIES) {
      try {
        const res = await fetch(proxy(imageUrl), { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) continue;
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resizeImage(reader.result, 800, 600, resolve);
            reader.readAsDataURL(blob);
          });
        }
      } catch { continue; }
    }
    return null;
  }

  // ============================================
  // DETAIL MODAL
  // ============================================
  function buildIngredientsInnerHtml(groups, baseServings) {
    let servingsHtml = '';
    if (baseServings) {
      servingsHtml = `
        <div class="detail-servings">
          <span class="detail-servings__label">分量：</span>
          <div class="detail-servings__controls">
            <button class="detail-servings__btn" data-action="servings-dec">−</button>
            <span class="detail-servings__value">${baseServings}人分</span>
            <button class="detail-servings__btn" data-action="servings-inc">+</button>
          </div>
          <span class="detail-servings__note" style="display:none;">※目安量です</span>
        </div>`;
    }

    let groupsContent = '';
    groups.forEach(g => {
      const items = (g.items || []).filter(i => i.name);
      if (items.length === 0) return;
      let titleHtml = g.title ? `<div class="detail-ingredient-group__title">${escapeHtml(g.title)}</div>` : '';
      const listItems = items.map(i =>
        `<li><span class="detail-ingredient-name">${escapeHtml(i.name)}</span><span class="detail-ingredient-amount" data-base-amount="${escapeHtml(i.amount)}">${escapeHtml(i.amount)}</span></li>`
      ).join('');
      groupsContent += `<div class="detail-ingredient-group">${titleHtml}<ul class="detail-ingredients">${listItems}</ul></div>`;
    });

    return `
      <h4 class="detail-section__title">🥕 材料</h4>
      ${servingsHtml}
      ${groupsContent}`;
  }

  function openDetailModal(id) {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;

    const cat = CATEGORIES[recipe.category] || { icon: '📋', label: '未分類' };

    let heroHtml;
    if (recipe.photo) {
      heroHtml = `<img class="detail-hero" src="${recipe.photo}" alt="${escapeHtml(recipe.name)}">`;
    } else {
      heroHtml = `<div class="detail-hero-placeholder">${cat.icon}</div>`;
    }

    let metaBadges = `<span class="detail-meta__badge detail-meta__badge--category">${cat.icon} ${cat.label}</span>`;
    if (recipe.servings) {
      metaBadges += `<span class="detail-meta__badge">👤 ${recipe.servings}人分</span>`;
    }
    if (recipe.cookTime) {
      metaBadges += `<span class="detail-meta__badge">⏱️ ${recipe.cookTime}分</span>`;
    }

    // --- Build ingredients ---
    const baseServings = recipe.servings || null;
    let currentServings = baseServings;
    const groups = migrateIngredients(recipe);
    const hasIngredients = groups.some(g => g.items && g.items.some(i => i.name));

    const ingredientsInner = hasIngredients ? buildIngredientsInnerHtml(groups, baseServings) : '';

    // --- Build steps ---
    let stepsHtml = '';
    if (recipe.steps && recipe.steps.length > 0) {
      const items = recipe.steps
        .filter(s => s)
        .map((s, i) => `<li class="detail-step"><span class="detail-step__number">${i + 1}</span><span class="detail-step__text">${escapeHtml(s)}</span></li>`)
        .join('');
      if (items) {
        stepsHtml = `
          <div class="detail-section">
            <h4 class="detail-section__title">📝 作り方</h4>
            <ol class="detail-steps">${items}</ol>
          </div>`;
      }
    }

    let urlHtml = '';
    if (recipe.url) {
      urlHtml = `
        <div class="detail-section">
          <h4 class="detail-section__title">🔗 元レシピ</h4>
          <a class="detail-url" href="${escapeHtml(recipe.url)}" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            ${escapeHtml(recipe.url)}
          </a>
        </div>`;
    }

    let memoHtml = '';
    if (recipe.memo) {
      memoHtml = `
        <div class="detail-section">
          <h4 class="detail-section__title">💡 メモ・アレンジ</h4>
          <div class="detail-memo">${escapeHtml(recipe.memo)}</div>
        </div>`;
    }

    // --- Build split layout ---
    let bodyHtml;
    const hasSteps = stepsHtml !== '';

    if (hasIngredients && hasSteps) {
      // Side-by-side layout (PC) / stacked with FAB (mobile)
      bodyHtml = `
        <div class="detail-split">
          <div class="detail-split__sidebar">
            <div class="detail-section" id="detailIngredientsSection">
              ${ingredientsInner}
            </div>
          </div>
          <div class="detail-split__main">
            ${stepsHtml}
            ${urlHtml}
            ${memoHtml}
          </div>
        </div>
        <div class="detail-panel-backdrop" id="detailPanelBackdrop"></div>
        <div class="detail-ingredients-panel" id="detailIngredientsPanel">
          <div class="detail-ingredients-panel__header">
            <h4>🥕 材料</h4>
            <button class="detail-ingredients-panel__close" id="detailPanelClose">✕</button>
          </div>
          <div class="detail-ingredients-panel__body" id="detailPanelBody">
            ${ingredientsInner}
          </div>
        </div>
        <button class="detail-fab-ingredients" id="detailFabIngredients">🥕 材料を確認</button>`;
    } else if (hasIngredients) {
      bodyHtml = `
        <div class="detail-section" id="detailIngredientsSection">
          ${ingredientsInner}
        </div>
        ${urlHtml}
        ${memoHtml}`;
    } else {
      bodyHtml = `${stepsHtml}${urlHtml}${memoHtml}`;
    }

    dom.detailModalTitle.textContent = recipe.name;
    dom.detailContent.innerHTML = `
      ${heroHtml}
      <div class="detail-header">
        <h3 class="detail-title">${escapeHtml(recipe.name)}</h3>
        <div class="detail-actions">
          <button class="btn-icon" data-action="edit" aria-label="編集">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" data-action="delete" aria-label="削除">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="detail-meta">${metaBadges}</div>
      ${bodyHtml}
    `;

    // Bind detail actions
    const editBtn = dom.detailContent.querySelector('[data-action="edit"]');
    const deleteBtn = dom.detailContent.querySelector('[data-action="delete"]');

    editBtn.addEventListener('click', () => {
      closeModal(dom.detailModal);
      setTimeout(() => openFormModal(recipe.id), 300);
    });

    deleteBtn.addEventListener('click', () => {
      showConfirm('このレシピを削除しますか？', `「${recipe.name}」を削除します。この操作は元に戻せません。`, () => {
        closeModal(dom.detailModal);
        deleteRecipe(recipe.id);
      });
    });

    // --- Servings scaling (sync both desktop sidebar and mobile panel) ---
    if (baseServings && hasIngredients) {
      const allServingsBtns = dom.detailContent.querySelectorAll('[data-action="servings-dec"], [data-action="servings-inc"]');

      const updateScaling = () => {
        const valueEls = dom.detailContent.querySelectorAll('.detail-servings__value');
        const noteEls = dom.detailContent.querySelectorAll('.detail-servings__note');
        const amountEls = dom.detailContent.querySelectorAll('.detail-ingredient-amount');

        valueEls.forEach(el => el.textContent = `${currentServings}人分`);
        noteEls.forEach(el => el.style.display = currentServings !== baseServings ? 'inline' : 'none');

        const ratio = currentServings / baseServings;
        amountEls.forEach(el => {
          const baseAmount = el.getAttribute('data-base-amount');
          el.textContent = ratio === 1 ? baseAmount : scaleAmount(baseAmount, ratio);
        });

        dom.detailContent.querySelectorAll('.detail-ingredients').forEach(ul => {
          ul.classList.toggle('detail-ingredients--scaled', ratio !== 1);
        });
      };

      allServingsBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-action');
          if (action === 'servings-dec' && currentServings > 1) {
            currentServings--;
            updateScaling();
          } else if (action === 'servings-inc' && currentServings < 99) {
            currentServings++;
            updateScaling();
          }
        });
      });
    }

    // --- Mobile ingredients panel ---
    const fab = dom.detailContent.querySelector('#detailFabIngredients');
    const panel = dom.detailContent.querySelector('#detailIngredientsPanel');
    const backdrop = dom.detailContent.querySelector('#detailPanelBackdrop');
    const panelClose = dom.detailContent.querySelector('#detailPanelClose');

    if (fab && panel && backdrop) {
      const openPanel = () => {
        panel.classList.add('open');
        backdrop.classList.add('open');
        fab.style.display = 'none';
      };
      const closePanel = () => {
        panel.classList.remove('open');
        backdrop.classList.remove('open');
        // Restore FAB after animation
        setTimeout(() => {
          if (!panel.classList.contains('open')) {
            fab.style.display = '';
          }
        }, 300);
      };

      fab.addEventListener('click', openPanel);
      backdrop.addEventListener('click', closePanel);
      if (panelClose) panelClose.addEventListener('click', closePanel);
    }

    openModal(dom.detailModal);
  }

  // ============================================
  // MODAL HELPERS
  // ============================================
  function openModal(overlay) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Reset scroll positions of all potential scroll containers inside the modal overlay
    resetModalScroll(overlay);
    setTimeout(() => resetModalScroll(overlay), 50);
    setTimeout(() => resetModalScroll(overlay), 150);
  }

  function resetModalScroll(overlay) {
    overlay.scrollTop = 0;
    const modal = overlay.querySelector('.modal');
    if (modal) modal.scrollTop = 0;
    const modalBody = overlay.querySelector('.modal__body');
    if (modalBody) modalBody.scrollTop = 0;
    const form = overlay.querySelector('form');
    if (form) form.scrollTop = 0;
  }

  function closeModal(overlay) {
    overlay.classList.remove('open');
    // Only restore scroll if no other modals open
    const anyOpen = document.querySelector('.modal-overlay.open');
    if (!anyOpen) {
      document.body.style.overflow = '';
    }
  }

  function showConfirm(title, text, onOk) {
    dom.confirmTitle.textContent = title;
    dom.confirmText.textContent = text;
    confirmCallback = onOk;
    openModal(dom.confirmModal);
  }

  // ============================================
  // TOAST
  // ============================================
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease-out forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ============================================
  // EXPORT / IMPORT
  // ============================================
  function exportData() {
    if (recipes.length === 0) {
      showToast('⚠️ エクスポートするレシピがありません', 'error');
      return;
    }

    const data = {
      app: 'RecipeBox',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      recipes: recipes
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `recipebox_${formatDate(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('📤 データをエクスポートしました');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        let imported = [];

        if (data.app === 'RecipeBox' && Array.isArray(data.recipes)) {
          imported = data.recipes;
        } else if (Array.isArray(data)) {
          imported = data;
        } else {
          showToast('⚠️ 無効なファイル形式です', 'error');
          return;
        }

        // Merge: skip duplicates by ID
        const existingIds = new Set(recipes.map(r => r.id));
        let addedCount = 0;

        imported.forEach(recipe => {
          if (!existingIds.has(recipe.id)) {
            recipes.push(recipe);
            addedCount++;
          }
        });

        saveRecipes();
        renderRecipes();

        if (addedCount > 0) {
          showToast(`📥 ${addedCount}件のレシピをインポートしました`);
        } else {
          showToast('すべてのレシピは既に存在しています');
        }
      } catch {
        showToast('⚠️ ファイルの読み込みに失敗しました', 'error');
      }
    };
    reader.readAsText(file);
  }

  function deleteAllRecipes() {
    const ids = recipes.map(r => r.id);
    const deletedIds = JSON.parse(localStorage.getItem('recipebox_deleted_ids') || '[]');
    ids.forEach(id => {
      if (!deletedIds.includes(id)) deletedIds.push(id);
    });
    localStorage.setItem('recipebox_deleted_ids', JSON.stringify(deletedIds));

    recipes = [];
    saveRecipes();
    renderRecipes();
    showToast('🗑️ すべてのレシピを削除しました');
    if (gdriveAccessToken) syncWithGDrive(true);
  }

  // ============================================
  // GOOGLE DRIVE SYNC
  // ============================================
  const GDRIVE_FILE_NAME = 'recipebox_data.json';
  let gdriveAccessToken = null;
  let gdriveClientId = null;

  let tokenClient = null;

  function initGDrive() {
    gdriveClientId = localStorage.getItem('recipebox_gdrive_client_id') || '';
    dom.googleClientId.value = gdriveClientId;

    const token = localStorage.getItem('recipebox_gdrive_token');
    const expiry = localStorage.getItem('recipebox_gdrive_token_expiry');

    if (token && expiry && Date.now() < parseInt(expiry, 10)) {
      gdriveAccessToken = token;
      setGDriveStatus('connected', 'Google ドライブと同期中');
      
      // Auto sync on start
      syncWithGDrive(true); // silent
    } else {
      gdriveAccessToken = null;
      setGDriveStatus('disconnected', '接続していません');
    }

    if (gdriveClientId) {
      initTokenClient();
    }
  }

  function initTokenClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      setTimeout(initTokenClient, 250);
      return;
    }
    
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: gdriveClientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (tokenResponse) => {
        if (tokenResponse.error !== undefined) {
          console.error(tokenResponse);
          setGDriveStatus('error', '⚠️ ログイン認証に失敗しました');
          showToast('⚠️ Google認証に失敗しました', 'error');
          return;
        }

        const accessToken = tokenResponse.access_token;
        const expiresSeconds = tokenResponse.expires_in || 3600;
        const expiryTime = Date.now() + expiresSeconds * 1000;

        localStorage.setItem('recipebox_gdrive_token', accessToken);
        localStorage.setItem('recipebox_gdrive_token_expiry', expiryTime);
        gdriveAccessToken = accessToken;

        setGDriveStatus('connected', 'Google ドライブと同期中');
        showToast('☁️ Googleドライブと接続しました！');

        syncWithGDrive();
      },
    });
  }

  function setGDriveStatus(status, text) {
    dom.gdriveStatus.style.display = 'flex';
    dom.gdriveStatus.className = 'gdrive-status';
    dom.gdriveStatusText.textContent = text;

    if (status === 'connected') {
      dom.gdriveStatus.classList.add('gdrive-status--connected');
      dom.btnConnectGDrive.style.display = 'none';
      dom.btnSyncNow.style.display = 'block';
      dom.btnDisconnectGDrive.style.display = 'block';
      dom.googleClientId.disabled = true;
    } else if (status === 'disconnected') {
      dom.gdriveStatus.style.display = 'none';
      dom.btnConnectGDrive.style.display = 'block';
      dom.btnSyncNow.style.display = 'none';
      dom.btnDisconnectGDrive.style.display = 'none';
      dom.googleClientId.disabled = false;
    } else if (status === 'error') {
      dom.gdriveStatus.classList.add('gdrive-status--error');
      dom.btnConnectGDrive.style.display = 'block';
      dom.btnSyncNow.style.display = 'none';
      dom.btnDisconnectGDrive.style.display = 'none';
      dom.googleClientId.disabled = false;
    } else if (status === 'syncing') {
      dom.gdriveStatus.classList.add('gdrive-status--connected');
      dom.btnConnectGDrive.style.display = 'none';
      dom.btnSyncNow.style.display = 'block';
      dom.btnSyncNow.disabled = true;
      dom.btnDisconnectGDrive.style.display = 'block';
      dom.googleClientId.disabled = true;
    }
  }

  function connectGDrive() {
    const clientId = dom.googleClientId.value.trim();
    if (!clientId) {
      showToast('⚠️ OAuth クライアントIDを入力してください', 'error');
      dom.googleClientId.focus();
      return;
    }
    localStorage.setItem('recipebox_gdrive_client_id', clientId);
    gdriveClientId = clientId;

    initTokenClient();

    // Trigger request access token popup
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      // Wait slightly if GSI wasn't fully initialized yet
      setTimeout(() => {
        if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' });
      }, 300);
    }
  }

  function disconnectGDrive() {
    localStorage.removeItem('recipebox_gdrive_token');
    localStorage.removeItem('recipebox_gdrive_token_expiry');
    gdriveAccessToken = null;
    setGDriveStatus('disconnected', '接続を解除しました');
    showToast('☁️ Googleドライブの接続を解除しました');
  }

  function handleOAuthCallback() {
    // Staging or redirects not needed with GIS popup client,
    // keeping as empty stub to prevent references from throwing.
  }

  async function syncWithGDrive(silent = false) {
    if (!gdriveAccessToken) return;

    if (!silent) {
      setGDriveStatus('syncing', '同期中...');
      dom.btnSyncNow.disabled = true;
    }

    try {
      // 1. Search for file
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${GDRIVE_FILE_NAME}' and trashed=false&fields=files(id,name)&spaces=drive`,
        {
          headers: {
            'Authorization': `Bearer ${gdriveAccessToken}`
          }
        }
      );

      if (!searchRes.ok) {
        if (searchRes.status === 401) {
          // Token expired
          disconnectGDrive();
          if (!silent) showToast('⚠️ セッションが切れました。再接続してください。', 'error');
          return;
        }
        throw new Error('Search failed');
      }

      const searchData = await searchRes.json();
      const file = searchData.files && searchData.files[0];

      let driveRecipes = [];
      let driveDeletedIds = [];
      let fileId = null;

      if (file) {
        fileId = file.id;
        // 2. File exists, download it
        const downloadRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          {
            headers: {
              'Authorization': `Bearer ${gdriveAccessToken}`
            }
          }
        );

        if (downloadRes.ok) {
          const cloudData = await downloadRes.json();
          driveRecipes = cloudData.recipes || [];
          driveDeletedIds = cloudData.deletedIds || [];
        }
      }

      // Merge deleted IDs (Local + Cloud)
      const localDeletedIds = JSON.parse(localStorage.getItem('recipebox_deleted_ids') || '[]');
      const mergedDeletedIds = Array.from(new Set([...localDeletedIds, ...driveDeletedIds]));
      localStorage.setItem('recipebox_deleted_ids', JSON.stringify(mergedDeletedIds));

      // 3. Merge recipes (Local + Cloud) and filter out deleted ones
      const mergedRecipes = mergeRecipeLists(recipes, driveRecipes)
        .filter(r => !mergedDeletedIds.includes(r.id));

      // 4. Update local state
      recipes = mergedRecipes;
      saveRecipes();
      renderRecipes();

      // 5. Upload back to GDrive (Create or Update)
      const uploadData = {
        app: 'RecipeBox',
        version: '1.0',
        updatedAt: new Date().toISOString(),
        recipes: recipes,
        deletedIds: mergedDeletedIds
      };

      let uploadRes;
      if (fileId) {
        // Update content (PATCH request)
        uploadRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${gdriveAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(uploadData)
          }
        );
      } else {
        // Create new file (Multipart POST request to include metadata name)
        const metadata = {
          name: GDRIVE_FILE_NAME,
          mimeType: 'application/json'
        };

        const boundary = 'foo_bar_baz';
        const body = [
          `--${boundary}`,
          'Content-Type: application/json; charset=UTF-8',
          '',
          JSON.stringify(metadata),
          `--${boundary}`,
          'Content-Type: application/json',
          '',
          JSON.stringify(uploadData),
          `--${boundary}--`
        ].join('\r\n');

        uploadRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${gdriveAccessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: body
          }
        );
      }

      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }

      setGDriveStatus('connected', '同期完了');
      if (!silent) showToast('☁️ Googleドライブと同期しました');
      
      // Auto restore status text after 5s
      setTimeout(() => {
        if (gdriveAccessToken) {
          setGDriveStatus('connected', 'Google ドライブと同期中');
        }
      }, 5000);

    } catch (err) {
      console.error(err);
      setGDriveStatus('error', '⚠️ 同期エラーが発生しました');
      if (!silent) showToast('⚠️ 同期中にエラーが発生しました', 'error');
    } finally {
      dom.btnSyncNow.disabled = false;
    }
  }

  // Helper to merge local and cloud recipe data (Newest updatedAt wins)
  function mergeRecipeLists(local, cloud) {
    const map = new Map();

    // Load cloud recipes into map
    cloud.forEach(r => {
      if (r.id) map.set(r.id, r);
    });

    // Merge local recipes
    local.forEach(localR => {
      if (!localR.id) return;
      const cloudR = map.get(localR.id);
      if (cloudR) {
        const localTime = localR.updatedAt || localR.createdAt || 0;
        const cloudTime = cloudR.updatedAt || cloudR.createdAt || 0;
        if (localTime > cloudTime) {
          map.set(localR.id, localR);
        }
      } else {
        map.set(localR.id, localR);
      }
    });

    return Array.from(map.values());
  }

  // ============================================
  // UTILITIES
  // ============================================
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  function scaleAmount(amountStr, ratio) {
    if (!amountStr) return '';
    // Replace all numeric values (integers, decimals, fractions) in the string
    return amountStr.replace(/(\d+\.?\d*)/g, (match) => {
      const num = parseFloat(match);
      const scaled = num * ratio;
      // Format nicely: remove unnecessary decimals
      if (Number.isInteger(scaled)) return String(scaled);
      if (scaled < 10) return scaled.toFixed(1).replace(/\.0$/, '');
      return Math.round(scaled).toString();
    });
  }

  // ============================================
  // EVENT BINDINGS
  // ============================================
  function bindEvents() {
    // Theme toggle
    dom.btnToggleTheme.addEventListener('click', toggleTheme);

    // Add recipe
    dom.btnAddRecipe.addEventListener('click', () => openFormModal());

    // Search
    dom.searchInput.addEventListener('input', () => {
      searchQuery = dom.searchInput.value;
      dom.searchClear.style.display = searchQuery ? 'flex' : 'none';
      renderRecipes();
    });

    dom.searchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      searchQuery = '';
      dom.searchClear.style.display = 'none';
      dom.searchInput.focus();
      renderRecipes();
    });

    // Category tabs
    dom.categoryTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.category-tab');
      if (!tab) return;

      $$('.category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeCategory = tab.dataset.category;
      renderRecipes();
    });

    // Form modal
    dom.formModalClose.addEventListener('click', () => closeModal(dom.formModal));
    dom.btnCancelForm.addEventListener('click', () => closeModal(dom.formModal));

    dom.recipeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = collectFormData();
      if (!validateForm(data)) return;
      saveRecipe(data);
      closeModal(dom.formModal);
    });

    dom.btnAddIngredient.addEventListener('click', () => addIngredientRow());
    dom.btnAddIngredientGroup.addEventListener('click', () => addIngredientGroup('', []));
    dom.btnAddStep.addEventListener('click', () => addStepRow());

    // URL Auto-Import
    dom.btnFetchUrl.addEventListener('click', async () => {
      const url = dom.importUrlInput.value.trim();
      if (!url) {
        showToast('⚠️ URLを入力してください', 'error');
        dom.importUrlInput.focus();
        return;
      }
      try {
        new URL(url);
      } catch {
        showToast('⚠️ 有効なURLを入力してください', 'error');
        dom.importUrlInput.focus();
        return;
      }

      dom.btnFetchUrl.disabled = true;
      const data = await fetchRecipeFromUrl(url);
      dom.btnFetchUrl.disabled = false;

      if (data) {
        applyFetchedData(data);
      }
    });

    // Also trigger fetch on Enter key in URL input
    dom.importUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        dom.btnFetchUrl.click();
      }
    });

    // Photo
    dom.photoUpload.addEventListener('click', (e) => {
      if (e.target.closest('.photo-upload__remove')) return;
      dom.photoInput.click();
    });
    dom.photoInput.addEventListener('change', handlePhotoSelect);
    dom.photoRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      clearPhoto();
    });

    // Detail modal
    dom.detailModalClose.addEventListener('click', () => closeModal(dom.detailModal));

    // Settings
    dom.btnSettings.addEventListener('click', () => openModal(dom.settingsModal));
    dom.settingsClose.addEventListener('click', () => closeModal(dom.settingsModal));

    dom.btnExport.addEventListener('click', () => {
      exportData();
      closeModal(dom.settingsModal);
    });

    dom.btnImport.addEventListener('click', () => dom.importInput.click());
    dom.importInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        importData(e.target.files[0]);
        closeModal(dom.settingsModal);
        e.target.value = '';
      }
    });

    dom.btnDeleteAll.addEventListener('click', () => {
      showConfirm(
        'すべてのレシピを削除しますか？',
        'この操作は元に戻せません。事前にエクスポートすることをお勧めします。',
        () => {
          deleteAllRecipes();
          closeModal(dom.settingsModal);
        }
      );
    });

    // Google Drive Sync
    dom.btnConnectGDrive.addEventListener('click', connectGDrive);
    dom.btnDisconnectGDrive.addEventListener('click', disconnectGDrive);
    dom.btnSyncNow.addEventListener('click', () => syncWithGDrive());

    // Confirm dialog
    dom.confirmCancel.addEventListener('click', () => {
      closeModal(dom.confirmModal);
      confirmCallback = null;
    });

    dom.confirmOk.addEventListener('click', () => {
      closeModal(dom.confirmModal);
      if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
      }
    });

    // Close modals on overlay click
    [dom.formModal, dom.detailModal, dom.settingsModal, dom.confirmModal].forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay);
      });
    });

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modals = [dom.confirmModal, dom.formModal, dom.detailModal, dom.settingsModal];
        for (const m of modals) {
          if (m.classList.contains('open')) {
            closeModal(m);
            break;
          }
        }
      }
    });
  }

  // ============================================
  // SERVICE WORKER
  // ============================================
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // ============================================
  // INIT
  // ============================================
  function init() {
    initTheme();
    loadRecipes();
    renderRecipes();
    bindEvents();
    registerSW();
    initGDrive();
    handleOAuthCallback();
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
