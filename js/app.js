// ==================== CONSTANTES GLOBALES ====================
let moreResultsState = null;
let currentMovieData = null;
let trailerTimeout = null;
let currentTrailerId = null;
let infoFadeTimer = null;
let isInfoVisible = true;
let isMovieMode = false; // true cuando se está viendo una película, false para series/anime
let lastInfoData = null; // Guarda los datos de la última información mostrada
let currentSearchFilter = 'movie'; // 'movie', 'tv', 'anime'
let backButtonTimer = null;
let isPlayerControlsVisible = true;
let infiniteObserver = null;
let loadedResultIds = new Set();
let recentExpandedElement = null;
let expandedCard = null;
let searchDashboardVisible = true;  // true = mostrar dashboard, false = mostrar resultados
// Al principio de app.js
const animeInfoCache = {};
// Estado de los carruseles (cada uno con su propio índice, intervalo y slides)
const carouselState = {};
let loadedCarousels = {};
const API_KEY = "73de3bc08df97d70e1cb81ad38422c03";
// Variables para controlar los listeners globales del reproductor
let globalPlayerListenersAdded = false;
let genreMapMovie = {};
let genreMapTv = {};
let currentTab = 'inicio';
let currentModalData = null; // { tmdbId, mediaType, title, seasons, episodes, ... }
let currentSeason = null;
let currentEpisode = null;
let isPlayerVisible = false; // si el iframe está visible
let isBannerVisible = true;
const bannerStates = {};


// ===== ACTUALIZAR BANNER (SOLO FONDO Y LOGO) =====
function updatePlayerBanner(data) {
    const backdrop = document.getElementById('player-banner-backdrop');
    const logoImg = document.getElementById('player-banner-logo');

    // Fondo
    if (data.background) {
        backdrop.style.backgroundImage = `url('${data.background}')`;
    } else if (data.posterPath) {
        backdrop.style.backgroundImage = `url('${data.posterPath}')`;
    } else {
        backdrop.style.backgroundImage = 'none';
        backdrop.style.backgroundColor = '#1a1a2e';
    }

    // Logo
    if (data.titleImage) {
        logoImg.src = data.titleImage;
        logoImg.style.display = 'block';
    } else {
        logoImg.style.display = 'none';
    }
}

// ===== ACTUALIZAR INFORMACIÓN COMPACTA (TÍTULO, METADATOS, BOTONES) =====
function updatePlayerInfo(data) {
    // Título
    const titleEl = document.getElementById('player-title');
    if (titleEl) {
        let displayTitle = data.title || 'Sin título';
        const isSeries = (data.mediaType === 'tv' || data.mediaType === 'anime');
        if (isSeries && currentSeason !== null && currentEpisode !== null) {
            displayTitle = `${displayTitle} - T${currentSeason} E${currentEpisode}`;
        }
        titleEl.textContent = displayTitle;
    }

    // Sinopsis
    const synopsisEl = document.getElementById('player-synopsis');
    if (synopsisEl) {
        synopsisEl.textContent = data.overview || 'Sin sinopsis disponible';
    }

    // --- Metadatos con separadores ---
    const metaContainer = document.getElementById('player-meta');
    if (!metaContainer) return;

    let parts = [];

    // Año
    if (data.year) {
        parts.push(`<span class="player-year">${data.year}</span>`);
    }

    // Duración o episodios
    if (data.duration) {
        parts.push(`<span class="player-duration">${data.duration}</span>`);
    }

    // Género (primer género o todos)
    let genreText = data.genre || '';
    // Si no hay genre en data pero hay genreIds, intentar obtenerlos
    if (!genreText && data.genreIds) {
        const genreNames = getGenreNamesFromIds(data.genreIds, data.mediaType);
        if (genreNames) {
            genreText = genreNames.split(',')[0]; // Tomar el primero
        }
    }
    if (genreText) {
        parts.push(`<span class="player-genre">${genreText}</span>`);
    }

    // Episodio (solo si es serie y está seleccionado)
    if (currentSeason !== null && currentEpisode !== null) {
        parts.push(`<span class="player-episode" id="player-info-episode">T${currentSeason} E${currentEpisode}</span>`);
    }

    // Unir con separadores
    const separator = '<span class="meta-separator">∣</span>';
    metaContainer.innerHTML = parts.join(separator);

    // Botones
    updatePlayerFavButton();
    updatePlayButtonText();
}

// ===== BOTÓN DE FAVORITOS (NUEVO ID) =====
function updatePlayerFavButton() {
    const favBtn = document.getElementById('player-fav-btn');
    if (!favBtn || !currentModalData) return;
    const tmdbId = currentModalData.tmdbId;
    const mediaType = currentModalData.mediaType;
    const title = currentModalData.title;
    const isFav = isFavorite(tmdbId, mediaType, title);
    favBtn.textContent = isFav ? '✓' : '+';
    favBtn.classList.toggle('active', isFav);
}

// ===== BOTÓN DE REPRODUCCIÓN (NUEVO ID) =====
function updatePlayButtonText() {
    const playBtn = document.getElementById('player-play-btn-main');
    if (!playBtn || !currentModalData) return;
    const { tmdbId, mediaType, title } = currentModalData;
    const progress = getProgress(tmdbId, mediaType);

    if (mediaType === 'movie') {
        playBtn.textContent = (progress && progress.watched) ? '▶ Continuar viendo' : '▶ Reproducir';
    } else if (mediaType === 'tv' || mediaType === 'anime') {
        // Si hay un episodio seleccionado (currentSeason y currentEpisode no son null)
        if (currentSeason !== null && currentEpisode !== null) {
            // Verificar si el progreso coincide con este episodio
            if (progress && progress.season === currentSeason && progress.episode === currentEpisode) {
                playBtn.textContent = `▶ Continuar (T${currentSeason} E${currentEpisode})`;
            } else {
                playBtn.textContent = `▶ Ver capítulo ${currentEpisode}`;
            }
        } else {
            // No hay episodio seleccionado (puede pasar si no se cargaron aún)
            if (progress && progress.season !== undefined && progress.episode !== undefined) {
                playBtn.textContent = `▶ Continuar (T${progress.season} E${progress.episode})`;
            } else {
                playBtn.textContent = '▶ Reproducir';
            }
        }
    }
}
function loadBannerCarousel(containerId, slidesData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (slidesData.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    // Inicializar estado para este contenedor
    if (!bannerStates[containerId]) {
        bannerStates[containerId] = {
            currentIndex: 0,
            slides: [],
            interval: null,
            isTransitioning: false
        };
    }
    const state = bannerStates[containerId];
    state.slides = slidesData;
    state.currentIndex = 0;

    // Limpiar track
    const track = container.querySelector('.banner-track');
    track.innerHTML = '';

    // Crear slides
    slidesData.forEach((item, index) => {
        const slide = document.createElement('div');
        slide.className = 'banner-slide';
        slide.dataset.index = index;
        // Fondo
        if (item.background) {
            slide.style.backgroundImage = `url('${item.background}')`;
        } else {
            // Si no hay fondo, usar un color oscuro por defecto
            slide.style.backgroundColor = '#1a1a2e';
        }
        
        // Título (imagen o texto)
        if (item.titleImage) {
            const img = document.createElement('img');
            img.src = item.titleImage;
            img.alt = item.title;
            img.className = 'banner-title-img';
            slide.appendChild(img);
        } else {
            const titleDiv = document.createElement('div');
            titleDiv.className = 'banner-title-text';
            titleDiv.textContent = item.title;
            slide.appendChild(titleDiv);
        }
        
        slide.addEventListener('click', () => {
            if (item.tmdbId && item.mediaType) {
                const data = {
                    tmdbId: item.tmdbId,
                    mediaType: item.mediaType,
                    title: item.title,
                    originalLang: item.originalLang || 'es',
                    posterPath: item.posterPath || '',
                    year: item.year || '',
                    duration: item.duration || '',
                    overview: item.overview || ''
                };
                openPlayerModal(data);
            }
        });
        track.appendChild(slide);
    });

    // Actualizar posiciones
    updateBannerSlides(containerId);

    // Dots
    const dotsContainer = container.querySelector('.banner-dots');
    dotsContainer.innerHTML = '';
    slidesData.forEach((_, idx) => {
        const dot = document.createElement('span');
        dot.className = 'banner-dot' + (idx === 0 ? ' active' : '');
        dot.addEventListener('click', () => goToBannerSlide(containerId, idx));
        dotsContainer.appendChild(dot);
    });

    // Controles
    const prevBtn = container.querySelector('.banner-prev');
    const nextBtn = container.querySelector('.banner-next');
    // Remover listeners antiguos (clonar o usar event listeners con referencia)
    // Para simplificar, usamos funciones anónimas y las reemplazamos cada vez.
    prevBtn.onclick = () => prevBannerSlide(containerId);
    nextBtn.onclick = () => nextBannerSlide(containerId);

    // Iniciar rotación automática
    startBannerAutoPlay(containerId);
}

function updateBannerSlides(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const slides = container.querySelectorAll('.banner-slide');
    const total = slides.length;
    const state = bannerStates[containerId];
    if (!state) return;
    const current = state.currentIndex;

    slides.forEach((slide, index) => {
        slide.classList.remove('active', 'left', 'right', 'left-far', 'right-far');
        let diff = (index - current + total) % total;
        if (diff === 0) {
            slide.classList.add('active');
        } else if (diff === 1) {
            slide.classList.add('right');
        } else if (diff === total - 1) {
            slide.classList.add('left');
        } else if (diff === 2 || diff === 3) {
            slide.classList.add('right-far');
        } else {
            slide.classList.add('left-far');
        }
    });

    // Actualizar dots
    const dots = container.querySelectorAll('.banner-dot');
    dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === current);
    });
}

function goToBannerSlide(containerId, index) {
    const state = bannerStates[containerId];
    if (!state) return;
    if (state.isTransitioning) return;
    if (index === state.currentIndex) return;
    state.isTransitioning = true;
    state.currentIndex = index;
    updateBannerSlides(containerId);
    setTimeout(() => {
        state.isTransitioning = false;
    }, 600);
    resetBannerAutoPlay(containerId);
}

function nextBannerSlide(containerId) {
    const state = bannerStates[containerId];
    if (!state) return;
    const total = state.slides.length;
    const next = (state.currentIndex + 1) % total;
    goToBannerSlide(containerId, next);
}

function prevBannerSlide(containerId) {
    const state = bannerStates[containerId];
    if (!state) return;
    const total = state.slides.length;
    const prev = (state.currentIndex - 1 + total) % total;
    goToBannerSlide(containerId, prev);
}

function startBannerAutoPlay(containerId) {
    const state = bannerStates[containerId];
    if (!state) return;
    if (state.interval) clearInterval(state.interval);
    state.interval = setInterval(() => {
        nextBannerSlide(containerId);
    }, 5000);
}

function resetBannerAutoPlay(containerId) {
    const state = bannerStates[containerId];
    if (!state) return;
    if (state.interval) {
        clearInterval(state.interval);
        startBannerAutoPlay(containerId);
    }
}

async function loadBannerCarouselFromTMDB(containerId, endpoint = '/movie/popular', mediaType = 'movie', fallbackEndpoint = null) {
    try {
        // Construir URL
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `https://api.themoviedb.org/3${endpoint}${separator}api_key=${API_KEY}&language=es-ES`;
        const data = await fetchWithRetry(url);
        let results = data.results || [];

        // Si es anime, filtrar para asegurar que sean japoneses y de género animación
        if (mediaType === 'tv' && endpoint.includes('discover')) {
            results = results.filter(item => 
                item.original_language === 'ja' && 
                item.genre_ids && item.genre_ids.includes(16)
            );
        }

        // Si no hay resultados y hay fallback, intentar con fallback
        if (results.length === 0 && fallbackEndpoint) {
            console.warn(`⚠️ No hay resultados para ${endpoint}, usando fallback: ${fallbackEndpoint}`);
            return loadBannerCarouselFromTMDB(containerId, fallbackEndpoint, mediaType, null);
        }

        const shuffled = results.sort(() => Math.random() - 0.5).slice(0, 10);
        const slides = [];
        for (const item of shuffled) {
            const id = item.id;
            const title = item.title || item.name;
            const originalLang = item.original_language || 'es';
            const backdrop = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : '';
            const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '';
            const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
            const overview = item.overview || '';

            // Intentar obtener logo
            let logoUrl = '';
            try {
                const imagesRes = await fetchWithRetry(`https://api.themoviedb.org/3/${mediaType}/${id}/images?api_key=${API_KEY}&include_image_language=es,en,null`);
                const logos = imagesRes.logos || [];
                let logo = logos.find(l => l.iso_639_1 === 'es') || logos.find(l => l.iso_639_1 === 'en') || logos[0];
                if (logo) logoUrl = `https://image.tmdb.org/t/p/w500${logo.file_path}`;
            } catch (e) {
                // Si falla la obtención de logos, continuar sin logo
            }

            const bgImage = backdrop || poster;

            slides.push({
                background: bgImage,
                titleImage: logoUrl,
                title: title,
                tmdbId: id,
                mediaType: mediaType,
                originalLang: originalLang,
                posterPath: poster,
                year: year,
                overview: overview,
                hasLogo: !!logoUrl
            });

            if (slides.length >= 5) break;
        }

        if (slides.length === 0) {
            // Si aún no hay slides, ocultar
            document.getElementById(containerId).style.display = 'none';
            return;
        }

        loadBannerCarousel(containerId, slides);
    } catch (error) {
        console.error('Error cargando banner carousel desde TMDB:', error);
        // Si hay fallback, intentar con él
        if (fallbackEndpoint) {
            console.warn(`⚠️ Error con ${endpoint}, usando fallback: ${fallbackEndpoint}`);
            return loadBannerCarouselFromTMDB(containerId, fallbackEndpoint, mediaType, null);
        }
        document.getElementById(containerId).style.display = 'none';
    }
}

function getRecentLabel(item) {
    if (item.mediaType === 'movie') return 'Película';
    if (item.mediaType === 'tv') return 'Serie';
    if (item.mediaType === 'anime') {
        return item.isMovie ? 'Película' : 'Anime';
    }
    return 'Desconocido';
}

async function loadGenreMaps() {
    try {
        const resMovie = await fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${API_KEY}&language=es-ES`);
        if (resMovie.ok) {
            const data = await resMovie.json();
            genreMapMovie = data.genres.reduce((acc, g) => { acc[g.id] = g.name; return acc; }, {});
        }
        const resTv = await fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${API_KEY}&language=es-ES`);
        if (resTv.ok) {
            const data = await resTv.json();
            genreMapTv = data.genres.reduce((acc, g) => { acc[g.id] = g.name; return acc; }, {});
        }
    } catch (e) {
        console.warn('Error cargando géneros', e);
    }
}

function getGenreNamesFromIds(ids, mediaType) {
    if (!ids || ids.length === 0) return '';
    const map = mediaType === 'movie' ? genreMapMovie : genreMapTv;
    return ids.map(id => map[id] || '').filter(Boolean).join(', ');
}

function addGlobalPlayerListeners() {
    if (globalPlayerListenersAdded) return;
    document.addEventListener('mousemove', onPlayerInteraction);
    document.addEventListener('click', onPlayerInteraction);
    document.addEventListener('touchstart', onPlayerInteraction);
    globalPlayerListenersAdded = true;
}

function removeGlobalPlayerListeners() {
    document.removeEventListener('mousemove', onPlayerInteraction);
    document.removeEventListener('click', onPlayerInteraction);
    document.removeEventListener('touchstart', onPlayerInteraction);
    globalPlayerListenersAdded = false;
}

function onPlayerInteraction(e) {
    // Solo actuar si el reproductor está visible y el evento ocurre dentro de él (o simplemente si está visible)
    if (playerFullscreen.style.display === 'flex') {
        showBackButton();
    }
}


// Función para mostrar el botón al interactuar
function showBackButton() {
    const backBtn = document.getElementById('back-button');
    if (backBtn) {
        backBtn.style.opacity = '1';
        backBtn.style.pointerEvents = 'auto';
    }
    isPlayerControlsVisible = true;
    resetBackButtonTimer();
}

function hideBackButton() {
    const backBtn = document.getElementById('back-button');
    if (backBtn) {
        backBtn.style.opacity = '0';
        backBtn.style.pointerEvents = 'none';
    }
    isPlayerControlsVisible = false;
}

function resetBackButtonTimer() {
    if (backButtonTimer) clearTimeout(backButtonTimer);
    backButtonTimer = setTimeout(() => {
        hideBackButton();
    }, 3000); // 3 segundos
}

// ==================== ANIME API ====================
const ANIME_API_BASE = 'https://api-anime-render.onrender.com/api/v1/anime';
const ANIME_API_KEY = 'miClaveSuperSecreta123456';

// Elementos de la ventana de información
const infoTitle = document.getElementById('info-title');
const infoDuration = document.getElementById('info-duration');
const infoYear = document.getElementById('info-year');
const infoSynopsis = document.getElementById('info-synopsis');
const infoWatchBtn = document.getElementById('info-watch-btn');

// ==================== WAKE-UP DE LA API DE ANIME ====================
async function wakeUpAnimeApi() {
    try {
        console.log('⏳ Despertando API de anime...');
        // Hacemos una petición ligera (catalog con límite 1) para activar el servidor
        const response = await fetch(`${ANIME_API_BASE}/catalog?limit=1&apiKey=${ANIME_API_KEY}`, {
            headers: { 'X-API-Key': ANIME_API_KEY }
        });
        if (response.ok) {
            console.log('✅ API de anime despierta y lista.');
        } else {
            console.warn('⚠️ No se pudo despertar la API de anime (status:', response.status, ')');
        }
    } catch (error) {
        console.warn('⚠️ Error al despertar la API de anime:', error);
    }
}

// ==================== BANNER 728x90 (HighPerformanceFormat) ====================
function insertLeaderboardBanner(container, position) {
    const bannerDiv = document.createElement('div');
    bannerDiv.style.cssText = 'position:relative; border:2px solid #ff0000; border-radius:3px; margin:12px auto; max-width:728px; background:#000000; padding:6px 6px 4px 6px;';
    
    // Etiqueta "Anuncios"
    const label = document.createElement('span');
    label.style.cssText = 'position:absolute; top:-10px; left:10px; background:#ff0000; color:#ffffff; font-size:11px; font-weight:bold; padding:0 8px; border-radius:0; line-height:20px; z-index:5;';
    label.textContent = 'Anuncios';
    bannerDiv.appendChild(label);

    // Código del anuncio (con script de HighPerformanceFormat)
    const script1 = document.createElement('script');
    script1.textContent = `
        atOptions = {
            'key' : '19cbe30c18ac6bad1fb1578de26d5617',
            'format' : 'iframe',
            'height' : 90,
            'width' : 728,
            'params' : {}
        };
    `;
    bannerDiv.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://www.highperformanceformat.com/19cbe30c18ac6bad1fb1578de26d5617/invoke.js';
    bannerDiv.appendChild(script2);

    // Insertar en la posición indicada
    if (position === 'after') {
        container.appendChild(bannerDiv);
    } else if (position === 'before') {
        container.insertBefore(bannerDiv, container.firstChild);
    }
}


