// ==================== NAVEGACIÓN CON TECLADO (TABS + FILAS) ====================
(function() {
    // Estado para las filas de películas
    let currentCategoryIndex = 0;
    let currentCardIndex = 0;
    let positionsByRow = {};

    // ---- Funciones para las pestañas (tabs) ----
    function getTabButtons() {
        return Array.from(document.querySelectorAll('.tab-btn'));
    }

    function getCurrentTabIndex() {
        const tabs = getTabButtons();
        const focused = document.activeElement;
        if (focused && focused.classList.contains('tab-btn')) {
            return tabs.indexOf(focused);
        }
        // Si no hay foco en un tab, usar el que tiene la clase active
        const activeTab = document.querySelector('.tab-btn.active');
        return activeTab ? tabs.indexOf(activeTab) : 0;
    }

    function focusTab(index) {
        const tabs = getTabButtons();
        if (tabs.length === 0) return;
        if (index < 0) index = 0;
        if (index >= tabs.length) index = tabs.length - 1;
        tabs[index].focus();
    }

    // Selecciona el tab que actualmente tiene el foco (no el activo)
    function selectCurrentTab() {
        const focused = document.activeElement;
        if (focused && focused.classList.contains('tab-btn')) {
            // Disparar el clic, que internamente llamará a switchTab
            focused.click();
        } else {
            // Fallback: clic en el tab activo
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) activeTab.click();
        }
    }

    // ---- Funciones para las filas de películas (igual que antes) ----
    function getCurrentCategories() {
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return [];
        return Array.from(activeTab.querySelectorAll('.category'));
    }

    function getCurrentCards() {
        const categories = getCurrentCategories();
        if (categories.length === 0) return [];
        const currentRow = categories[currentCategoryIndex]?.querySelector('.row');
        return currentRow ? Array.from(currentRow.querySelectorAll('.movie')) : [];
    }

    function saveCurrentPosition() {
        const categories = getCurrentCategories();
        if (categories.length === 0) return;
        const currentCategory = categories[currentCategoryIndex];
        if (!currentCategory) return;
        const rowId = currentCategory.getAttribute('data-category-id') || `cat-${currentCategoryIndex}`;
        positionsByRow[rowId] = { categoryIndex: currentCategoryIndex, cardIndex: currentCardIndex };
    }

    function restorePositionForCategory(categoryIndex) {
        const categories = getCurrentCategories();
        if (categoryIndex >= categories.length) return false;
        const category = categories[categoryIndex];
        const rowId = category.getAttribute('data-category-id') || `cat-${categoryIndex}`;
        const saved = positionsByRow[rowId];
        if (saved) {
            currentCategoryIndex = saved.categoryIndex;
            currentCardIndex = saved.cardIndex;
            return true;
        }
        return false;
    }

    function focusCard(index) {
        const cards = getCurrentCards();
        if (cards.length === 0) return;
        if (index < 0) index = 0;
        if (index >= cards.length) index = cards.length - 1;
        currentCardIndex = index;
        const card = cards[currentCardIndex];
        card.focus();
        saveCurrentPosition();
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        const categories = getCurrentCategories();
        if (categories[currentCategoryIndex]) {
            categories[currentCategoryIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function changeCategory(delta) {
        const categories = getCurrentCategories();
        if (categories.length === 0) return;
        saveCurrentPosition();
        let newIndex = currentCategoryIndex + delta;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= categories.length) newIndex = categories.length - 1;
        if (newIndex === currentCategoryIndex) return;
        const restored = restorePositionForCategory(newIndex);
        if (!restored) {
            currentCategoryIndex = newIndex;
            currentCardIndex = 0;
        }
        focusCard(currentCardIndex);
    }

    function focusFirstCard() {
        const categories = getCurrentCategories();
        if (categories.length === 0) return false;
        const restored = restorePositionForCategory(0);
        if (!restored) {
            currentCategoryIndex = 0;
            currentCardIndex = 0;
        }
        const cards = getCurrentCards();
        if (cards.length > 0) {
            focusCard(currentCardIndex);
            return true;
        }
        return false;
    }

    function focusTabs() {
        const tabs = getTabButtons();
        if (tabs.length > 0) {
            // Enfocar el tab que está activo actualmente
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) activeTab.focus();
            else tabs[0].focus();
        }
    }

    function isFocusOnTabs() {
        const active = document.activeElement;
        return active && active.classList && active.classList.contains('tab-btn');
    }

    // ---- Evento principal de teclado ----
    document.addEventListener('keydown', (e) => {
        const playerFullscreen = document.getElementById('player-fullscreen');
        

        const isTabFocused = isFocusOnTabs();
        const cards = getCurrentCards();
        const hasCards = cards.length > 0;

        // --- Navegación de pestañas cuando el foco está en los tabs ---
        if (isTabFocused) {
            const tabs = getTabButtons();
            let currentIdx = getCurrentTabIndex();
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    if (currentIdx > 0) focusTab(currentIdx - 1);
                    else focusTab(tabs.length - 1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (currentIdx < tabs.length - 1) focusTab(currentIdx + 1);
                    else focusTab(0);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    // Bajar a la primera tarjeta de la primera fila
                    if (hasCards) {
                        focusFirstCard();
                    }
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    selectCurrentTab();
                    break;
                default:
                    break;
            }
            return;
        }

        // --- Navegación de películas/series cuando el foco está en las tarjetas o en ninguna parte ---
        if (hasCards) {
            // Si no hay foco en tarjeta, enfocar la primera (por si acaso)
            if (!document.activeElement.classList?.contains('movie')) {
                focusFirstCard();
                return;
            }

            switch (e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    if (currentCardIndex < cards.length - 1) {
                        currentCardIndex++;
                        focusCard(currentCardIndex);
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (currentCardIndex > 0) {
                        currentCardIndex--;
                        focusCard(currentCardIndex);
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    changeCategory(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    // Si estamos en la primera fila, subir a los tabs
                    if (currentCategoryIndex === 0) {
                        focusTabs();
                    } else {
                        changeCategory(-1);
                    }
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (cards[currentCardIndex]) cards[currentCardIndex].click();
                    break;
                default:
                    break;
            }
        } else {
            // No hay tarjetas: permitir navegación de tabs igualmente
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
                focusTabs();
            }
        }
    });

    // Inicialización: cuando se carguen las categorías, enfocar primera tarjeta o si no, enfocar tabs
    const observer = new MutationObserver(() => {
        if (focusFirstCard()) {
            observer.disconnect();
        } else {
            const tabs = getTabButtons();
            if (tabs.length > 0 && !document.activeElement?.classList?.contains('tab-btn')) {
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab) activeTab.focus();
                else tabs[0].focus();
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('load', () => {
        setTimeout(() => {
            if (!focusFirstCard()) {
                const tabs = getTabButtons();
                if (tabs.length > 0 && !document.activeElement?.classList?.contains('tab-btn')) {
                    const activeTab = document.querySelector('.tab-btn.active');
                    if (activeTab) activeTab.focus();
                    else tabs[0].focus();
                }
            }
        }, 500);
    });
})();