// Formatea minutos a "Xh Ymin" o "Xmin"
function formatRuntime(minutes) {
    if (!minutes || minutes <= 0) return 'Duración no disponible';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
}

// Trunca la sinopsis a un párrafo (máximo ~250 palabras) sin cortar a mitad de oración
function truncateSynopsis(text, maxWords = 250) {
    if (!text) return 'Sin sinopsis disponible';
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    // Tomar las primeras maxWords palabras
    let truncated = words.slice(0, maxWords).join(' ');
    // Buscar el último punto, signo de exclamación o interrogación
    const lastPunctuation = truncated.search(/[.!?]\s*$/);
    if (lastPunctuation !== -1) {
        // Si ya termina en puntuación, devolverlo
        return truncated;
    }
    // Buscar el último punto o signo en el texto truncado
    const lastPeriodIndex = truncated.lastIndexOf('.');
    const lastExcl = truncated.lastIndexOf('!');
    const lastQuest = truncated.lastIndexOf('?');
    const lastIndex = Math.max(lastPeriodIndex, lastExcl, lastQuest);
    if (lastIndex !== -1) {
        return truncated.substring(0, lastIndex + 1);
    }
    // Si no hay puntuación, devolver con puntos suspensivos
    return truncated + '...';
}

async function fetchWithRetry(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (i === retries) throw e;
        }
    }
}

function showLoadingSpinner() {
    infoLoading.classList.remove('hidden');
    infoContentWrapper.style.display = 'none';
    infoBackdrop.style.display = 'none';
    // Ocultar también el overlay (opcional, pero lo dejamos)
    document.querySelector('.info-overlay').style.opacity = '0';
    disableMainScroll();
}

function hideLoadingSpinner() {
    infoLoading.classList.add('hidden');
    infoContentWrapper.style.display = 'flex';
    infoBackdrop.style.display = 'block';
    document.querySelector('.info-overlay').style.opacity = '1';
}

// Actualiza la visibilidad de los botones de desplazamiento de una fila
function updateRowButtons(rowElement) {
    const wrapper = rowElement.closest('.row-wrapper');
    if (!wrapper) return;
    const btnLeft = wrapper.querySelector('.scroll-btn.left');
    const btnRight = wrapper.querySelector('.scroll-btn.right');
    if (!btnLeft || !btnRight) return;
    const maxScroll = rowElement.scrollWidth - rowElement.clientWidth;
    btnLeft.style.display = (rowElement.scrollLeft > 0) ? 'flex' : 'none';
    btnRight.style.display = (rowElement.scrollLeft < maxScroll - 1) ? 'flex' : 'none';
}

function createCategoryStructure(categoryTitle, rowId) {
    const categoryDiv = document.createElement('div');
    categoryDiv.classList.add('category');
    categoryDiv.setAttribute('data-category-id', rowId);
    
    const title = document.createElement('h2');
    title.textContent = categoryTitle;
    categoryDiv.appendChild(title);
    
    const wrapper = document.createElement('div');
    wrapper.classList.add('row-wrapper');
    
    // Botón izquierdo (siempre visible excepto al inicio)
    const btnLeft = document.createElement('button');
    btnLeft.classList.add('scroll-btn', 'left');
    btnLeft.innerHTML = '‹';
    btnLeft.setAttribute('aria-label', 'Desplazar izquierda');
    wrapper.appendChild(btnLeft);
    
    const row = document.createElement('div');
    row.classList.add('row');
    row.id = rowId;
    wrapper.appendChild(row);
    
    const btnRight = document.createElement('button');
    btnRight.classList.add('scroll-btn', 'right');
    btnRight.innerHTML = '›';
    btnRight.setAttribute('aria-label', 'Desplazar derecha');
    wrapper.appendChild(btnRight);
    
    categoryDiv.appendChild(wrapper);
    
    btnLeft.addEventListener('click', () => {
        row.scrollBy({ left: -300, behavior: 'smooth' });
    });
    btnRight.addEventListener('click', () => {
        row.scrollBy({ left: 300, behavior: 'smooth' });
    });
    
    function updateButtonsVisibility() {
        const maxScroll = row.scrollWidth - row.clientWidth;
        // Izquierda visible solo si no está en el inicio
        btnLeft.style.display = (row.scrollLeft > 0) ? 'flex' : 'none';
        // Derecha visible si hay más contenido a la derecha
        btnRight.style.display = (row.scrollLeft < maxScroll - 1) ? 'flex' : 'none';
    }
    
    row.addEventListener('scroll', updateButtonsVisibility);
    window.addEventListener('resize', updateButtonsVisibility);
    // Llamar después de cargar el contenido (con un pequeño retraso)
    setTimeout(updateButtonsVisibility, 150);
    
    return categoryDiv;
}

// ==================== FILTRO DE SEGURIDAD ====================
function isSafeForAllAges(anime) {
    const title = String(anime.title || '').toLowerCase();
    const description = String(anime.description || '').toLowerCase();
    const type = String(anime.type || '').toLowerCase();

    const blockedWords = [
        'hentai', 'ecchi', '18+', 'adulto', 'xxx', 'sexo', 'desnudo', 'porno',
        'yuri', 'yaoi', 'tentáculo', 'violación', 'incesto', 'bdsm', 'loli', 'shota'
    ];

    for (let word of blockedWords) {
        if (title.includes(word) || description.includes(word) || type.includes(word)) {
            return false;
        }
    }

    if (anime.rating) {
        const rating = String(anime.rating).toLowerCase();
        if (rating.includes('r-18') || rating.includes('18+') || rating.includes('adult')) {
            return false;
        }
    }

    return true;
}


async function getTmdbIdByTitle(title) {
    try {
        const url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(title)}&language=es-ES`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data.results || data.results.length === 0) return null;
        // Buscar un resultado que sea anime (género 16) y en japonés
        for (const result of data.results) {
            // Obtener detalles para verificar géneros
            const detailUrl = `https://api.themoviedb.org/3/tv/${result.id}?api_key=${API_KEY}&language=es-ES`;
            const detailResp = await fetch(detailUrl);
            const detailData = await detailResp.json();
            const isAnime = detailData.genres?.some(g => g.id === 16) && detailData.original_language === 'ja';
            if (isAnime) {
                return result.id;
            }
        }
        // Si no encuentra anime, devolver el primer resultado
        return data.results[0]?.id || null;
    } catch (error) {
        console.warn('Error obteniendo tmdbId por título:', error);
        return null;
    }
}



// ==================== GESTIÓN DE PESTAÑAS ====================
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
let loadedTabs = {};
let scrollPositions = {};
let focusStates = {};

function switchTab(tabId) {
     currentTab = tabId;
    const currentActive = document.querySelector('.tab-content.active');
    if (currentActive) {
        const currentId = currentActive.id;
        scrollPositions[currentId] = window.scrollY;
        if (typeof currentCategoryIndex !== 'undefined' && typeof currentCardIndex !== 'undefined') {
            focusStates[currentId] = { categoryIndex: currentCategoryIndex, cardIndex: currentCardIndex };
        }
    }

    tabContents.forEach(content => content.classList.remove('active'));
    const newContent = document.getElementById(`contenido-${tabId}`);
    if (newContent) newContent.classList.add('active');

    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });

    const prevScroll = scrollPositions[`contenido-${tabId}`];
    if (prevScroll) {
        setTimeout(() => window.scrollTo(0, prevScroll), 100);
    } else {
        window.scrollTo(0, 0);
    }

    if (!loadedTabs[tabId]) {
        loadTabContent(tabId);
        loadedTabs[tabId] = true;
    } else {
        const savedFocus = focusStates[`contenido-${tabId}`];
        if (savedFocus && typeof window.setFocusFromState === 'function') {
            window.setFocusFromState(savedFocus.categoryIndex, savedFocus.cardIndex);
        }
    }

    if (tabId === 'inicio') {
            loadRecentRow();
    }

}

// ==================== FUNCIONES API ====================
async function fetchAnimeApi(endpoint) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${ANIME_API_BASE}${endpoint}${separator}apiKey=${ANIME_API_KEY}`;
    console.log('🌐 Petición a:', url); // <-- Agrega esto
    const response = await fetch(url, {
        headers: { 'X-API-Key': ANIME_API_KEY }
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Respuesta de error:', errorText); // 
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Error en la API');
    return data.data || data.results || data;
}

/**
 * Carga la información detallada de un anime desde AnimeAV1 y actualiza la tarjeta.
 * @param {HTMLElement} card - El elemento .movie de la tarjeta
 * @param {string} animeUrl - La URL del anime en AnimeAV1
 */

async function getAnimeEmbedUrl(episodeUrl) {
    if (!episodeUrl) return null;
    try {
        const data = await fetchAnimeApi(`/episode?url=${encodeURIComponent(episodeUrl)}`);
        let sources = data.streamLinks?.SUB || data.servers?.sub || [];
        if (sources.length === 0) {
            sources = data.streamLinks?.DUB || data.servers?.dub || [];
        }
        if (sources.length === 0) return null;
        const hlsSource = sources.find(s => s.server === 'HLS');
        return hlsSource ? hlsSource.url : sources[0].url;
    } catch (error) {
        console.error('Error obteniendo enlace de anime:', error);
        return null;
    }
}

function updateControlsBarBackground() {
  const bar = document.getElementById('player-controls-bar');
  if (!bar) return;
  if (isBannerVisible) {
    bar.classList.remove('solid-bg');
    bar.classList.add('absolute-bar');
  } else {
    bar.classList.add('solid-bg');
    bar.classList.remove('absolute-bar');
  }
}

// Función auxiliar para obtener detalles de la serie (temporadas y episodios)
async function getSeriesDetails(tmdbId) {
    try {
        const url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data.seasons) return null;
        // Obtener episodios de cada temporada
        const seasonPromises = data.seasons
            .filter(s => s.season_number > 0)
            .map(season => {
                return fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${API_KEY}&language=es-ES`)
                    .then(res => res.json())
                    .then(seasonData => ({
                        season_number: season.season_number,
                        episodes: seasonData.episodes || []
                    }));
            });
        const seasonsWithEpisodes = await Promise.all(seasonPromises);
        return seasonsWithEpisodes;
    } catch (error) {
        console.error('Error cargando temporadas:', error);
        return null;
    }
}

async function openPlayerModal(data) {
    const modal = document.getElementById('player-modal');
    const iframeWrapper = document.getElementById('player-iframe-wrapper');
    const iframe = document.getElementById('player-iframe');
    const loadingEl = document.getElementById('player-iframe-loading');
    const episodeControls = document.getElementById('player-episode-controls');

    // --- 1. Limpieza completa del estado anterior ---
    if (iframe) iframe.src = '';
    if (iframeWrapper) iframeWrapper.style.display = 'none';
    if (loadingEl) loadingEl.classList.add('hidden');

    const episodesScroll = document.getElementById('episodes-scroll');
    if (episodesScroll) episodesScroll.innerHTML = '';
    const seasonSelect = document.getElementById('season-select');
    if (seasonSelect) seasonSelect.innerHTML = '';


    currentSeason = null;
    currentEpisode = null;
    isPlayerVisible = false;
    currentApi = 'unlimplay';

    // --- 2. Si falta información, obtenerla de TMDB ---
    if (data.tmdbId && (!data.overview || !data.year || !data.duration || !data.background || !data.titleImage)) {
    try {
        const endpoint = data.mediaType === 'movie' ? 'movie' : 'tv';
        const url = `https://api.themoviedb.org/3/${endpoint}/${data.tmdbId}?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const tmdbData = await response.json();

        if (!data.overview) data.overview = tmdbData.overview || 'Sin sinopsis disponible';
        if (!data.year) {
            const date = tmdbData.release_date || tmdbData.first_air_date;
            data.year = date ? date.split('-')[0] : '';
        }
        if (!data.duration) {
            if (data.mediaType === 'movie') {
                data.duration = formatRuntime(tmdbData.runtime);
            } else {
                const episodes = tmdbData.number_of_episodes || '?';
                data.duration = `${episodes} episodios`;
            }
        }
        // Si no hay poster, usar el de TMDB
        if (!data.posterPath && tmdbData.poster_path) {
            data.posterPath = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
        }
        // Obtener backdrop
        if (!data.background && tmdbData.backdrop_path) {
            data.background = `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}`;
        }
        // Obtener logo (titleImage)
        if (!data.titleImage) {
            try {
                const imagesRes = await fetchWithRetry(`https://api.themoviedb.org/3/${endpoint}/${data.tmdbId}/images?api_key=${API_KEY}&include_image_language=es,en,null`);
                const logos = imagesRes.logos || [];
                let logo = logos.find(l => l.iso_639_1 === 'es') || logos.find(l => l.iso_639_1 === 'en') || logos[0];
                if (logo) {
                    data.titleImage = `https://image.tmdb.org/t/p/w500${logo.file_path}`;
                }
            } catch (e) {
                // Si falla la obtención de logos, continuar sin logo
            }
        }
        // Guardar los datos actualizados
        currentModalData = data;

        // Obtener géneros
        if (tmdbData.genres && tmdbData.genres.length > 0) {
            data.genre = tmdbData.genres.map(g => g.name).join(', ');
        } else if (data.genreIds) {
            const genreNames = getGenreNamesFromIds(data.genreIds, data.mediaType);
            if (genreNames) data.genre = genreNames;
        }

    } catch (error) {
        console.warn('No se pudieron obtener detalles de TMDB:', error);
    }
}

    // --- 4. Actualizar la interfaz con la información básica ---
    const titleEl = document.getElementById('player-title');
    if (titleEl) titleEl.textContent = data.title || 'Sin título';

    const metaEl = document.getElementById('player-meta');
    if (metaEl) {
        metaEl.innerHTML = `
            <span class="player-year">${data.year || ''}</span>
            <span class="player-duration">${data.duration || ''}</span>
        `;
    }
    const synopsisEl = document.getElementById('player-synopsis');
    if (synopsisEl) synopsisEl.textContent = data.overview || 'Sin sinopsis disponible';

    // --- 5. Cargar temporadas si es serie o anime ---
    const isSeries = (data.mediaType === 'tv' || data.mediaType === 'anime');

    if (isSeries && data.tmdbId) {
        episodeControls.style.display = 'block';
        const episodesContainer = document.getElementById('episodes-scroll');
        if (episodesContainer) {
            episodesContainer.innerHTML = '<div style="color:#aaa; padding:10px;">Cargando episodios...</div>';
        }

        try {
            let seasons = data.seasons;
            if (!seasons || seasons.length === 0) {
                seasons = await getSeriesDetails(data.tmdbId);
            }

            if (seasons && seasons.length > 0) {
                data.seasons = seasons;
                currentModalData.seasons = seasons;
                populateSeasonEpisodes(data);
            } else {
                episodeControls.style.display = 'none';
                if (episodesContainer) {
                    episodesContainer.innerHTML = '<div style="color:#aaa;">No se encontraron episodios.</div>';
                }
            }
        } catch (error) {
            console.error('Error cargando temporadas:', error);
            episodeControls.style.display = 'none';
            if (episodesContainer) {
                episodesContainer.innerHTML = '<div style="color:#ff6b6b;">Error al cargar episodios.</div>';
            }
        }
    } else {
        episodeControls.style.display = 'none';
    }

    // --- 7. Mostrar el modal ---
    modal.style.display = 'flex';
    modal.classList.remove('fullscreen');
    disableMainScroll();

    // Mostrar banner, ocultar iframe
    isBannerVisible = true;
    updateControlsBarBackground();
    document.getElementById('player-banner').style.display = 'flex';
    document.getElementById('player-iframe-wrapper').style.display = 'none';
    updatePlayerBanner(data);
    updatePlayerInfo(data);

    // --- 8. Reproducir automáticamente ---
    updatePlayButtonText();
    

    updatePlayerFavButton();
    updatePlayButtonText();
}

function updatePlayerTitle() {
    const titleEl = document.getElementById('player-title');
    if (!titleEl) return;
    if (!currentModalData) {
        titleEl.textContent = '';
        return;
    }
    let displayTitle = currentModalData.title || 'Sin título';
    const isSeries = currentModalData.mediaType === 'tv' || currentModalData.mediaType === 'anime';
    if (isSeries && currentSeason !== null && currentEpisode !== null) {
        displayTitle = `${displayTitle} - Temporada ${currentSeason} - Capítulo ${currentEpisode}`;
    }
    titleEl.textContent = displayTitle;
}

function populateSeasonEpisodes(data) {
    const seasonSelect = document.getElementById('season-select');
    const episodesScroll = document.getElementById('episodes-scroll');
    seasonSelect.innerHTML = '';
    episodesScroll.innerHTML = '';

    if (!data.seasons || data.seasons.length === 0) {
        seasonSelect.innerHTML = '<option>Sin temporadas</option>';
        return;
    }

    data.seasons.forEach((season, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `Temporada ${season.season_number}`;
        seasonSelect.appendChild(option);
    });

    const firstSeasonIndex = 0;
    seasonSelect.value = firstSeasonIndex;
    renderEpisodes(firstSeasonIndex, data);

    seasonSelect.onchange = function() {
        const idx = parseInt(this.value);
        renderEpisodes(idx, data);
    };
}

function renderEpisodes(seasonIndex, data) {
    const episodesScroll = document.getElementById('episodes-scroll');
    episodesScroll.innerHTML = '';
    const season = data.seasons[seasonIndex];
    if (!season || !season.episodes || season.episodes.length === 0) {
        episodesScroll.innerHTML = '<div style="color:#aaa;">No hay episodios en esta temporada.</div>';
        return;
    }

    season.episodes.forEach((ep, idx) => {
        const btn = document.createElement('button');
        btn.textContent = ep.episode_number || (idx + 1);
        btn.classList.add('episode-number-btn');
        btn.dataset.episode = ep.episode_number || (idx + 1);
        if (ep.url) btn.dataset.url = ep.url;

        btn.addEventListener('click', function() {
            document.querySelectorAll('.episode-number-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            currentEpisode = parseInt(this.dataset.episode);
            currentSeason = season.season_number;
            if (this.dataset.url) {
                currentModalData.animeEpisodeUrl = this.dataset.url;
            }
            // Actualizar el texto del botón de reproducción
            updatePlayButtonText();
            // Si el iframe ya está visible, recargar el episodio (iniciado por el usuario)
            if (isPlayerVisible) {
                playCurrentEpisode(true);
            }
        });
        episodesScroll.appendChild(btn);
    });

    // Seleccionar episodio por defecto (progreso o primero)
    let targetEpisode = null;
    if (currentModalData.tmdbId) {
        const progress = getProgress(currentModalData.tmdbId, currentModalData.mediaType);
        if (progress && progress.season === season.season_number) {
            targetEpisode = progress.episode;
        }
    }
    if (targetEpisode === null) {
        targetEpisode = season.episodes[0]?.episode_number || 1;
    }

    const btns = episodesScroll.querySelectorAll('.episode-number-btn');
    btns.forEach(btn => {
        if (parseInt(btn.dataset.episode) === targetEpisode) {
            btn.classList.add('selected');
            currentEpisode = targetEpisode;
            currentSeason = season.season_number;
            if (btn.dataset.url) {
                currentModalData.animeEpisodeUrl = btn.dataset.url;
            }
        }
    });

    updatePlayerTitle();
}

function playCurrentEpisode(userInitiated = true) {
    if (!currentModalData) {
        console.warn('No hay contenido seleccionado.');
        return;
    }

    if ((currentModalData.mediaType === 'tv' || currentModalData.mediaType === 'anime') &&
        (currentSeason === null || currentEpisode === null)) {
        if (currentModalData.seasons && currentModalData.seasons.length > 0) {
            const firstSeason = currentModalData.seasons[0];
            if (firstSeason.episodes && firstSeason.episodes.length > 0) {
                currentSeason = firstSeason.season_number;
                currentEpisode = firstSeason.episodes[0].episode_number || 1;
                const seasonSelect = document.getElementById('season-select');
                if (seasonSelect) seasonSelect.value = 0;
                renderEpisodes(0, currentModalData);
            }
        }
        if (currentSeason === null || currentEpisode === null) {
            console.warn('No hay episodios disponibles para reproducción automática.');
            return;
        }
    }

    const iframeWrapper = document.getElementById('player-iframe-wrapper');
    const iframe = document.getElementById('player-iframe');
    const loadingEl = document.getElementById('player-iframe-loading');

    if (!isBannerVisible) {
        iframeWrapper.style.display = 'block';
    } else {
        iframeWrapper.style.display = 'none';
    }
    if (loadingEl) loadingEl.classList.remove('hidden');

    const api = currentApi;
    let url = null;

    // Caso: Anime + API AnimeAV1
    if ((currentModalData.isAnime || currentModalData.mediaType === 'anime') && api === 'animeav1') {
        if (currentModalData.animeEpisodeUrl) {
            getAnimeEmbedUrl(currentModalData.animeEpisodeUrl).then(embed => {
                if (embed) {
                    iframe.src = embed;
                    isPlayerVisible = true;
                    if (userInitiated) {
                        saveProgress(currentModalData.tmdbId, 'anime', null, currentEpisode);
                        addToRecent(currentModalData.tmdbId, 'anime', currentModalData.title, currentModalData.posterPath, currentModalData.originalLang);
                    }
                    setupIframeLoading(iframe, loadingEl);
                    updatePlayerTitle();
                    const synopsisEl = document.getElementById('player-synopsis');
                    if (synopsisEl) {
                        synopsisEl.textContent = currentModalData?.overview || 'Sin sinopsis disponible';
                    }
                    const metaEl = document.getElementById('player-meta');
                    if (metaEl && currentModalData) {
                        const year = currentModalData.year || '';
                        const duration = currentModalData.duration || '';
                        metaEl.innerHTML = `
                            <span class="player-year">${year}</span>
                            <span class="player-duration">${duration}</span>
                        `;
                    }
                } else {
                    console.warn('No se pudo obtener embed de AnimeAV1');
                    loadingEl.classList.add('hidden');
                    tryFallbackUnlimPlay(iframe, loadingEl, userInitiated);
                }
            });
            return;
        } else {
            tryFallbackUnlimPlay(iframe, loadingEl, userInitiated);
            return;
        }
    }

    // Caso: Anime con UnlimPlay o VidSrc
    if ((currentModalData.isAnime || currentModalData.mediaType === 'anime') && (api === 'unlimplay' || api === 'vidsrc')) {
        if (currentModalData.tmdbId) {
            url = buildPlayerUrl(api, currentModalData.tmdbId, 'tv', currentSeason, currentEpisode);
        }
    } else {
        url = buildPlayerUrl(api, currentModalData.tmdbId, currentModalData.mediaType, currentSeason, currentEpisode);
    }

    if (url) {
        iframe.src = url;
        isPlayerVisible = true;
        if (userInitiated) {
            if (currentModalData.tmdbId) {
                if (currentModalData.mediaType === 'movie') {
                    saveProgress(currentModalData.tmdbId, 'movie');
                } else {
                    saveProgress(currentModalData.tmdbId, currentModalData.mediaType, currentSeason, currentEpisode);
                }
                addToRecent(currentModalData.tmdbId, currentModalData.mediaType, currentModalData.title, currentModalData.posterPath, currentModalData.originalLang);
            }
        }
        currentPlayerData = {
            tmdbId: currentModalData.tmdbId,
            mediaType: currentModalData.mediaType,
            title: currentModalData.title,
            season: currentSeason,
            episode: currentEpisode,
            originalLang: currentModalData.originalLang,
            isAnime: currentModalData.isAnime || currentModalData.mediaType === 'anime',
            animeEpisodeUrl: currentModalData.animeEpisodeUrl
        };
        setupIframeLoading(iframe, loadingEl);
        updatePlayerTitle();
        updatePlayerInfo(currentModalData);
    } else {
        console.warn('No se pudo construir la URL para la API seleccionada.');
        loadingEl.classList.add('hidden');
        tryFallbackUnlimPlay(iframe, loadingEl, userInitiated);
    }
}

    // Función interna para intentar UnlimPlay como fallback
function tryFallbackUnlimPlay(iframe, loadingEl, userInitiated = true) {
    if (currentModalData.tmdbId && currentModalData.mediaType === 'anime') {
        const fallbackUrl = buildPlayerUrl('unlimplay', currentModalData.tmdbId, 'tv', currentSeason, currentEpisode);
        if (fallbackUrl) {
            iframe.src = fallbackUrl;
            isPlayerVisible = true;
            if (userInitiated) {
                saveProgress(currentModalData.tmdbId, 'tv', currentSeason, currentEpisode);
                addToRecent(currentModalData.tmdbId, 'tv', currentModalData.title, currentModalData.posterPath, currentModalData.originalLang);
            }
            setupIframeLoading(iframe, loadingEl);
            updatePlayerTitle();
            return;
        }
    }
    if (loadingEl) loadingEl.classList.add('hidden');
    console.warn('No se pudo cargar el episodio con ninguna fuente.');
    const synopsisEl = document.getElementById('player-synopsis');
    if (synopsisEl) {
        synopsisEl.textContent = 'No se pudo cargar el video. Intenta con otra fuente.';
        synopsisEl.style.color = '#ff6b6b';
    }
}


// Función auxiliar para gestionar la carga del iframe
function setupIframeLoading(iframe, loadingEl) {
    // Cuando el iframe termine de cargar, ocultar el spinner
    iframe.onload = function() {
        if (loadingEl) loadingEl.classList.add('hidden');
    };
    // Fallback: ocultar el spinner después de 8 segundos como máximo
    setTimeout(() => {
        if (loadingEl) loadingEl.classList.add('hidden');
    }, 8000);
}

async function loadAnimeCardInfo(card, animeUrl) {
    // Si ya tenemos la info en caché, usarla
    if (animeInfoCache[animeUrl]) {
        updateCardOverlay(card, animeInfoCache[animeUrl]);
        return;
    }

    // Evitar múltiples peticiones simultáneas para la misma URL
    if (card.dataset.loading === 'true') return;
    card.dataset.loading = 'true';

    // Mostrar un mensaje de carga en el overlay (opcional)
    const overlay = card.querySelector('.movie-overlay');
    if (overlay) {
        const synopsisEl = overlay.querySelector('.movie-synopsis-hover');
        if (synopsisEl) synopsisEl.textContent = 'Cargando...';
    }

    try {
        const data = await fetchAnimeApi(`/info?url=${encodeURIComponent(animeUrl)}`);
        // Guardar en caché
        animeInfoCache[animeUrl] = data;
        // Actualizar overlay
        updateCardOverlay(card, data);
    } catch (error) {
        console.warn('Error cargando info para', animeUrl, error);
        // Mostrar un mensaje de error en el overlay
        if (overlay) {
            const synopsisEl = overlay.querySelector('.movie-synopsis-hover');
            if (synopsisEl) synopsisEl.textContent = 'Error al cargar información';
        }
    } finally {
        card.dataset.loading = 'false';
    }
}

/**
 * Actualiza el overlay de la tarjeta con los datos del anime.
 * @param {HTMLElement} card - El elemento .movie de la tarjeta
 * @param {Object} data - Datos devueltos por /info de AnimeAV1
 */
function updateCardOverlay(card, data) {
    const title = data.title || card.dataset.title || 'Sin título';
    const year = data.startDate ? data.startDate.split('-')[0] : (data.year || '');
    const overview = data.description || 'Sin sinopsis disponible';

    let genres = '';
    if (data.genres && data.genres.length) {
        if (typeof data.genres[0] === 'string') {
            genres = data.genres.join(', ');
        } else if (data.genres[0]?.name) {
            genres = data.genres.map(g => g.name).join(', ');
        } else if (data.genres[0]?.genre) {
            genres = data.genres.map(g => g.genre).join(', ');
        }
    }
    const totalEpisodes = data.totalEpisodes || '';

    // ✅ Determinar tipo correctamente
    let type = data.type || '';
    const isExplicitMovie = type.toLowerCase().includes('movie') || type.toLowerCase().includes('película');
    const isSingleEpisode = Number(totalEpisodes) === 1;

    if (isExplicitMovie || isSingleEpisode) {
        type = 'Película';
    } else {
        type = 'Serie';
    }

    // Actualizar overlay...
    const overlay = card.querySelector('.movie-overlay');
    if (!overlay) return;

    const titleEl = overlay.querySelector('.movie-title-hover');
    if (titleEl) titleEl.textContent = title;

    const metaEl = overlay.querySelector('.movie-meta-hover');
    if (metaEl) {
        let metaText = type;
        if (year) metaText += ` • ${year}`;
        // Mostrar episodios solo si es Serie y tiene más de 1
        if (type === 'Serie' && totalEpisodes && Number(totalEpisodes) > 1) {
            metaText += ` • ${totalEpisodes} episodios`;
        }
        metaEl.textContent = metaText;
    }

    const synopsisEl = overlay.querySelector('.movie-synopsis-hover');
    if (synopsisEl) {
        synopsisEl.textContent = truncateSynopsis(overview, 20);
    }

    const genresEl = overlay.querySelector('.movie-genres-hover');
    if (genresEl) {
        genresEl.textContent = genres || 'Sin géneros';
    }
}

async function searchAnimeByTitle(title) {
    try {
        const data = await fetchAnimeApi(`/search?q=${encodeURIComponent(title)}`);
        const results = data.results || [];
        if (results.length === 0) return null;
        // Buscar primer resultado de AnimeAV1
        const animeAV1Result = results.find(item => item.provider?.toLowerCase() === 'animeav1');
        return animeAV1Result ? animeAV1Result.url : null;
    } catch (error) {
        console.error('Error buscando anime por título:', error);
        return null;
    }
}




// ==================== CARGAR FILAS DE ANIME ====================
async function loadAnimeRowIfAvailable(endpoint, rowId, categoryTitle, parentContainerId, limit = null) {
    const container = document.getElementById(parentContainerId);
    if (!container) {
        console.warn(`Contenedor ${parentContainerId} no encontrado`);
        return false;
    }

    let categoryDiv = document.getElementById(rowId)?.closest('.category');
    if (!categoryDiv) {
        categoryDiv = createCategoryStructure(categoryTitle, rowId);
        container.appendChild(categoryDiv);
    }
    const rowElement = document.getElementById(rowId);
    if (!rowElement) return false;

    rowElement.innerHTML = `<div style="color: white; padding: 20px;">Cargando ${categoryTitle}...</div>`;

    try {
        const data = await fetchAnimeApi(endpoint);
        const results = data.results || data;
        if (!results || results.length === 0) {
            rowElement.innerHTML = `<div style="color: #aaa; padding: 20px;">No hay contenido disponible para ${categoryTitle}</div>`;
            return false;
        }

        const animeAV1Results = results.filter(item => item.provider?.toLowerCase() === 'animeav1');
        if (animeAV1Results.length === 0) {
            rowElement.innerHTML = `<div style="color: #aaa; padding: 20px;">No hay contenido disponible en AnimeAV1 para ${categoryTitle}</div>`;
            return false;
        }

        const filtered = animeAV1Results.filter(isSafeForAllAges);
        let itemsToShow = filtered;
        if (limit && limit > 0) {
            itemsToShow = filtered.slice(0, limit);
        }

        rowElement.innerHTML = '';
        let cardIndex = 0;

        itemsToShow.forEach(item => {
            const card = document.createElement('div');
            card.classList.add('movie');

            const title = item.title || 'Sin título';
            const poster = item.image || 'images/no-poster.jpg';
            const url = item.url;

            card.dataset.url = url;
            card.dataset.title = title;

            card.innerHTML = `
                <img src="${poster}" alt="${title}" loading="lazy">
                <div class="movie-overlay">
                    <div class="movie-info">
                        <div class="movie-title-hover">${title}</div>
                        <div class="movie-meta-hover">Cargando...</div>
                        <div class="movie-synopsis-hover">Cargando información...</div>
                        <div class="movie-genres-hover"></div>
                    </div>
                </div>
            `;

            card.addEventListener('mouseenter', function() {
                if (this._hoverTimer) clearTimeout(this._hoverTimer);
                this._hoverTimer = setTimeout(() => {
                    loadAnimeCardInfo(this, this.dataset.url);
                }, 200);
            });

            card.addEventListener('click', async () => {
            // Intentar obtener tmdbId
            let tmdbId = null;
            if (title) {
                tmdbId = await getTmdbIdByTitle(title);
            }
            const data = {
                tmdbId: tmdbId,
                mediaType: 'anime',
                title: title,
                originalLang: 'ja',
                posterPath: poster,
                year: '',
                duration: '',
                overview: '',
                animeEpisodeUrl: url,
                isAnime: true
            };
            openPlayerModal(data);
        });

            card.style.animationDelay = `${cardIndex * 0.05}s`;
            rowElement.appendChild(card);
            cardIndex++;
        });

        // === TARJETA "VER MÁS" ===
        const verMasCard = document.createElement('div');
        verMasCard.classList.add('ver-mas-card', 'movie');
        verMasCard.innerHTML = `
            <div class="ver-mas-content">
                <span>Ver más</span>
                <span class="ver-mas-icon">→</span>
            </div>
        `;
        verMasCard.style.animationDelay = `${cardIndex * 0.05}s`;
        verMasCard.addEventListener('click', () => {
            showMoreResults(categoryTitle, endpoint, rowId, 'anime', 'animeav1');
        });
        rowElement.appendChild(verMasCard);

        setTimeout(() => updateRowButtons(rowElement), 150);
        console.log(`✅ ${categoryTitle} cargado con ${itemsToShow.length} animes`);
        return true;

    } catch (error) {
        console.error(`❌ Error cargando ${categoryTitle}:`, error);
        rowElement.innerHTML = `<div style="color: red; padding: 20px;">Error al cargar ${categoryTitle}</div>`;
        return false;
    }
}


function extractKeywords(title) {
    // Eliminar partículas comunes y números de temporada
    const clean = title
        .replace(/\b(2nd|3rd|4th|season|part|movie|ova|special)\b/gi, '')
        .replace(/[:;!¡¿?()\-]/g, '')
        .trim();
    // Tomar las primeras 2-3 palabras
    const words = clean.split(/\s+/).filter(w => w.length > 2);
    return words.slice(0, 3).join(' ');
}

async function loadRelatedAnimes(currentTitle, currentUrl, container) {
    if (!container) return;

    // Extraer palabras clave
    const keyword = extractKeywords(currentTitle);
    if (!keyword) {
        container.innerHTML = '<div style="color:#666;">No se encontraron resultados relacionados.</div>';
        return;
    }

    try {
        const data = await fetchAnimeApi(`/search?q=${encodeURIComponent(keyword)}`);
        const results = data.results || [];
        // Filtrar solo AnimeAV1 y excluir el actual
        const filtered = results.filter(item =>
            item.provider?.toLowerCase() === 'animeav1' &&
            item.url !== currentUrl &&
            item.title !== currentTitle
        );

        if (filtered.length === 0) {
            container.innerHTML = '<div style="color:#666;">No hay otras temporadas disponibles.</div>';
            return;
        }

        container.innerHTML = '';
        filtered.slice(0, 5).forEach(item => {
            const btn = document.createElement('button');
            btn.textContent = item.title;
            btn.classList.add('related-btn');
            btn.dataset.url = item.url;
            btn.addEventListener('click', () => {
                // Abrir el anime relacionado
                showAnimeInfo(item.url, item.title, null);
            });
            container.appendChild(btn);
        });
    } catch (error) {
        console.warn('Error cargando animes relacionados:', error);
        container.innerHTML = '<div style="color:#666;">Error al cargar relacionados.</div>';
    }
}

// ==================== MOSTRAR INFO DE ANIME ====================
async function showAnimeInfo(animeUrl, title, tmdbId = null) {
    if (!animeUrl || !animeUrl.includes('animeav1')) {
    console.warn('URL no válida para AnimeAV1:', animeUrl);
    // Mostrar mensaje de error amigable
    infoLoading.classList.add('hidden');
    infoContentWrapper.style.display = 'flex';
    infoBackdrop.style.display = 'block';
    document.querySelector('.info-overlay').style.opacity = '1';
    infoTitle.innerText = 'Enlace no válido';
    infoSynopsis.innerText = 'Este anime no está disponible en AnimeAV1.';
    infoWatchBtn.style.display = 'none';
    document.getElementById('series-panel').style.display = 'none';
    disableMainScroll();
    return;
}
    try {
        showLoadingSpinner();

        isMovieMode = false;
        clearTrailer();
        clearInfoFadeTimer();

        const data = await fetchAnimeApi(`/info?url=${encodeURIComponent(animeUrl)}`);
        console.log('📦 Datos de AnimeAV1:', data);

        const animeTitle = data.title || title;
        let synopsis = data.description || 'Sin sinopsis disponible';

        // Obtener tmdbId solo si no se proporcionó
        if (!tmdbId) {
            tmdbId = await getTmdbIdByTitle(animeTitle);
            if (tmdbId) {
                console.log(`✅ tmdbId obtenido para "${animeTitle}": ${tmdbId}`);
            } else {
                console.warn(`⚠️ No se encontró tmdbId para "${animeTitle}"`);
            }
        }

        // === Obtener datos de TMDB (solo si existe tmdbId) ===
        let tmdbData = null;
        let backdropUrl = null;
        let posterUrl = data.image || 'images/no-poster.jpg';
        let seasonNumber = null;  // <-- NUEVO

        if (tmdbId) {
            try {
                const tmdbResp = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${API_KEY}&language=es-ES`);
                tmdbData = await tmdbResp.json();
                if (tmdbData.backdrop_path) {
                    backdropUrl = `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}`;
                }
                if (tmdbData.poster_path && (posterUrl === 'images/no-poster.jpg' || !posterUrl)) {
                    posterUrl = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
                }
                // Obtener la primera temporada para series
                if (tmdbData.seasons && !isMovie) {
                    const firstSeason = tmdbData.seasons.find(s => s.season_number > 0);
                    if (firstSeason) seasonNumber = firstSeason.season_number;
                }
            } catch (err) {
                console.warn('Error obteniendo datos de TMDB:', err);
            }
        }

        // === AÑO (prioridad: AnimeAV1 -> TMDB) ===
        let year = 'Año desconocido';
        if (data.startDate) {
            const y = data.startDate.split('-')[0];
            if (y) year = y;
        } else if (data.year) {
            year = data.year;
        } else if (tmdbData && tmdbData.first_air_date) {
            const y = tmdbData.first_air_date.split('-')[0];
            if (y) year = y;
        }

        // === DURACIÓN (prioridad: AnimeAV1 -> TMDB) ===
        let durationText = '';
        const isMovieByType = data.type?.toLowerCase().includes('película') || data.type?.toLowerCase().includes('movie');
        if (isMovieByType) {
            if (tmdbData && tmdbData.runtime) {
                durationText = formatRuntime(tmdbData.runtime);
            } else {
                durationText = 'Película';
            }
        } else if (data.totalEpisodes) {
            durationText = `${data.totalEpisodes} episodios`;
        } else {
            durationText = 'Duración no disponible';
        }

        // === GÉNEROS (prioridad: AnimeAV1 -> TMDB) ===
        let genresText = '';
        if (data.genres && data.genres.length > 0) {
            // Si es array de strings, únelos; si es array de objetos, extrae la propiedad 'name' o 'genre'
            if (typeof data.genres[0] === 'string') {
                genresText = data.genres.join(', ');
            } else if (data.genres[0]?.name) {
                genresText = data.genres.map(g => g.name).join(', ');
            } else if (data.genres[0]?.genre) {
                genresText = data.genres.map(g => g.genre).join(', ');
            } else {
                // fallback: convertir cada objeto a string (para depuración)
                genresText = data.genres.map(g => String(g)).join(', ');
            }
        } else if (tmdbData && tmdbData.genres && tmdbData.genres.length > 0) {
            genresText = tmdbData.genres.map(g => g.name).join(', ');
        }
        // Si no hay géneros, genresText queda vacío (no se mostrará "Sin géneros")

        // === Metadatos combinados ===
        let metaText = `${year} ● ${durationText}`;
        if (genresText) {
            metaText += ` ● ${genresText}`;
        }
        document.getElementById('info-meta-text').innerText = metaText;

        
        // === Sinopsis truncada ===
        infoSynopsis.innerText = truncateSynopsis(synopsis);

        // ====== Asegurar contenedor de botones ======
        let actionsContainer = document.getElementById('info-actions-container');
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.id = 'info-actions-container';
            actionsContainer.style.cssText = 'display: flex; gap: 15px; margin-top: 20px; flex-wrap: wrap;';
            // Insertar después de la sinopsis
            const synopsisEl = document.getElementById('info-synopsis');
            if (synopsisEl && synopsisEl.parentNode) {
                synopsisEl.parentNode.insertBefore(actionsContainer, synopsisEl.nextSibling);
            } else {
                document.querySelector('.info-main').appendChild(actionsContainer);
            }
        }
        // Mover los botones al contenedor
        const watchBtn = document.getElementById('info-watch-btn');
        const favBtn = document.getElementById('info-fav-btn');
        if (watchBtn && watchBtn.parentNode !== actionsContainer) {
            actionsContainer.appendChild(watchBtn);
        }
        if (favBtn && favBtn.parentNode !== actionsContainer) {
            actionsContainer.appendChild(favBtn);
        }
        // Asegurar que sean visibles
        if (watchBtn) watchBtn.style.display = 'block';
        if (favBtn) favBtn.style.display = 'block';

        // === Título ===
        infoTitle.innerText = animeTitle;

        // === Backdrop ===
        const backdropDiv = document.getElementById('info-backdrop');
        if (backdropDiv) {
            if (backdropUrl) {
                backdropDiv.style.backgroundImage = `url(${backdropUrl})`;
                backdropDiv.style.filter = 'blur(0px)';
            } else if (data.image) {
                backdropDiv.style.backgroundImage = `url(${data.image})`;
                backdropDiv.style.filter = 'blur(5px)';
            } else {
                backdropDiv.style.backgroundImage = 'none';
                backdropDiv.style.backgroundColor = '#0f0f0f';
            }
            backdropDiv.style.display = 'block';
        }

        // === Episodios / Película ===
        const episodes = data.episodes || [];
        const isMovie = episodes.length === 1;

        const seriesPanel = document.getElementById('series-panel');
        const episodesContainer = document.getElementById('episodes-container');
        const seasonsContainer = document.getElementById('seasons-container');
        const seasonsSection = document.querySelector('.seasons-section');

        // Guardar datos comunes
        // Construir data para openPlayerModal
        const modalData = {
            tmdbId: currentMovieData.tmdbId,
            mediaType: 'anime',
            title: currentMovieData.title,
            originalLang: 'ja',
            posterPath: currentMovieData.posterPath,
            year: currentMovieData.year,
            duration: currentMovieData.duration,
            overview: currentMovieData.overview,
            animeEpisodeUrl: currentMovieData.animeEpisodeUrl,
            seasons: [],
            isAnime: true,
        };
        if (!isMovie) {
            // Construir una temporada con todos los episodios
            const episodesList = episodes.map(ep => ({
                episode_number: ep.number,
                url: ep.url  // Guardamos la URL para AnimeAV1
            }));
            modalData.seasons = [{
                season_number: 1,
                episodes: episodesList
            }];
        }
        hideLoadingSpinner();
        openPlayerModal(modalData);
        updateWatchButton('anime');

        // Favoritos
        if (tmdbId) {
            const isFav = isFavorite(tmdbId, 'anime', animeTitle);
            updateFavButton(isFav);
        } else {
            const isFav = isFavorite(null, 'anime', animeTitle);
            updateFavButton(isFav);
        }

        
        disableMainScroll();

    } catch (error) {
        console.error('Error cargando información del anime:', error);
        infoLoading.classList.add('hidden');
        infoContentWrapper.style.display = 'flex';
        infoBackdrop.style.display = 'block';
        document.querySelector('.info-overlay').style.opacity = '1';
        infoTitle.innerText = 'Error al cargar la información';
        infoSynopsis.innerText = 'No se pudo cargar los datos del anime.';
        infoWatchBtn.style.display = 'none';
        document.getElementById('series-panel').style.display = 'none';
        disableMainScroll();
    }
}

// ==================== REPRODUCIR EPISODIO DE ANIME ====================
async function playAnimeEpisode(episodeUrl) {
    if (!episodeUrl) {
        alert('Selecciona un capítulo primero');
        return;
    }

    let embedUrl = null;
    try {
        const data = await fetchAnimeApi(`/episode?url=${encodeURIComponent(episodeUrl)}`);
        let sources = data.streamLinks?.SUB || data.servers?.sub || [];
        if (sources.length === 0) {
            sources = data.streamLinks?.DUB || data.servers?.dub || [];
        }
        if (sources.length === 0) {
            // 🔥 FALLBACK: Si no hay fuentes en AnimeAV1, usar UnlimPlay si existe tmdbId
            if (currentMovieData && currentMovieData.tmdbId) {
                currentApi = 'unlimplay';
                const mediaType = currentMovieData.isMovie ? 'movie' : 'tv';
                const season = currentMovieData.season || 1;
                const episode = currentMovieData.episodeNumber || 1;
                playMedia(currentMovieData.tmdbId, mediaType, currentMovieData.title, currentMovieData.originalLang || 'ja', season, episode);
                return;
            } else {
                alert('No se encontraron enlaces de video para este episodio.');
                return;
            }
        }
        const hlsSource = sources.find(s => s.server === 'HLS');
        embedUrl = hlsSource ? hlsSource.url : sources[0].url;
    } catch (error) {
        console.error('Error obteniendo enlace de video:', error);
        alert('Error al obtener el enlace del video.');
        return;
    }

    // Guardar progreso y recientes (código existente)
    if (currentMovieData) {
        const identifier = currentMovieData.tmdbId || currentMovieData.animeUrl;
        if (identifier) {
            const episodeNumber = currentMovieData.episodeNumber || 1;
            saveProgress(identifier, 'anime', null, episodeNumber);
        }
        addToRecent(
            currentMovieData.tmdbId,
            'anime',
            currentMovieData.animeTitle || currentMovieData.title,
            currentMovieData.posterPath || '',
            currentMovieData.originalLang || 'ja',
            currentMovieData.animeUrl,
            currentMovieData.isMovie || false
        );
    }

    // Mostrar modal con AnimeAV1 (código existente)
    const modal = document.getElementById('player-modal');
    const iframe = document.getElementById('player-iframe');

    iframe.src = embedUrl;
    modal.style.display = 'flex';

    // Actualizar información
    const title = currentMovieData?.title || 'Anime';
    const episodeNum = currentMovieData?.episodeNumber || '';
    const displayTitle = episodeNum ? `${title} - Capítulo ${episodeNum}` : title;
    updatePlayerTitle();

    const year = currentMovieData?.year || '';
    const duration = currentMovieData?.duration || '';
    document.getElementById('player-meta').innerHTML = `
        <span class="player-year">${year}</span>
        <span class="player-duration">${duration}</span>
    `;
    document.getElementById('player-synopsis').textContent = currentMovieData?.overview || '';


    // Establecer API actual como animeav1
    currentApi = 'animeav1';
    document.querySelectorAll('.api-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.api === 'animeav1');
    });

    // Guardar datos para recarga
    currentPlayerData = {
        tmdbId: currentMovieData?.tmdbId,
        mediaType: currentMovieData?.isMovie ? 'movie' : 'tv',
        title: displayTitle,
        season: currentMovieData?.season,
        episode: currentMovieData?.episodeNumber,
        originalLang: currentMovieData?.originalLang || 'ja',
        animeEpisodeUrl: episodeUrl,
        animeUrl: currentMovieData?.animeUrl,
        isAnime: true
    };

    
    disableMainScroll();
    modal.classList.remove('fullscreen');
}


// ==================== CARGAR CONTENIDO DE PESTAÑAS ====================
async function loadTabContent(tabId) {
    if (tabId === 'inicio') {
        // Cargar carrusel de inicio (películas populares, sin shuffle)
        loadBannerCarouselFromTMDB('banner-carousel', '/movie/popular', 'movie');
        const container = document.getElementById('categories-container-inicio');
        if (container) {
            loadRecentRow();
            await loadDynamicRow("/movie/popular", "row-populares-inicio", "Películas populares", container.id);
            insertLeaderboardBanner(container, 'after'); // Banner después de la primera fila
            await loadDynamicRow("/discover/tv?sort_by=first_air_date.desc&first_air_date.lte=2026-12-31&vote_average.gte=5&vote_count.gte=10", "row-series-recientes", "Series recientes", container.id, 'es-ES', 'tv');
            await loadDynamicRow("/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=100", "row-anime-popular-inicio", "Anime populares", container.id, 'es-ES', 'tv');
            await loadDynamicRow("/discover/movie?with_genres=16,10751&sort_by=popularity.desc", "row-animados-inicio", "Animados para niños", container.id);
            await loadDynamicRow("/discover/tv?with_genres=16,10751&certification_country=US&certification=TV-Y7&sort_by=popularity.desc", "row-infantiles-inicio", "Series infantiles clásicas", container.id, 'es-ES', 'tv');
        }
    } else if (tabId === 'peliculas') {
        // Cargar carrusel de películas (recientes, con shuffle)
        loadBannerCarouselFromTMDB('banner-carousel-peliculas', '/movie/popular', 'movie');
        const container = document.getElementById('categories-container-peliculas');
        if (container) {
            await loadDynamicRow("/discover/movie?sort_by=popularity.desc&primary_release_date.lte=2026-12-31", "row-populares-pelis", "Películas populares", container.id);
            insertLeaderboardBanner(container, 'after'); // Banner después de la primera fila
            await loadDynamicRow("/discover/movie?with_companies=174&sort_by=popularity.desc", "row-warner-bros", "Warner Bros. Pictures", container.id, 'es-ES', 'movie');
            await loadDynamicRow("/discover/movie?with_companies=2&sort_by=popularity.desc", "row-disney-peliculas", "Disney (Walt Disney Pictures)", container.id, 'es-ES', 'movie');
            await loadDynamicRow("/discover/movie?with_companies=19551&sort_by=popularity.desc", "row-apple-peliculas", "Apple Studios", container.id, 'es-ES', 'movie');
            await loadDynamicRow("/discover/movie?with_genres=80&sort_by=popularity.desc", "row-crimen-pelis", "Crimen y policiaco", container.id, 'es-ES', 'movie');
            await loadDynamicRow("/discover/movie?with_genres=28&sort_by=popularity.desc", "row-accion-pelis", "Acción", container.id);
            await loadDynamicRow("/discover/movie?with_genres=28,14,878&sort_by=popularity.desc", "row-superheroes-pelis", "Superhéroes", container.id);
            await loadDynamicRow("/discover/movie?with_genres=16,10751&sort_by=popularity.desc", "row-animados-pelis", "Animados para niños", container.id);
            await loadDynamicRow("/discover/movie?primary_release_date.gte=2000-01-01&primary_release_date.lte=2009-12-31&sort_by=popularity.desc", "row-2000-pelis", "Clásicos de los 2000", container.id, 'es-ES', 'movie');
            await loadDynamicRow("/discover/movie?with_genres=27&sort_by=popularity.desc", "row-terror-pelis", "Terror", container.id);
              // ← inserta después de la primera fila
        }
    } else if (tabId === 'series') {
        // Cargar carrusel de series (emisión actual, orden aleatorio)
        loadBannerCarouselFromTMDB('banner-carousel-series', '/tv/popular', 'tv');
        const container = document.getElementById('categories-container-series');
        if (container) {
            await loadDynamicRow("/discover/tv?with_networks=213&sort_by=first_air_date.desc&first_air_date.lte=2026-06-15", "row-series-nuevas-netflix", "Series de Netflix", container.id, 'es-ES', 'tv');
            insertLeaderboardBanner(container, 'after'); // Banner después de la primera fila
            await loadDynamicRow("/discover/tv?with_networks=2739&sort_by=popularity.desc", "row-disney-plus", "Series de Disney+", container.id, 'es-ES', 'tv');
            await loadDynamicRow("/discover/tv?with_networks=2552&sort_by=popularity.desc", "row-apple-tv", "Series de Apple TV+", container.id, 'es-ES', 'tv');
            await loadDynamicRow("/discover/tv?with_genres=16,10751&certification_country=US&certification=TV-Y7&sort_by=popularity.desc", "row-infantiles-series", "Series infantiles", container.id, 'es-ES', 'tv');
            await loadDynamicRow("/discover/tv?with_genres=9648&sort_by=popularity.desc", "row-misterio-series", "Series de misterio", container.id, 'es-ES', 'tv');
            await loadDynamicRow("/discover/tv?with_genres=10765&without_genres=16&sort_by=popularity.desc", "row-terror-series", "Series de terror", container.id, 'es-ES', 'tv');
            
            
        }
    } else if (tabId === 'buscar') {
        if (searchDashboardVisible) {
        loadSearchDashboard();
    } else {
        // Mostrar resultados ya cargados
        document.getElementById('search-dashboard').style.display = 'none';
        document.getElementById('search-results-wrapper').style.display = 'block';
    }
        // No cargamos nada automático
    } else if (tabId === 'favoritos') {
        loadFavorites();
    } else if (tabId === 'anime') {
    // Cargar carrusel de anime (desde TMDB)
loadBannerCarouselFromTMDB(
    'banner-carousel-anime',
    '/discover/tv?with_genres=16&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=500',
    'tv',
    '/discover/tv?with_genres=16&sort_by=popularity.desc'  // fallback en caso de que no haya suficientes con 500 votos
);
    const container = document.getElementById('categories-container-anime');
    if (!container) {
        console.error('No se encuentra #categories-container-anime');
        return;
    }
    container.innerHTML = '';

    // Filas de anime desde TMDB
    await loadDynamicRow("/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=100", "row-anime-popular", "Animes populares", container.id, 'es-ES', 'tv');
    await loadDynamicRow("/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc", "row-anime-peliculas", "Películas de anime", container.id, 'es-ES', 'movie');
    await loadDynamicRow("/discover/tv?with_genres=16&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=500", "row-anime-mejores", "Mejores animes", container.id, 'es-ES', 'tv');
    
}
}

async function loadSearchDashboard() {
    const dashboard = document.getElementById('search-dashboard');
    if (!dashboard) return;
    dashboard.innerHTML = '';
    dashboard.style.display = 'block';
    document.getElementById('search-results-wrapper').style.display = 'none';
    searchDashboardVisible = true;

    const filter = currentSearchFilter; // 'movie', 'tv', 'anime'

    // ==================== PELÍCULAS ====================
    if (filter === 'movie') {
        // --- Películas recientes (fila con 5 tarjetas + Ver más) ---
        /*const containerId = 'dash-movie-recent';
        const container = document.createElement('div');
        container.id = containerId;
        dashboard.appendChild(container);
        await loadDynamicRow('/movie/now_playing', 'row-movie-dash', 'Películas recientes', containerId, 'es-ES', 'movie', 5);*/

        // --- Géneros de películas ---
        const genresContainer = document.createElement('div');
        genresContainer.className = 'search-genres';
        genresContainer.innerHTML = '<h3>Géneros</h3><div class="genre-grid"></div>';
        dashboard.appendChild(genresContainer);
        const genreGrid = genresContainer.querySelector('.genre-grid');
        const genreEntries = Object.entries(genreMapMovie).slice(0, 20);
        genreEntries.forEach(([id, name]) => {
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.dataset.genreId = id;
            btn.addEventListener('click', () => {
                searchByGenre(id, 'movie', name);
            });
            genreGrid.appendChild(btn);
        });

        // --- Listas personalizadas (Películas) ---
        const customListsContainer = document.createElement('div');
        customListsContainer.className = 'search-custom-lists';
        customListsContainer.innerHTML = '<h3>Listas destacadas</h3><div class="custom-lists-grid"></div>';
        dashboard.appendChild(customListsContainer);
        const customGrid = customListsContainer.querySelector('.custom-lists-grid');

        const movieLists = [
            { name: 'Disney', endpoint: '/discover/movie?with_companies=2&sort_by=popularity.desc' },
            { name: 'Warner Bros.', endpoint: '/discover/movie?with_companies=174&sort_by=popularity.desc' },
            { name: 'Apple Studios', endpoint: '/discover/movie?with_companies=19551&sort_by=popularity.desc' },
            { name: 'Netflix', endpoint: '/discover/movie?with_companies=213&sort_by=popularity.desc' },
            { name: 'Amazon Studios', endpoint: '/discover/movie?with_companies=13241&sort_by=popularity.desc' },
            { name: 'Paramount', endpoint: '/discover/movie?with_companies=4&sort_by=popularity.desc' },
            { name: 'Sony Pictures', endpoint: '/discover/movie?with_companies=5&sort_by=popularity.desc' },
            { name: 'Marvel', endpoint: '/discover/movie?with_companies=420&sort_by=popularity.desc' },
            { name: 'Universal', endpoint: '/discover/movie?with_companies=33&sort_by=popularity.desc' },
            
        ];
        movieLists.forEach(list => {
            const btn = document.createElement('button');
            btn.textContent = list.name;
            btn.addEventListener('click', () => {
                showMoreResults(list.name, list.endpoint, 'custom-list', 'movie', 'tmdb');
            });
            customGrid.appendChild(btn);
        });

    // ==================== SERIES ====================
    } else if (filter === 'tv') {
        // --- Series recientes ---
        /*const containerId = 'dash-tv-recent';
        const container = document.createElement('div');
        container.id = containerId;
        dashboard.appendChild(container);
        await loadDynamicRow('/tv/on_the_air', 'row-tv-dash', 'Series recientes', containerId, 'es-ES', 'tv', 5);*/

        // --- Géneros de series ---
        const genresContainer = document.createElement('div');
        genresContainer.className = 'search-genres';
        genresContainer.innerHTML = '<h3>Géneros</h3><div class="genre-grid"></div>';
        dashboard.appendChild(genresContainer);
        const genreGrid = genresContainer.querySelector('.genre-grid');
        const genreEntries = Object.entries(genreMapTv).slice(0, 20);
        genreEntries.forEach(([id, name]) => {
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.dataset.genreId = id;
            btn.addEventListener('click', () => {
                searchByGenre(id, 'tv', name);
            });
            genreGrid.appendChild(btn);
        });

        // --- Listas personalizadas (Series) ---
        const customListsContainer = document.createElement('div');
        customListsContainer.className = 'search-custom-lists';
        customListsContainer.innerHTML = '<h3>Listas destacadas</h3><div class="custom-lists-grid"></div>';
        dashboard.appendChild(customListsContainer);
        const customGrid = customListsContainer.querySelector('.custom-lists-grid');

        const tvLists = [
            { name: 'Netflix', endpoint: '/discover/tv?with_networks=213&sort_by=popularity.desc' },
            { name: 'Disney+', endpoint: '/discover/tv?with_networks=2739&sort_by=popularity.desc' },
            { name: 'Apple TV+', endpoint: '/discover/tv?with_networks=2552&sort_by=popularity.desc' },
            { name: 'HBO Max', endpoint: '/discover/tv?with_networks=49&sort_by=popularity.desc' },
            { name: 'Amazon Prime Video', endpoint: '/discover/tv?with_networks=1024&sort_by=popularity.desc' },
            { name: 'Hulu', endpoint: '/discover/tv?with_networks=453&sort_by=popularity.desc' },
            { name: 'Paramount +', endpoint: '/discover/tv?with_networks=434&sort_by=popularity.desc' },
            { name: 'Mejores Valoradas', endpoint: '/discover/tv?sort_by=vote_average.desc&vote_count.gte=500' },
        ];
        tvLists.forEach(list => {
            const btn = document.createElement('button');
            btn.textContent = list.name;
            btn.addEventListener('click', () => {
                showMoreResults(list.name, list.endpoint, 'custom-list', 'tv', 'tmdb');
            });
            customGrid.appendChild(btn);
        });

    // ==================== ANIME ====================
    } else if (filter === 'anime') {
    // --- Géneros de anime usando TMDB (género 16) ---
    const genresContainer = document.createElement('div');
    genresContainer.className = 'search-genres';
    genresContainer.innerHTML = '<h3>Géneros</h3><div class="genre-grid"></div>';
    dashboard.appendChild(genresContainer);
    const genreGrid = genresContainer.querySelector('.genre-grid');

    // Usamos la lista de géneros de TV (incluye Anime)
    const animeGenreId = 16; // ID de Anime en TMDB
    const genreEntries = Object.entries(genreMapTv).slice(0, 20);
    genreEntries.forEach(([id, name]) => {
        // Solo mostramos géneros que tengan relación con anime (opcional)
        // Pero para simplificar, mostramos todos los géneros de TV
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.dataset.genreId = id;
        btn.addEventListener('click', () => {
            // Buscar por género en TV
            const endpoint = `/discover/tv?with_genres=${id}&sort_by=popularity.desc&with_original_language=ja`;
            showMoreResults(name, endpoint, 'genre-search', 'anime', 'tmdb');
        });
        genreGrid.appendChild(btn);
    });

    // --- Listas personalizadas (Anime) ---
    const customListsContainer = document.createElement('div');
    customListsContainer.className = 'search-custom-lists';
    customListsContainer.innerHTML = '<h3>Listas destacadas</h3><div class="custom-lists-grid"></div>';
    dashboard.appendChild(customListsContainer);
    const customGrid = customListsContainer.querySelector('.custom-lists-grid');

    const animeLists = [
        { name: 'Animes populares', endpoint: '/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=100' },
        { name: 'Animes recientes', endpoint: '/discover/tv?with_genres=16&with_original_language=ja&sort_by=first_air_date.desc' },
        { name: 'Películas de anime', endpoint: '/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc' },
        { name: 'Mejores animes', endpoint: '/discover/tv?with_genres=16&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=500' },
        { name: 'Animes en emisión', endpoint: '/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&with_status=returning_series' },
    ];
    animeLists.forEach(list => {
        const btn = document.createElement('button');
        btn.textContent = list.name;
        btn.addEventListener('click', () => {
            showMoreResults(list.name, list.endpoint, 'custom-list', 'anime', 'tmdb');
        });
        customGrid.appendChild(btn);
    });
}
}

function searchByGenre(genreId, filter, genreName) {
    if (filter === 'movie') {
        const endpoint = `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`;
        showMoreResults(genreName, endpoint, 'genre-search', 'movie', 'tmdb');
    } else if (filter === 'tv') {
        const endpoint = `/discover/tv?with_genres=${genreId}&sort_by=popularity.desc`;
        showMoreResults(genreName, endpoint, 'genre-search', 'tv', 'tmdb');
    } else if (filter === 'anime') {
        const genreSlug = genreName.toLowerCase().replace(/ /g, '-');
        const endpoint = `/catalog?genre=${genreSlug}&provider=animeav1`;
        showMoreResults(genreName, endpoint, 'genre-search', 'anime', 'animeav1');
    }
}


// ==================== TEXTO DEL BOTÓN (COMÚN) ====================
function getWatchButtonText(mediaType, identifier, isMovie = false) {
    if (!identifier) return 'VER AHORA';
    const progress = getProgress(identifier, mediaType);
    if (mediaType === 'movie') {
        return (progress && progress.watched) ? 'CONTINUAR VIENDO' : 'VER AHORA';
    } else if (mediaType === 'tv') {
        if (progress && progress.season !== undefined && progress.episode !== undefined) {
            return `CONTINUAR CAPÍTULO ${progress.episode}`;
        }
        return 'VER AHORA';
    } else if (mediaType === 'anime') {
        if (isMovie) {
            return (progress && progress.episode !== undefined) ? 'CONTINUAR VIENDO' : 'VER AHORA';
        } else {
            if (progress && progress.episode !== undefined) {
                return `CONTINUAR CAPÍTULO ${progress.episode}`;
            }
            return 'VER AHORA';
        }
    }
    return 'VER AHORA';
}


// ==================== FUNCIONES PARA TRÁILER ====================
async function getTrailer(tmdbId) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data.results || data.results.length === 0) return null;
        // Buscar tráiler en español, luego en inglés, luego teaser
        const trailer = data.results.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.iso_639_1 === 'es') ||
                        data.results.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                        data.results.find(v => v.type === 'Teaser' && v.site === 'YouTube' && v.iso_639_1 === 'es') ||
                        data.results.find(v => v.site === 'YouTube');
        console.log('🎥 Trailer encontrado:', trailer ? trailer.key : 'ninguno');                
        return trailer ? trailer.key : null;
    } catch (error) {
        console.error('Error obteniendo tráiler:', error);
        return null;
    }
}


// Reproducir el tráiler (crea el contenedor y el iframe)
function playTrailer(videoId) {
    console.log('🎬 Reproduciendo tráiler:', videoId);

    // 1. Desvanecer el backdrop (fondo de la información)
    const backdrop = document.getElementById('info-backdrop');
    if (backdrop) {
        backdrop.style.transition = 'opacity 1.5s ease';
        backdrop.style.opacity = '0';
    }

    // 2. Crear o obtener el contenedor del tráiler
    let trailerContainer = document.getElementById('trailer-container');
    if (!trailerContainer) {
        trailerContainer = document.createElement('div');
        trailerContainer.id = 'trailer-container';
        // Colocar el contenedor justo encima del backdrop
        const backdropEl = document.getElementById('info-backdrop');
        if (backdropEl) {
            backdropEl.parentNode.insertBefore(trailerContainer, backdropEl);
        } else {
            document.querySelector('.info-window').prepend(trailerContainer);
        }
        // Estilos para que ocupe todo y esté visible
        trailerContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;          /* Por encima del backdrop (z-index: 0) pero debajo del contenido (z-index: 2) */
            pointer-events: none; /* Para que no interfiera con los clics */
            opacity: 0;
            transition: opacity 1.5s ease;
        `;
    }

    // 3. Limpiar contenido anterior y crear el iframe con mute activado
    trailerContainer.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.id = 'trailer-iframe';
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&showinfo=0&hl=es&cc_load_policy=0&iv_load_policy=3`;
    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        position: absolute;
        top: 0;
        left: 0;
        object-fit: cover;
    `;
    iframe.allow = 'autoplay; encrypted-media';
    iframe.allowFullscreen = false;
    trailerContainer.appendChild(iframe);

    // 4. Fade in del tráiler (aparece suavemente)
    setTimeout(() => {
        trailerContainer.style.opacity = '1';
    }, 300);

    // 5. Activar sonido automáticamente después de 1.5 segundos
    setTimeout(() => {
        activarSonido(); // quita el mute
        // Iniciar el temporizador para ocultar la información (modo cine)
        resetInfoFadeTimer();
    }, 1500);
    console.log('⏳ Programando tráiler para dentro de 4 segundos');
}



// Activar sonido (quitar mute del iframe)
function activarSonido() {
    const iframe = document.querySelector('#trailer-container iframe');
    if (iframe) {
        let newSrc = iframe.src.replace('mute=1', 'mute=0');
        if (!newSrc.includes('autoplay=1')) {
            newSrc = newSrc.replace('?', '?autoplay=1&');
        }
        iframe.src = newSrc;
        console.log('🔊 Sonido activado automáticamente');
    } else {
        console.warn('❌ No se encontró iframe del tráiler');
    }
}

// ==================== BUSCADOR GENERAL ====================
async function performSearch(query, filter) {
    if (!query.trim()) return;

    // Ocultar dashboard y mostrar resultados
    searchDashboardVisible = false;
    document.getElementById('search-dashboard').style.display = 'none';
    document.getElementById('search-results-wrapper').style.display = 'block';

    currentSearchQuery = query.trim();
    currentSearchFilter = filter;

    loadedResultIds = new Set();

    moreResultsState = {
        page: 1,
        totalPages: null,
        isLoading: false,
        hasMore: true,
        provider: filter === "anime" ? "animeav1" : "tmdb",
        contentType: filter,
        query: query.trim(),
        isSearch: true
    };

    const resultsGrid = document.getElementById("search-results-grid");
    resultsGrid.innerHTML = "";

    // ✅ Actualizar título y placeholder
    const resultsTitle = document.getElementById('search-results-title');
    if (resultsTitle) {
        resultsTitle.textContent = `Resultados para "${query.trim()}"`;
    }
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.placeholder = `Buscar...`;
    }

    await loadMoreResults();
}

// ==================== CATEGORÍAS DEL BUSCADOR ====================
function createCategoryButtons() {
    const container = document.querySelector('.categories-grid');
    if (!container) return;

    const categories = [
        { endpoint: "/movie/now_playing", title: "Estrenos recientes", type: "movie" },
        { endpoint: "/movie/popular", title: "Películas populares", type: "movie" },
        { endpoint: "/discover/movie?with_genres=28&sort_by=popularity.desc", title: "Acción", type: "movie" },
        { endpoint: "/discover/movie?with_genres=28,14,878&sort_by=popularity.desc", title: "Superhéroes", type: "movie" },
        { endpoint: "/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc", title: "Anime (Japón)", type: "movie" },
        { endpoint: "/discover/movie?with_genres=16,10751&sort_by=popularity.desc", title: "Animados para niños", type: "movie" },
        { endpoint: "/discover/movie?with_genres=27&sort_by=popularity.desc", title: "Terror", type: "movie" },
        { endpoint: "/discover/tv?with_networks=213&sort_by=first_air_date.desc", title: "Series nuevas en Netflix", type: "tv" },
        { endpoint: "/tv/popular", title: "Series populares", type: "tv" },
        { endpoint: "/discover/tv?with_networks=2739&sort_by=popularity.desc", title: "Series de Disney+", type: "tv" },
        { endpoint: "/discover/tv?with_networks=2552&sort_by=popularity.desc", title: "Series de Apple TV+", type: "tv" },
        { endpoint: "/discover/tv?with_genres=16&with_original_language=ja&certification_country=US&certification.lte=TV-14&sort_by=popularity.desc", title: "Anime (series)", type: "tv" },
    ];

    container.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = cat.title;
        btn.classList.add('cat-btn');
        btn.addEventListener('click', () => {
            showMoreResults(cat.title, cat.endpoint, `cat-${cat.title}`, cat.type);
        });
        container.appendChild(btn);
    });
}


// ==================== LOAD DYNAMIC ROW (TMDB) ====================
async function loadDynamicRow(endpoint, rowId, categoryTitle, parentContainerId = 'categories-container', language = 'es-ES', contentType = 'movie', limit = null) {
    const container = document.getElementById(parentContainerId);
    if (!container) {
        console.error(`No se encuentra contenedor ${parentContainerId}`);
        return;
    }

    // Buscar si ya existe la categoría
    let categoryDiv = document.getElementById(rowId)?.closest('.category');
    if (!categoryDiv) {
        // Crear la categoría con la nueva estructura (con botones)
        categoryDiv = createCategoryStructure(categoryTitle, rowId);
        container.appendChild(categoryDiv);
    }

    // Obtener la fila (row) desde la categoría recién creada o existente
    const rowElement = document.getElementById(rowId);
    if (!rowElement) {
        console.error(`No se encuentra la fila con id ${rowId}`);
        return;
    }




    // Mostrar mensaje de carga
    rowElement.innerHTML = `<div style="color: white; padding: 20px;">Cargando ${categoryTitle}...</div>`;



    try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `https://api.themoviedb.org/3${endpoint}${separator}api_key=${API_KEY}&language=${language}`;
        console.log("Cargando URL:", url);

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${data.status_message || 'Error desconocido'}`);
        }

    if (!data.results || data.results.length === 0) {
                rowElement.innerHTML = `<div style="color: #aaa; padding: 20px;">No hay contenido disponible para ${categoryTitle}</div>`;
                return;
            }


            // 🔥 Limitar resultados si se especifica
            let results = data.results;
            if (limit && limit > 0) {
                results = results.slice(0, limit);
            }


        rowElement.innerHTML = "";
        let cardIndex = 0;

        for (const item of results) {
            const card = document.createElement("div");
            card.classList.add("movie");

            const tmdbId = item.id;
            const mediaType = contentType;
            const title = item.title || item.name;
            const originalLang = item.original_language;
            const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "images/no-poster.jpg";
            const overview = item.overview || '';
            const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
            const genreIds = item.genre_ids || [];
            const runtime = '';   // no viene en la lista, se puede obtener bajo demanda
            const episodes = '';  // igual


            card.dataset.tmdbId = tmdbId;
            card.dataset.mediaType = mediaType;
            card.dataset.title = title;
            card.dataset.originalLang = originalLang;
            card.dataset.overview = overview;
            card.dataset.year = year;
            card.dataset.genreIds = genreIds.join(',');

            // Obtener nombres de géneros y sinopsis corta
            const genreNames = getGenreNamesFromIds(genreIds, mediaType);
            const synopsisShort = truncateSynopsis(overview, 20);

            card.innerHTML = `
                <img src="${poster}" alt="${title}" loading="lazy">
                <div class="movie-overlay">
                    <div class="movie-info">
                        <div class="movie-title-hover">${title}</div>
                        <div class="movie-meta-hover">${mediaType === 'movie' ? 'Película' : 'Serie'}${year ? ` • ${year}` : ''}</div>
                        <div class="movie-synopsis-hover">${synopsisShort}</div>
                        <div class="movie-genres-hover">${genreNames}</div>
                    </div>
                </div>
            `;


            card.tabIndex = 0;
            //card.innerHTML = `<img src="${poster}" alt="${title}"><div class="movie-title">${title}</div>`;
            card.addEventListener("click", () => {
                const posterUrl = card.querySelector("img").src;
                // Obtener más datos (año, duración, etc.) de la API o de currentMovieData
                // Llamar a openPlayerModal con los datos
                const data = {
                    tmdbId: tmdbId,
                    mediaType: mediaType,
                    title: title,
                    originalLang: originalLang,
                    posterPath: posterUrl,
                    year: year,
                    duration: '',
                    genreIds: genreIds,
                    overview: overview,
                    // Para series, necesitas obtener las temporadas y episodios
                    // Puedes cargarlos bajo demanda dentro de openPlayerModal
                };
                openPlayerModal(data);
            });
            // Asignar retraso progresivo: 50ms entre cada tarjeta
            card.style.animationDelay = `${cardIndex * 0.05}s`;
            rowElement.appendChild(card);
            cardIndex++;
        }

        // Botón "Ver más" (también con retraso)
        const verMasCard = document.createElement('div');
        verMasCard.classList.add('ver-mas-card', 'movie');
        verMasCard.innerHTML = `
            <div class="ver-mas-content">
                <span>Ver más</span>
                <span class="ver-mas-icon">→</span>
            </div>
        `;
        verMasCard.style.animationDelay = `${cardIndex * 0.05}s`;
        verMasCard.addEventListener('click', () => {
            showMoreResults(categoryTitle, endpoint, rowId, contentType, 'tmdb');
        });
        rowElement.appendChild(verMasCard);
        updateRowButtons(rowElement);

    } catch (error) {
        console.error(`Error cargando ${categoryTitle}:`, error);
        rowElement.innerHTML = `<div style="color: red; padding: 20px;">Error al cargar ${categoryTitle}. Ver consola.</div>`;
    }

    

}

function showMoreResults(categoryTitle, endpoint, rowId, contentType = 'movie', provider = 'tmdb') {
    searchDashboardVisible = false;
    document.getElementById('search-dashboard').style.display = 'none';
    document.getElementById('search-results-wrapper').style.display = 'block';

    moreResultsState = {
        endpoint: endpoint,
        page: 1,
        categoryTitle: categoryTitle,
        totalPages: null,
        isLoading: false,
        contentType: contentType,
        provider: provider,
        hasMore: true,
        isSearch: false
    };
    loadedResultIds = new Set();

    // Cambiar a la pestaña de búsqueda
    const tabBtn = document.querySelector('.tab-btn[data-tab="buscar"]');
    if (tabBtn) {
        switchTab('buscar');
    }

    // Determinar el filtro visual
    let filterValue;
    if (contentType === 'anime') {
        filterValue = 'anime';
    } else {
        const filterMap = { 'movie': 'movie', 'tv': 'tv', 'anime': 'anime' };
        filterValue = filterMap[contentType] || 'movie';
    }
    currentSearchFilter = filterValue;

    // Activar filtro visual
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filterValue);
    });

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = `Mostrando: ${categoryTitle}`;
    }

    const resultsTitle = document.getElementById('search-results-title');
    if (resultsTitle) {
        resultsTitle.textContent = `${categoryTitle} - Ver más`;
    }

    // Cargar la primera página
    loadMoreResults();
}

async function loadMoreResults() {
    if (!moreResultsState) return;
    if (moreResultsState.isLoading) return;
    if (moreResultsState.totalPages !== null && moreResultsState.page > moreResultsState.totalPages) {
        moreResultsState.hasMore = false;
        return;
    }
    if (moreResultsState.provider === 'animeav1' && moreResultsState.hasMore === false) return;

    moreResultsState.isLoading = true;
    const { endpoint, page, categoryTitle, contentType, provider, query } = moreResultsState;
    const resultsGrid = document.getElementById("search-results-grid");
    if (!resultsGrid) {
        moreResultsState.isLoading = false;
        return;
    }

    // ✅ Solo limpiar en la primera página
    if (page === 1) {
        resultsGrid.innerHTML = '<div class="no-results">Cargando...</div>';
    } else {
        // Eliminar mensaje de "No hay más resultados" si existe
        const noMore = document.getElementById('no-more-results');
        if (noMore) noMore.remove();
        // Mostrar indicador de carga al final
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'more-loading';
        loadingIndicator.textContent = 'Cargando más...';
        loadingIndicator.style.cssText = 'grid-column:1/-1; text-align:center; color:#aaa; padding:20px;';
        resultsGrid.appendChild(loadingIndicator);
    }

    try {
        let data, results = [];
        let isAnime = (provider === 'animeav1');

        if (moreResultsState.isSearch) {
            if (isAnime) {
                data = await fetchAnimeApi(`/search?q=${encodeURIComponent(query)}&page=${page}&limit=20`);
                results = data.results || [];
                moreResultsState.hasMore = true;
            } else {
                const url = `https://api.themoviedb.org/3/search/${contentType}?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(query)}&page=${page}`;
                const response = await fetch(url);
                data = await response.json();
                results = data.results || [];
                moreResultsState.totalPages = data.total_pages || 1;
                moreResultsState.hasMore = page < moreResultsState.totalPages;
            }
        } else if (isAnime) {
            // "Ver más" de anime
            data = await fetchAnimeApi(`${endpoint}&page=${page}&limit=20`);
            results = data.results || [];
            moreResultsState.hasMore = true;
        } else {
            // "Ver más" de TMDB
            const separator = endpoint.includes('?') ? '&' : '?';
            const url = `https://api.themoviedb.org/3${endpoint}${separator}api_key=${API_KEY}&language=es-ES&page=${page}`;
            const response = await fetch(url);
            data = await response.json();
            results = data.results || [];
            moreResultsState.totalPages = data.total_pages || 1;
            moreResultsState.hasMore = page < moreResultsState.totalPages;
        }

        // Eliminar indicador de carga (si existe)
        const loadingEl = document.getElementById('more-loading');
        if (loadingEl) loadingEl.remove();

        // Si es la primera página, limpiar el grid (ya se borró al inicio)
        if (page === 1) {
            resultsGrid.innerHTML = '';
        }

        // Si no hay resultados, mostrar mensaje y detener
        if (results.length === 0) {
            const noMore = document.createElement('div');
            noMore.id = 'no-more-results';
            noMore.textContent = 'No hay más resultados.';
            noMore.style.cssText = 'grid-column:1/-1; text-align:center; color:#aaa; padding:20px;';
            resultsGrid.appendChild(noMore);
            moreResultsState.hasMore = false;
            if (infiniteObserver) {
                infiniteObserver.disconnect();
                infiniteObserver = null;
            }
            moreResultsState.isLoading = false;
            return;
        }

        let newCardsAdded = 0;

       results.forEach(item => {
       if (isAnime) {
    if (item.provider?.toLowerCase() !== 'animeav1') return;
    if (!item.url) return;
    if (loadedResultIds.has(item.url)) return;
    loadedResultIds.add(item.url);
    newCardsAdded++;

    const title = item.title || 'Sin título';
    const poster = item.image || 'images/no-poster.jpg';
    const url = item.url;

    const card = document.createElement('div');
    card.classList.add('movie');
    card.dataset.url = url;
    card.dataset.title = title;

    // Overlay con placeholders (igual que en las filas)
    card.innerHTML = `
        <img src="${poster}" alt="${title}" loading="lazy">
        <div class="movie-overlay">
            <div class="movie-info">
                <div class="movie-title-hover">${title}</div>
                <div class="movie-meta-hover">Cargando...</div>
                <div class="movie-synopsis-hover">Cargando información...</div>
                <div class="movie-genres-hover"></div>
            </div>
        </div>
    `;

    // Evento mouseenter para cargar info bajo demanda
    card.addEventListener('mouseenter', function() {
        if (this._hoverTimer) clearTimeout(this._hoverTimer);
        this._hoverTimer = setTimeout(() => {
            loadAnimeCardInfo(this, this.dataset.url);
        }, 200);
    });

    card.addEventListener('click', () => showAnimeInfo(url, title));
    card.tabIndex = 0;
    resultsGrid.appendChild(card);
}

        else {
        const tmdbId = item.id;
        const mediaType = contentType;
        const title = item.title || item.name;
        const originalLang = item.original_language;
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "images/no-poster.jpg";
        const overview = item.overview || '';
        const year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
        const genreIds = item.genre_ids || [];

        const card = document.createElement('div');
        card.classList.add('movie');
        card.dataset.tmdbId = tmdbId;
        card.dataset.mediaType = mediaType;
        card.dataset.title = title;
        card.dataset.originalLang = originalLang;
        

        const genreNames = getGenreNamesFromIds(genreIds, mediaType);
        const synopsisShort = truncateSynopsis(overview, 20);

        card.innerHTML = `
            <img src="${poster}" alt="${title}" loading="lazy">
            <div class="movie-overlay">
                <div class="movie-info">
                    <div class="movie-title-hover">${title}</div>
                    <div class="movie-meta-hover">${mediaType === 'movie' ? 'Película' : 'Serie'}${year ? ` • ${year}` : ''}</div>
                    <div class="movie-synopsis-hover">${synopsisShort}</div>
                    <div class="movie-genres-hover">${genreNames}</div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
        const posterUrl = card.querySelector('img').src;
        const data = {
            tmdbId: tmdbId,
            mediaType: mediaType,
            title: title,
            originalLang: originalLang,
            posterPath: posterUrl,
            year: year,
            duration: '',
            overview: overview
        };
        openPlayerModal(data);
    });
        card.tabIndex = 0;
        resultsGrid.appendChild(card);
    }
});

        // Eliminar indicador de carga si existe


        // Decidir si hay más páginas
        if (isAnime) {
            // Si no se añadió ninguna tarjeta O se añadieron menos de 20 (y no es la primera página) -> fin
            if (newCardsAdded === 0 || (page > 1 && newCardsAdded < 20)) {
                moreResultsState.hasMore = false;
                // Mostrar "No hay más resultados" si no existe
                let noMore = document.getElementById('no-more-results');
                if (!noMore) {
                    noMore = document.createElement('div');
                    noMore.id = 'no-more-results';
                    noMore.textContent = 'No hay más resultados.';
                    noMore.style.cssText = 'grid-column:1/-1; text-align:center; color:#aaa; padding:20px;';
                    resultsGrid.appendChild(noMore);
                }
                if (infiniteObserver) {
                    infiniteObserver.disconnect();
                    infiniteObserver = null;
                }
                // No incrementar página ni configurar observador
                moreResultsState.isLoading = false;
                return; // Salir para no ejecutar el resto
            } else {
                // Hay más resultados, incrementar página y configurar observador
                moreResultsState.page += 1;
                setupInfiniteScroll();
            }
        } else {
            // TMDB: usar su paginación nativa
            moreResultsState.page += 1;
            setupInfiniteScroll();
        }

    } catch (error) {
        console.error('Error en loadMoreResults:', error);
        // Si es la primera página, mostrar error; si no, mostrar mensaje en el grid
        if (page === 1) {
            resultsGrid.innerHTML = '<div class="no-results">Error al cargar resultados.</div>';
        } else {
            const errorMsg = document.createElement('div');
            errorMsg.textContent = 'Error al cargar más resultados.';
            errorMsg.style.cssText = 'grid-column:1/-1; text-align:center; color:#ff6b6b; padding:20px;';
            resultsGrid.appendChild(errorMsg);
        }
    } finally {
        moreResultsState.isLoading = false;
    }

    // Función interna para el observador
    function setupInfiniteScroll() {
        if (infiniteObserver) {
            infiniteObserver.disconnect();
            infiniteObserver = null;
        }
        // El último hijo del grid (puede ser un mensaje de fin o una tarjeta)
        const lastChild = resultsGrid.lastElementChild;
        if (!lastChild) return;
        // Si es un mensaje de "No hay más resultados", no observar
        if (lastChild.id === 'no-more-results' || lastChild.id === 'more-loading') return;

        infiniteObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !moreResultsState.isLoading && moreResultsState.hasMore) {
                    loadMoreResults();
                }
            });
        }, { rootMargin: '0px 0px 100px 0px', threshold: 0.1 });
        infiniteObserver.observe(lastChild);
    }
}

// ==================== FUNCIÓN PARA SERIES (CORREGIDA) ====================
async function showMovieInfo(tmdbId, mediaType, title, originalLang, posterUrl) {
    try {
        showLoadingSpinner();

        isMovieMode = (mediaType === 'movie');
        clearTrailer();
        clearInfoFadeTimer();

        let url = mediaType === "movie"
            ? `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${API_KEY}&language=es-ES`
            : `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const tmdbData = await response.json();  // <-- Renombrado a tmdbData

        infoTitle.innerText = title;

        // Año
        const releaseDate = mediaType === "movie" ? tmdbData.release_date : tmdbData.first_air_date;
        const year = releaseDate ? releaseDate.split('-')[0] : "Año desconocido";

        // Duración
        let durationText = '';
        if (mediaType === 'movie') {
            durationText = formatRuntime(tmdbData.runtime);
        } else { // tv
            const episodes = tmdbData.number_of_episodes || '?';
            durationText = `${episodes} episodios`;
        }

        // Géneros
        let genresText = '';
        if (tmdbData.genres && tmdbData.genres.length > 0) {
            genresText = tmdbData.genres.map(g => g.name).join(', ');
        }

        // Metadatos
        let metaText = `${year} ● ${durationText}`;
        if (genresText) metaText += ` ● ${genresText}`;
        document.getElementById('info-meta-text').innerText = metaText;

        // Sinopsis
        infoSynopsis.innerText = truncateSynopsis(tmdbData.overview);

        const seriesPanel = document.getElementById('series-panel');
        if (mediaType === 'tv') {
            if (seriesPanel) seriesPanel.style.display = 'flex';
            const seasons = (tmdbData.seasons || []).filter(s => s.season_number > 0);
            const seasonsContainer = document.getElementById('seasons-container');
            if (seasonsContainer) {
                seasonsContainer.innerHTML = '';
                seasons.forEach(season => {
                    const btn = document.createElement('button');
                    btn.innerText = `Temporada ${season.season_number}`;
                    btn.classList.add('season-btn');
                    btn.addEventListener('click', () => {
                        loadEpisodesForSeason(tmdbId, season.season_number);
                        document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                    });
                    seasonsContainer.appendChild(btn);
                });
                if (seasons.length > 0) {
                    loadEpisodesForSeason(tmdbId, seasons[0].season_number);
                    const firstBtn = seasonsContainer.querySelector('.season-btn');
                    if (firstBtn) firstBtn.classList.add('selected');
                }
            }
        } else {
            if (seriesPanel) seriesPanel.style.display = 'none';
        }

        // Construir objeto para el modal (renombrado a modalData)
        const modalData = {
            tmdbId: tmdbId,
            mediaType: mediaType,
            title: title,
            originalLang: originalLang,
            posterPath: tmdbData.poster_path || '',
            year: year,
            duration: durationText,
            genre: tmdbData.genres ? tmdbData.genres.map(g => g.name).join(', ') : '',
            overview: tmdbData.overview || '',
            isAnime: isAnime,
        };
        if (mediaType === 'tv') {
            modalData.seasons = []; // se cargarán bajo demanda
        }

        // Guardar en currentMovieData (para recientes y progreso)
        currentMovieData = {
            tmdbId,
            mediaType,
            title,
            originalLang,
            posterPath: tmdbData.poster_path || '',
            year,
            duration: durationText,
            overview: tmdbData.overview || '',
            season: null,
            episode: null
        };

        // Verificar si es anime (para redirigir a la lógica de anime)
        const isAnime = tmdbData.genres?.some(g => g.id === 16) && tmdbData.original_language === 'ja';
        if (isAnime && (currentTab === 'anime' || currentTab === 'buscar')) {
            const animeUrl = await searchAnimeByTitle(title);
            if (animeUrl) {
                modalData.animeEpisodeUrl = animeUrl;
                modalData.isAnime = true;
            } else {
                console.warn(`No se encontró AnimeAV1 para "${title}", usando TMDB como fallback.`);
            }
        }

        // Backdrop
        const backdropDiv = document.getElementById('info-backdrop');
        if (backdropDiv) {
            const backdropUrl = tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}` : '';
            if (backdropUrl) {
                backdropDiv.style.backgroundImage = `url('${backdropUrl}')`;
            } else {
                backdropDiv.style.backgroundImage = 'none';
                backdropDiv.style.backgroundColor = '#0f0f0f';
            }
            backdropDiv.style.display = 'block';
        }

        // Tráiler (solo películas)
        if (mediaType === 'movie') {
            clearTrailer();
            const trailerKey = await getTrailer(tmdbId);
            if (trailerKey) {
                currentTrailerId = trailerKey;
                trailerTimeout = setTimeout(() => {
                    playTrailer(trailerKey);
                }, 4000);
            }
        }

        // Actualizar botones de favoritos y watch
        const isFav = isFavorite(tmdbId, mediaType);
        updateFavButton(isFav);
        updateWatchButton(mediaType);

        // Ocultar spinner y abrir modal
        hideLoadingSpinner();
        openPlayerModal(modalData);
        disableMainScroll();

    } catch (error) {
        console.error("Error cargando info:", error);
        infoLoading.classList.add('hidden');
        infoContentWrapper.style.display = 'flex';
        infoBackdrop.style.display = 'block';
        document.querySelector('.info-overlay').style.opacity = '1';
        infoTitle.innerText = 'Error al cargar la información';
        infoSynopsis.innerText = 'No se pudo cargar los datos. Intenta de nuevo.';
        infoWatchBtn.style.display = 'none';
        document.getElementById('series-panel').style.display = 'none';
        disableMainScroll();
    }
}

// ==================== FUNCIÓN PARA CARGAR EPISODIOS (TMDB) ====================
async function loadEpisodesForSeason(tvId, seasonNumber) {
    try {
        const url = `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const data = await response.json();
        const episodes = data.episodes || [];
        const episodesContainer = document.getElementById('episodes-container');
        if (!episodesContainer) {
            console.error("No se encuentra #episodes-container");
            return;
        }
        episodesContainer.innerHTML = '';
        
        // Guardar referencia a todos los botones
        const buttons = [];
        episodes.forEach(ep => {
            const btn = document.createElement('button');
            btn.innerText = `Capítulo ${ep.episode_number}`;
            btn.classList.add('episode-btn');
            btn.dataset.episode = ep.episode_number;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                if (currentMovieData) {
                    currentMovieData.season = seasonNumber;
                    currentMovieData.episode = ep.episode_number;
                    // Cambiar el botón directamente a "VER CAPÍTULO X"
                    const watchBtn = document.getElementById('info-watch-btn');
                    if (watchBtn) {
                        watchBtn.textContent = `VER CAPÍTULO ${ep.episode_number}`;
                    }
                }
                btn.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            });
            episodesContainer.appendChild(btn);
            buttons.push(btn);
        });

        // Determinar qué episodio seleccionar
        let targetEpisode = null;
        if (currentMovieData?.tmdbId) {
            const progress = getProgress(currentMovieData.tmdbId, 'tv');
            if (progress && progress.season === seasonNumber && progress.episode !== undefined) {
                targetEpisode = progress.episode;
            }
        }

        // Si no hay progreso para esta temporada, seleccionar el primero
        if (targetEpisode === null && buttons.length > 0) {
            targetEpisode = 1;
        }

        // Seleccionar el episodio sin disparar el evento click
        if (targetEpisode !== null) {
            const targetBtn = buttons.find(b => parseInt(b.dataset.episode) === targetEpisode);
            if (targetBtn) {
                // Marcar como seleccionado
                buttons.forEach(b => b.classList.remove('selected'));
                targetBtn.classList.add('selected');
                // Actualizar currentMovieData
                if (currentMovieData) {
                    currentMovieData.season = seasonNumber;
                    currentMovieData.episode = targetEpisode;
                }
                // Actualizar el texto del botón de ver
                const watchBtn = document.getElementById('info-watch-btn');
                if (watchBtn) {
                    // Si hay progreso, mostrar "CONTINUAR...", sino "VER CAPÍTULO X"
                    const progress = getProgress(currentMovieData?.tmdbId, 'tv');
                    if (progress && progress.season === seasonNumber && progress.episode === targetEpisode) {
                        watchBtn.textContent = `CONTINUAR CAPÍTULO ${targetEpisode}`;
                    } else {
                        watchBtn.textContent = `VER CAPÍTULO ${targetEpisode}`;
                    }
                }
            }
        }

    } catch (error) {
        console.error("Error cargando episodios:", error);
        const episodesContainer = document.getElementById('episodes-container');
        if (episodesContainer) episodesContainer.innerHTML = '<div>Error al cargar episodios</div>';
    }
}

// ==================== REPRODUCTOR (TMDB / VidSrc) ====================
// Estado global para el reproductor
let currentPlayerData = null;    // { tmdbId, mediaType, title, season, episode, originalLang }
let currentApi = 'unlimplay';   // 'unlimplay' o 'vidsrc'

// Función para generar la URL según la API y los datos
function buildPlayerUrl(api, tmdbId, mediaType, season, episode) {
    if (mediaType === 'movie') {
        if (api === 'unlimplay') {
            return `https://unlimplay.com/f/embed/movie/${tmdbId}`;
        } else { // vidsrc
            return `https://vidsrc-embed.ru/embed/movie?tmdb=${tmdbId}&autoplay=1`;
        }
    } else if (mediaType === 'tv') {
        if (season === null || episode === null) {
            return null;
        }
        if (api === 'unlimplay') {
            return `https://unlimplay.com/f/embed/tv/${tmdbId}/${season}/${episode}`;
        } else { // vidsrc
            return `https://vidsrc-embed.ru/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}&autoplay=1`;
        }
    }
    return null;
}

async function loadRelatedContent(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
        const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/recommendations?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const data = await response.json();
        const results = data.results || [];
        const grid = document.getElementById('related-grid');
        grid.innerHTML = '';
        results.slice(0, 6).forEach(item => {
            const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : 'images/no-poster.jpg';
            const title = item.title || item.name;
            const id = item.id;
            const div = document.createElement('div');
            div.classList.add('related-item');
            div.innerHTML = `
                <img src="${poster}" alt="${title}" loading="lazy">
            `;
            div.addEventListener('click', () => {
                const newData = {
                    tmdbId: id,
                    mediaType: mediaType,
                    title: title,
                    originalLang: item.original_language,
                    posterPath: poster,
                    year: item.release_date ? item.release_date.split('-')[0] : '',
                    duration: '',
                    overview: item.overview || ''
                };
                // Abrir el nuevo contenido en el mismo modal
                openPlayerModal(newData);
            });

            grid.appendChild(div);
        });
    } catch (error) {
        console.error('Error cargando relacionados:', error);
    }
}

// Función principal para abrir el reproductor modal
function playMedia(tmdbId, mediaType, title, originalLang, season = null, episode = null) {
    // Guardar datos para recarga
    currentPlayerData = { tmdbId, mediaType, title, season, episode, originalLang};

    // Construir URL con la API actual
    const url = buildPlayerUrl(currentApi, tmdbId, mediaType, season, episode);
    if (!url) {
        alert(`No se puede reproducir "${title}". Faltan datos.`);
        return;
    }

    // Guardar progreso
    if (mediaType === 'movie') {
        saveProgress(tmdbId, 'movie');
    } else if (mediaType === 'tv' && season !== null && episode !== null) {
        saveProgress(tmdbId, 'tv', season, episode);
    }

    // Agregar a recientes
    if (currentMovieData && currentMovieData.posterPath) {
        addToRecent(tmdbId, mediaType, title, currentMovieData.posterPath, originalLang);
    }

    // Mostrar modal
    const modal = document.getElementById('player-modal');
    const iframe = document.getElementById('player-iframe');

    iframe.src = url;
    
    modal.style.display = 'flex';
    updatePlayerTitle();
    // Actualizar sinopsis y metadatos desde currentModalData (si existe)
    const synopsisEl = document.getElementById('player-synopsis');
    if (synopsisEl) {
        synopsisEl.textContent = currentModalData?.overview || currentMovieData?.overview || 'Sin sinopsis disponible';
    }
    const metaEl = document.getElementById('player-meta');
    if (metaEl) {
        const year = currentModalData?.year || currentMovieData?.year || '';
        const duration = currentModalData?.duration || currentMovieData?.duration || '';
        metaEl.innerHTML = `
            <span class="player-year">${year}</span>
            <span class="player-duration">${duration}</span>
        `;
    }

    // ---- ACTUALIZAR INFORMACIÓN ----
    // Construir título con temporada/capítulo si es serie
    let displayTitle = title;
    if (mediaType === 'tv' && season !== null && episode !== null) {
        displayTitle = `${title} (Temporada ${season} - Capítulo ${episode})`;
    }
    //document.getElementById('player-title').textContent = displayTitle;

    // Metadatos: año y duración (si están disponibles en currentMovieData)
    const year = currentMovieData?.year || '';
    const duration = currentMovieData?.duration || '';
    document.getElementById('player-meta').innerHTML = `
        <span class="player-year">${year}</span>
        <span class="player-duration">${duration}</span>
    `;
    document.getElementById('player-synopsis').textContent = currentMovieData?.overview || '';

    // Cargar relacionados (recomendaciones)
    loadRelatedContent(tmdbId, mediaType);

    // Actualizar selector de API visualmente
    document.querySelectorAll('.api-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.api === currentApi);
    });


    // Deshabilitar scroll
    disableMainScroll();

    // Asegurar que no esté en fullscreen (por si acaso)
    modal.classList.remove('fullscreen');
}

// Función para cambiar de API y recargar
function switchPlayerApi(api) {
    if (api === currentApi) return;
    const iframe = document.getElementById('player-iframe');
    const data = currentPlayerData;
    currentApi = api;

    // Actualizar botones visualmente
    document.querySelectorAll('.api-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.api === api);
    });

    // Si hay un capítulo seleccionado y el modal está abierto, recargar
    if (currentSeason !== null && currentEpisode !== null && document.getElementById('player-modal').style.display === 'flex') {
        // Mostrar spinner antes de recargar
        const loadingEl = document.getElementById('player-iframe-loading');
        if (loadingEl) loadingEl.classList.remove('hidden');
        playCurrentEpisode();
    }
}


// Detener y eliminar el tráiler
function clearTrailer() {
    console.log('🧹 Limpiando tráiler');
    const container = document.getElementById('trailer-container');
    if (container) {
        // Detener el video
        const iframe = container.querySelector('iframe');
        if (iframe) {
            iframe.src = 'about:blank';
            try { iframe.contentWindow.stop(); } catch (e) {}
        }
        // Eliminar el contenedor
        container.remove();
    }

    // Restaurar backdrop
    const backdrop = document.getElementById('info-backdrop');
    if (backdrop) {
        backdrop.style.transition = 'opacity 1.5s ease';
        backdrop.style.opacity = '1';
        backdrop.style.display = 'block';
    }

    // Limpiar timeouts
    if (trailerTimeout) {
        clearTimeout(trailerTimeout);
        trailerTimeout = null;
    }
    if (infoFadeTimer) {
        clearTimeout(infoFadeTimer);
        infoFadeTimer = null;
    }
    // Restaurar visibilidad de la información
    showInfoOverlay();
    
}


// ==================== MODO CINE ====================
function hideInfoOverlay() {
    const overlay = document.querySelector('.info-overlay');
    const mainContent = document.querySelector('.info-main');
    const backBtn = document.querySelector('.info-back-btn');
    const seriesPanel = document.querySelector('.series-panel');

    if (overlay) {
        overlay.style.transition = 'opacity 1s ease';
        overlay.style.opacity = '0';
    }
    if (mainContent) {
        mainContent.style.transition = 'opacity 1s ease, transform 0.8s ease';
        mainContent.style.opacity = '0';
        mainContent.style.transform = 'translateY(20px)';
    }
    if (backBtn) {
        backBtn.style.transition = 'opacity 1s ease, transform 0.8s ease';
        backBtn.style.opacity = '0';
        backBtn.style.transform = 'translateY(-10px)';
    }
    if (seriesPanel) {
        seriesPanel.style.transition = 'opacity 1s ease, transform 0.8s ease';
        seriesPanel.style.opacity = '0';
        seriesPanel.style.transform = 'translateX(20px)';
    }
    isInfoVisible = false;
    console.log('🎬 Modo cine activado');
}

function showInfoOverlay() {
    const overlay = document.querySelector('.info-overlay');
    const mainContent = document.querySelector('.info-main');
    const backBtn = document.querySelector('.info-back-btn');
    const seriesPanel = document.querySelector('.series-panel');

    if (overlay) {
        overlay.style.transition = 'none';
        overlay.style.opacity = '1';
    }
    if (mainContent) {
        mainContent.style.transition = 'none';
        mainContent.style.opacity = '1';
        mainContent.style.transform = 'translateY(0)';
    }
    if (backBtn) {
        backBtn.style.transition = 'none';
        backBtn.style.opacity = '1';
        backBtn.style.transform = 'translateY(0)';
    }
    if (seriesPanel) {
        seriesPanel.style.transition = 'none';
        seriesPanel.style.opacity = '1';
        seriesPanel.style.transform = 'translateX(0)';
    }
    isInfoVisible = true;
    console.log('Información restaurada');
}
function resetInfoFadeTimer() {
    // Solo iniciar el temporizador si estamos en modo película
    if (!isMovieMode) return;

    if (infoFadeTimer) {
        clearTimeout(infoFadeTimer);
        infoFadeTimer = null;
    }
    if (isInfoVisible) {
        infoFadeTimer = setTimeout(() => {
            hideInfoOverlay();
        }, 8000);
    }
}

function clearInfoFadeTimer() {
    if (infoFadeTimer) {
        clearTimeout(infoFadeTimer);
        infoFadeTimer = null;
    }
    showInfoOverlay();
}

function handleUserInteraction(e) {
    // Si el evento viene de un campo de texto, no hacer nada
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
    }
    if (!isInfoVisible) {
        showInfoOverlay();
    }
}

function closePlayer() {
    // Limpiar eventos y temporizador
    if (backButtonTimer) clearTimeout(backButtonTimer);
    playerFullscreen.removeEventListener('mousemove', showBackButton);
    playerFullscreen.removeEventListener('click', showBackButton);
    playerFullscreen.removeEventListener('touchstart', showBackButton);

    playerFullscreen.style.display = "none";
    removeGlobalPlayerListeners();
    playerContainer.innerHTML = "";
    // Restaurar contenido...
}



// Obtener el primer episodio de una serie (temporada y número)
async function getFirstEpisode(tvId) {
    try {
        // Obtener detalles de la serie
        const url = `https://api.themoviedb.org/3/tv/${tvId}?api_key=${API_KEY}&language=es-ES`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data.seasons || data.seasons.length === 0) return null;
        // Buscar la primera temporada (season_number > 0)
        const firstSeason = data.seasons.find(s => s.season_number > 0);
        if (!firstSeason) return null;
        // Obtener episodios de esa temporada
        const seasonUrl = `https://api.themoviedb.org/3/tv/${tvId}/season/${firstSeason.season_number}?api_key=${API_KEY}&language=es-ES`;
        const seasonResp = await fetch(seasonUrl);
        const seasonData = await seasonResp.json();
        if (!seasonData.episodes || seasonData.episodes.length === 0) return null;
        const firstEpisode = seasonData.episodes[0];
        return {
            season: firstSeason.season_number,
            episode: firstEpisode.episode_number
        };
    } catch (error) {
        console.warn('Error obteniendo primer episodio:', error);
        return null;
    }
}


// ==================== SCROLL ====================
function disableMainScroll() {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
}

function enableMainScroll() {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
}

// ==================== RECIENTES ====================
function addToRecent(tmdbId, mediaType, title, posterPath, originalLang, animeUrl = null, isMovie = false) {
    console.log('addToRecent llamada con:', tmdbId, mediaType, title, posterPath, animeUrl);
    try {
        let recents = JSON.parse(localStorage.getItem('recentItems')) || [];
        // Generar identificador único
        let id;
        if (tmdbId) {
            id = tmdbId;          // ✅ Prioridad igual que en saveProgress
        } else if (mediaType === 'anime' && animeUrl) {
            id = animeUrl;
        } else {
            id = title;
        }

        console.log("Nuevo:", {
            id,
            tmdbId,
            mediaType,
            title,
            animeUrl
        });

        console.table(recents);

        recents = recents.filter(item => {
            const eliminar =
                (tmdbId && item.tmdbId == tmdbId) ||
                (animeUrl && item.animeUrl === animeUrl) ||
                (item.title === title && item.mediaType === mediaType);

            if (eliminar) {
                console.log("Eliminando:", item);
            }

            return !eliminar;
        });

        recents.unshift({
            id: id,
            tmdbId: tmdbId,
            mediaType: mediaType,
            title: title,
            posterPath: posterPath || '',
            originalLang: originalLang || '',
            animeUrl: animeUrl,
            isMovie: isMovie,
            timestamp: Date.now()
        });
        if (recents.length > 10) recents.pop();
        console.table(recents);
        localStorage.setItem('recentItems', JSON.stringify(recents));
        loadRecentRow();
    } catch (e) {
        console.error('Error guardando en recientes:', e);
    }
}


function loadRecentRow() {
    console.log(
    "loadRecentRow",
    document.querySelectorAll("#row-recientes").length
);

    const container = document.getElementById('categories-container-inicio');
    if (!container) return;


    let rowElement = document.getElementById('row-recientes');
    if (!rowElement) {
        const categoryDiv = document.createElement('div');
        categoryDiv.classList.add('category');
        categoryDiv.setAttribute('data-category-id', 'recientes');
        categoryDiv.innerHTML = `<h2>Mi Lista</h2><div class="row" id="row-recientes"></div>`;
        container.prepend(categoryDiv);
        rowElement = document.getElementById('row-recientes');
    }

    let recents = [];
    try {
        recents = JSON.parse(localStorage.getItem('recentItems')) || [];
    } catch (e) {
        console.error('Error cargando recientes:', e);
    }

    if (recents.length === 0) {
        rowElement.innerHTML = `<div style="color: #aaa; padding: 20px;">No hay contenido reciente</div>`;
        return;
    }

    // Limitar a 5 (o el número que quieras)
    recents = recents.slice(0, 5);

    console.log("ANTES", rowElement.children.length);
    rowElement.innerHTML = '';
    let cardIndex = 0;

    recents.forEach(item => {
    const card = document.createElement('div');
    card.classList.add('recent-item');

    let poster;
    if (item.posterPath && item.posterPath.startsWith('http')) {
        poster = item.posterPath;
    } else if (item.posterPath) {
        poster = `https://image.tmdb.org/t/p/w500${item.posterPath}`;
    } else {
        poster = "images/no-poster.jpg";
    }

    const identifier = item.tmdbId || item.id || item.animeUrl || item.title;
    const buttonText = getWatchButtonText(item.mediaType, identifier, item.isMovie || false);

    card.dataset.tmdbId = item.tmdbId || '';
    card.dataset.mediaType = item.mediaType || 'movie';
    card.dataset.title = item.title || '';
    card.dataset.originalLang = item.originalLang || '';
    card.dataset.poster = poster;
    card.dataset.animeUrl = item.animeUrl || '';
    card.dataset.identifier = identifier;
    card.dataset.isMovie = item.isMovie || false;

    card.innerHTML = `
        <div class="recent-expanded-content">
            <div class="expanded-backdrop" style="background-image: url('${poster}'); filter: blur(0.2px) brightness(0.5);"></div>
            <div class="expanded-info">
                <div class="expanded-title">${item.title || 'Sin título'}</div>
                <div class="expanded-meta">${getRecentLabel(item)}</div>
                <button class="expanded-watch-btn">${buttonText}</button>
            </div>
        </div>
    `;

    // ========== EVENTO CLICK EN LA TARJETA ==========
    card.addEventListener('click', async function(e) {
        if (e.target.closest('.expanded-watch-btn')) return;

        const tmdbId = this.dataset.tmdbId;
        const mediaType = this.dataset.mediaType;
        const title = this.dataset.title;
        const originalLang = this.dataset.originalLang;
        const posterUrl = this.dataset.poster;
        const animeUrl = this.dataset.animeUrl;
        const isMovie = this.dataset.isMovie === 'true';

        // Si es anime y no tiene tmdbId, intentar obtenerlo
        let finalTmdbId = tmdbId;
        if (mediaType === 'anime' && !finalTmdbId && title) {
            finalTmdbId = await getTmdbIdByTitle(title);
        }

        const data = {
            tmdbId: finalTmdbId || null,
            mediaType: mediaType,
            title: title,
            originalLang: originalLang || '',
            posterPath: posterUrl || '',
            year: '',
            duration: '',
            overview: '',
            animeEpisodeUrl: animeUrl || null,
            isAnime: mediaType === 'anime'
        };
        openPlayerModal(data);
    });

    // ========== EVENTO CLICK EN EL BOTÓN "VER" ==========
    const watchBtn = card.querySelector('.expanded-watch-btn');
    if (watchBtn) {
        watchBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const tmdbId = card.dataset.tmdbId;
            const mediaType = card.dataset.mediaType;
            const title = card.dataset.title;
            const originalLang = card.dataset.originalLang;
            const identifier = card.dataset.identifier;
            const isMovie = card.dataset.isMovie === 'true';

            const progress = getProgress(identifier, mediaType);
            let season = null, episode = null;

            if (mediaType === 'tv' && progress && progress.season !== undefined && progress.episode !== undefined) {
                season = progress.season;
                episode = progress.episode;
            } else if (mediaType === 'anime' && !isMovie && progress && progress.episode !== undefined) {
                // Para anime serie, abrir modal con el episodio guardado
                const data = {
                    tmdbId: tmdbId,
                    mediaType: 'anime',
                    title: title,
                    originalLang: originalLang,
                    posterPath: card.dataset.poster,
                    year: '',
                    duration: '',
                    overview: '',
                    animeEpisodeUrl: card.dataset.animeUrl,
                    isAnime: true
                };
                openPlayerModal(data);
                return;
            }

            if (mediaType === 'movie') {
                playMedia(tmdbId, 'movie', title, originalLang);
            } else if (mediaType === 'tv' && season !== null && episode !== null) {
                playMedia(tmdbId, 'tv', title, originalLang, season, episode);
            } else {
                // Si no hay progreso, abrir modal para seleccionar
                const data = {
                    tmdbId: tmdbId,
                    mediaType: mediaType,
                    title: title,
                    originalLang: originalLang,
                    posterPath: card.dataset.poster,
                    year: '',
                    duration: '',
                    overview: '',
                    animeEpisodeUrl: card.dataset.animeUrl,
                    isAnime: mediaType === 'anime'
                };
                openPlayerModal(data);
            }
        });
    }

    card.style.animationDelay = `${cardIndex * 0.05}s`;
    rowElement.appendChild(card);
    cardIndex++;
});

    console.log("DESPUÉS", rowElement.children.length);
}


// ==================== FAVORITOS ====================
function isFavorite(tmdbId, mediaType, title) {
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    return favorites.some(item => {
        // Si tenemos tmdbId, buscar por tmdbId y mediaType
        if (tmdbId && item.tmdbId === tmdbId && item.mediaType === mediaType) return true;
        // Si no hay tmdbId (anime), buscar por título y mediaType
        if (!tmdbId && item.title === title && item.mediaType === mediaType) return true;
        // También si el tmdbId del item es null y el título coincide
        if (item.tmdbId === null && item.title === title && item.mediaType === mediaType) return true;
        return false;
    });
}
function toggleFavorite(tmdbId, mediaType, title, posterPath, originalLang) {
    // Usar el título como identificador si no hay tmdbId
    const identifier = tmdbId || title;
    if (!identifier) {
        alert('No se puede agregar a favoritos: falta título o ID.');
        return false;
    }

    let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const index = favorites.findIndex(item => {
        if (tmdbId && item.tmdbId === tmdbId && item.mediaType === mediaType) return true;
        if (!tmdbId && item.title === title && item.mediaType === mediaType) return true;
        return false;
    });

    if (index !== -1) {
        favorites.splice(index, 1);
        localStorage.setItem('favorites', JSON.stringify(favorites));
        updateFavButton(false);
        updatePlayerFavButton();
        loadFavorites();
        return false;
    } else {
        favorites.push({
            tmdbId: tmdbId || null,
            mediaType: mediaType,
            title: title,
            posterPath: posterPath || '',
            originalLang: originalLang || '',
            timestamp: Date.now()
        });
        localStorage.setItem('favorites', JSON.stringify(favorites));
        updateFavButton(true);
        updatePlayerFavButton();
        loadFavorites();
        return true;
    }
}
// El botón 'player-back-btn' ya tiene el evento closePlayerModal
// Modifica closePlayerModal para que, si el modal está en fullscreen, primero salga de fullscreen y luego cierre.
function closePlayerModal() {
    const modal = document.getElementById('player-modal');
    const iframe = document.getElementById('player-iframe');
    const loadingEl = document.getElementById('player-iframe-loading');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (document.fullscreenElement) {
        document.exitFullscreen().then(() => {
            modal.classList.remove('fullscreen');
        });
    }

    iframe.src = '';
    modal.style.display = 'none';
    modal.classList.remove('fullscreen');
    enableMainScroll();

    // Restaurar banner
    const banner = document.getElementById('player-banner');
    banner.style.display = 'flex';
    banner.style.opacity = '1';
    isBannerVisible = true;
    updateControlsBarBackground();
    document.getElementById('player-iframe-wrapper').style.display = 'none';

    // Volver a la ventana de información o a la pestaña anterior
    if (currentMovieData) {
        showMovieInfo(currentMovieData.tmdbId, currentMovieData.mediaType, currentMovieData.title, currentMovieData.originalLang, currentMovieData.posterPath);
    } else {
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) switchTab(activeTab.dataset.tab);
    }
    document.querySelectorAll('.api-btn').forEach(btn => {
        btn.style.display = '';
    });
}

function updateFavButton(isFav) {
    const favBtn = document.getElementById('info-fav-btn');
    if (!favBtn) return;

    // Restaurar estilos por defecto (habilitado)
    favBtn.disabled = false;
    favBtn.style.opacity = '1';
    favBtn.style.cursor = 'pointer';

    if (isFav) {
        favBtn.textContent = '♥ Quitar de Favoritos';
        favBtn.classList.add('active');
    } else {
        favBtn.textContent = '♡ Agregar a Favoritos';
        favBtn.classList.remove('active');
    }
}

async function loadFavorites() {
    const grid = document.getElementById('favoritos-grid');
    if (!grid) return;
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];

    if (favorites.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#aaa; font-size:1.2rem; padding:40px;">No tienes favoritos aún.</div>`;
        return;
    }

    grid.innerHTML = '';
    for (const item of favorites) {
        const card = document.createElement('div');
        card.classList.add('favorito-item');
        card.tabIndex = 0;

        let poster;
        if (item.posterPath && item.posterPath.startsWith('http')) {
            poster = item.posterPath;
        } else if (item.posterPath) {
            poster = `https://image.tmdb.org/t/p/w500${item.posterPath}`;
        } else {
            poster = "images/no-poster.jpg";
        }

        card.innerHTML = `
            <img src="${poster}" alt="${item.title}" loading="lazy">
            <div class="movie-overlay">
                <div class="movie-info">
                    <div class="movie-title-hover">${item.title}</div>
                    <div class="movie-meta-hover">${item.mediaType === 'movie' ? 'Película' : (item.mediaType === 'tv' ? 'Serie' : 'Anime')}</div>
                </div>
            </div>
        `;

        // ✅ Evento click actualizado para usar openPlayerModal
        card.addEventListener('click', async () => {
            const posterUrl = card.querySelector('img').src;
            const data = {
                tmdbId: item.tmdbId || null,
                mediaType: item.mediaType,
                title: item.title,
                originalLang: item.originalLang || '',
                posterPath: posterUrl,
                year: '',
                duration: '',
                overview: '',
                isAnime: item.mediaType === 'anime',
                animeEpisodeUrl: null // no tenemos URL de AnimeAV1 en favoritos
            };
            openPlayerModal(data);
        });

        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') card.click();
        });

        grid.appendChild(card);
    }
}

// ==================== PROGRESO ====================
function saveProgress(identifier, mediaType, season = null, episode = null) {
    let progress = JSON.parse(localStorage.getItem('watchProgress')) || {};
    const key = `${mediaType}_${identifier}`; // Clave compuesta para evitar colisiones
    if (mediaType === 'movie') {
        progress[key] = { mediaType, watched: true, timestamp: Date.now() };
    } else if (mediaType === 'tv' && season !== null && episode !== null) {
        progress[key] = { mediaType, season, episode, timestamp: Date.now() };
    } else if (mediaType === 'anime' && episode !== null) {
        progress[key] = { mediaType, episode, timestamp: Date.now() };
    }
    localStorage.setItem('watchProgress', JSON.stringify(progress));
}

function getProgress(identifier, mediaType) {
    const progress = JSON.parse(localStorage.getItem('watchProgress')) || {};
    const key = `${mediaType}_${identifier}`;
    return progress[key] || null;
}

function updateWatchButton(mediaType, title, season = null, episode = null) {
    const watchBtn = document.getElementById('info-watch-btn');
    if (!watchBtn) return;

    if (mediaType === 'movie') {
        const progress = getProgress(currentMovieData?.tmdbId, 'movie');
        if (progress && progress.watched) {
            watchBtn.textContent = 'CONTINUAR VIENDO';
        } else {
            watchBtn.textContent = 'VER AHORA';
        }
    } else if (mediaType === 'tv') {
        // Si se pasan season/episode (selección manual), priorizar
        if (season !== null && episode !== null) {
            watchBtn.textContent = `VER CAPÍTULO ${episode}`;
            if (currentMovieData) {
                currentMovieData.season = season;
                currentMovieData.episode = episode;
            }
        } else {
            // Obtener progreso
            const progress = getProgress(currentMovieData?.tmdbId, 'tv');
            if (progress && progress.season !== undefined && progress.episode !== undefined) {
                watchBtn.textContent = `CONTINUAR CAPÍTULO ${progress.episode}`;
                if (currentMovieData) {
                    currentMovieData.season = progress.season;
                    currentMovieData.episode = progress.episode;
                }
            } else {
                // Si hay selección manual en currentMovieData (sin progreso)
                if (currentMovieData?.season !== undefined && currentMovieData?.episode !== undefined) {
                    watchBtn.textContent = `VER CAPÍTULO ${currentMovieData.episode}`;
                } else {
                    watchBtn.textContent = 'VER AHORA';
                }
            }
        }
} else if (mediaType === 'anime') {
    const identifier = currentMovieData?.tmdbId || currentMovieData?.animeUrl;
    if (!identifier) {
        watchBtn.textContent = 'VER AHORA';
        return;
    }
    const progress = getProgress(identifier, 'anime');
    if (currentMovieData?.isMovie) {
        // Película de anime
        if (progress && progress.episode !== undefined) {
            watchBtn.textContent = 'CONTINUAR VIENDO';
        } else {
            watchBtn.textContent = 'VER AHORA';
        }
    } else {
        // Serie de anime
        if (progress && progress.episode !== undefined) {
            watchBtn.textContent = `CONTINUAR CAPÍTULO ${progress.episode}`;
        } else {
            if (currentMovieData?.episodeNumber) {
                watchBtn.textContent = `VER CAPÍTULO ${currentMovieData.episodeNumber}`;
            } else {
                watchBtn.textContent = 'VER AHORA';
            }
        }
    }
}
}

// ==================== POPUNDER (CLIC EN CARRUSEL) ====================
let popunderLoaded = false;

function loadPopunder() {
    if (popunderLoaded) return;
    popunderLoaded = true;
    const script = document.createElement('script');
    script.src = 'https://pl30421603.effectivecpmnetwork.com/46/1d/2d/461d2dd94f730891520b7ed75a0205df.js';
    script.async = true;
    document.head.appendChild(script);
    console.log('🔄 Popunder activado');
}


// ==================== SMARTLINK DESPUÉS DE 5 MINUTOS ====================
const SMARTLINK_URL = 'https://www.effectivecpmnetwork.com/qxxkrnbr2t?key=5a28222862a82ecb880b4834e9d2c40f';
let watchTime = 0;
let watchInterval = null;
let smartlinkShown = false;
const SMARTLINK_THRESHOLD = 1 * 60; // 5 minutos en segundos

// Función para iniciar el seguimiento de tiempo de reproducción
function startWatchTimer() {
    if (watchInterval) return;
    
    watchInterval = setInterval(() => {
        // Verificar si el video se está reproduciendo
        const iframe = document.querySelector('#player-iframe-container iframe');
        // Nota: No podemos acceder directamente al tiempo de un iframe de terceros.
        // Alternativa: usar el tiempo de reproducción desde el reproductor o un contador simple.
        
        // Si el reproductor está visible, asumimos que se está reproduciendo
        if (playerFullscreen.style.display === 'flex') {
            watchTime++;
            
            if (watchTime >= SMARTLINK_THRESHOLD && !smartlinkShown) {
                smartlinkShown = true;
                showSmartlink();
                clearInterval(watchInterval);
                watchInterval = null;
            }
        }
    }, 1000); // Cada segundo
}

// Función para detener el temporizador
function stopWatchTimer() {
    if (watchInterval) {
        clearInterval(watchInterval);
        watchInterval = null;
    }
}

// Mostrar smartlink
function showSmartlink() {
    // Abrir el smartlink en una nueva ventana/pestaña
    window.open(SMARTLINK_URL, '_blank');
    
    // También podrías mostrarlo como un overlay o ventana modal
    console.log('🔗 Smartlink mostrado después de 5 minutos de reproducción');
}

// Reiniciar el contador cuando se cierra el reproductor
function resetWatchTimer() {
    watchTime = 0;
    smartlinkShown = false;
    stopWatchTimer();
}


// ==================== INICIALIZACIÓN ====================

window.addEventListener("DOMContentLoaded", () => {
// ==================== INICIALIZACIÓN ====================
// Asegurarse de que el DOM esté cargado antes de ejecutar cualquier código
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function initApp() {
    // Despertar API de anime, cargar géneros, etc.
    wakeUpAnimeApi();
    loadGenreMaps();
    createCategoryButtons();

    // ========== REPRODUCTOR MODAL ==========
    function initPlayerControls() {
    const playBtn = document.getElementById('player-play-btn-main');
    if (playBtn) {
        playBtn.addEventListener('click', function() {
            if (!currentModalData) return;
            // Ocultar banner y mostrar iframe
            const banner = document.getElementById('player-banner');
            banner.style.transition = 'opacity 0.5s ease';
            banner.style.opacity = '0';
            isBannerVisible = false;
            setTimeout(() => {
                banner.style.display = 'none';
                isBannerVisible = false;
                updateControlsBarBackground(); // <--- añadir
                document.getElementById('player-iframe-wrapper').style.display = 'block';
                playCurrentEpisode();
            }, 500);
        });
    }

        // Botón Volver
        const backBtn = document.getElementById('player-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', closePlayerModal);
        }

        
        const apiBtns = document.querySelectorAll('.api-btn');
        if (apiBtns.length > 0) {
            apiBtns.forEach(btn => {
                btn.addEventListener('click', function() {
                    switchPlayerApi(this.dataset.api);
                });
            });
        } else {
            console.warn('⚠️ No se encontraron botones .api-btn');
        }

        const fullscreenBtn = document.getElementById('player-fullscreen-btn');

        
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', function() {
                const modal = document.getElementById('player-modal');
                const container = document.getElementById('player-container');
                if (!modal || !container) return;

                if (!document.fullscreenElement) {
                    container.requestFullscreen().then(() => {
                        modal.classList.add('fullscreen');
                    }).catch(() => {
                        modal.classList.add('fullscreen');
                    });
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().then(() => {
                            modal.classList.remove('fullscreen');
                        });
                    } else {
                        modal.classList.remove('fullscreen');
                    }
                }
            });
        } else {
            console.warn('⚠️ No se encontró #player-fullscreen-btn');
        }

        // Botón favoritos (único)
        const favBtn = document.getElementById('player-fav-btn');
        if (favBtn) {
            favBtn.addEventListener('click', function() {
                if (!currentModalData) return;
                const { tmdbId, mediaType, title, originalLang, posterPath } = currentModalData;
                toggleFavorite(tmdbId, mediaType, title, posterPath || '', originalLang || '');
                // toggleFavorite ya actualiza los botones, no es necesario llamar aquí a updatePlayerFavButton
            });
        }

        document.addEventListener('fullscreenchange', () => {
            const modal = document.getElementById('player-modal');
            if (modal && !document.fullscreenElement) {
                modal.classList.remove('fullscreen');
            }
        });
    }

    initPlayerControls();

    // ========== RESTO DE LISTENERS ==========
    // Filtros de búsqueda
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentSearchFilter = this.dataset.filter;
            const searchInput = document.getElementById('search-input');
            const query = searchInput ? searchInput.value.trim() : '';
            if (query !== '') {
                performSearch(query, currentSearchFilter);
            } else {
                const activeTab = document.querySelector('.tab-btn.active');
                if (activeTab && activeTab.dataset.tab === 'buscar') {
                    searchDashboardVisible = true;
                    loadSearchDashboard();
                }
            }
        });
    });

    // Botón de favoritos en info-window
    const favBtn = document.getElementById('info-fav-btn');
    if (favBtn) {
        favBtn.addEventListener('click', () => {
            if (currentMovieData) {
                const { tmdbId, mediaType, title, originalLang, posterPath } = currentMovieData;
                if (tmdbId || title) {
                    toggleFavorite(tmdbId, mediaType, title, posterPath, originalLang);
                } else {
                    alert('No se puede agregar a favoritos: falta título.');
                }
            }
        });
    }

    // Búsqueda por input y botón
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    if (searchInput && searchBtn) {
        searchBtn.addEventListener('click', () => {
            performSearch(searchInput.value, currentSearchFilter);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performSearch(searchInput.value, currentSearchFilter);
                e.preventDefault();
            }
            if (e.key === ' ' || e.key === 'Space') {
                e.stopPropagation();
            }
        });
    }

    // Pestañas de navegación
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            if (tabId) switchTab(tabId);
        });
    });
    switchTab('inicio');

    // Botón de sonido del tráiler
    const unmuteBtn = document.getElementById('info-unmute-btn');
    if (unmuteBtn) {
        unmuteBtn.addEventListener('click', activarSonido);
    }

    // Interacciones para modo cine
    document.addEventListener('mousemove', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);
    document.addEventListener('click', handleUserInteraction);
}});

// Asegurar que las funciones globales estén disponibles
window.switchTab = switchTab;
