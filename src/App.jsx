import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Menu,
  Minimize2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
} from 'lucide-react'

const PAGE_COUNT = 34
const BASE_URL = import.meta.env.BASE_URL
const MIN_ZOOM = 1
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.25
const WHEEL_ZOOM_SENSITIVITY = 0.00135
const ZOOM_ANIMATION_MS = 180

const PROJECTS = [
  { start: 0, end: 0, short: 'Portada', title: 'Portada' },
  { start: 1, end: 2, short: 'Perfil', title: 'Perfil profesional' },
  { start: 3, end: 12, short: 'CECO5', title: 'Escuelas Bicentenario (CECO5)' },
  { start: 13, end: 20, short: 'PIU', title: 'Aeropuerto de Piura' },
  { start: 21, end: 26, short: 'Fovimar', title: 'Conjunto Residencial Fovimar' },
  { start: 27, end: 32, short: 'Mina', title: 'Modernización de acceso a mina' },
  { start: 33, end: 33, short: 'Final', title: 'Créditos' },
]

const PAGES = Array.from({ length: PAGE_COUNT }, (_, index) => {
  const project = PROJECTS.find(({ start, end }) => index >= start && index <= end)
  return {
    index,
    number: index + 1,
    image: `${BASE_URL}pages/page-${String(index + 1).padStart(2, '0')}.webp`,
    thumbnail: `${BASE_URL}thumbs/page-${String(index + 1).padStart(2, '0')}.webp`,
    project: project?.title ?? 'Portfolio 2026',
    short: project?.short ?? 'Portfolio',
  }
})

const PortfolioPage = forwardRef(function PortfolioPage({ page }, ref) {
  const isHardPage = page.index === 0 || page.index === PAGE_COUNT - 1

  return (
    <article
      ref={ref}
      className={`book-page${isHardPage ? ' book-page--hard' : ''}`}
      data-density={isHardPage ? 'hard' : 'soft'}
      aria-label={`Página ${page.number}: ${page.project}`}
    >
      <img
        src={page.image}
        alt={`Portfolio de César Calderón, página ${page.number}: ${page.project}`}
        width="2880"
        height="3600"
        loading={page.index < 5 ? 'eager' : 'lazy'}
        decoding={page.index < 3 ? 'sync' : 'async'}
        draggable="false"
      />
      <span className="sr-only">Página {page.number} de {PAGE_COUNT}</span>
    </article>
  )
})

let audioContext
let paperNoiseBuffer

function playPageSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  audioContext ??= new AudioContextClass()
  if (!paperNoiseBuffer) {
    const duration = 0.24
    paperNoiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate)
    const channel = paperNoiseBuffer.getChannelData(0)
    for (let i = 0; i < channel.length; i += 1) {
      const envelope = Math.sin((Math.PI * i) / channel.length) ** 1.8
      channel[i] = (Math.random() * 2 - 1) * envelope
    }
  }

  const source = audioContext.createBufferSource()
  const filter = audioContext.createBiquadFilter()
  const gain = audioContext.createGain()
  source.buffer = paperNoiseBuffer
  filter.type = 'bandpass'
  filter.frequency.value = 1800
  filter.Q.value = 0.7
  gain.gain.value = 0.022
  source.connect(filter).connect(gain).connect(audioContext.destination)
  source.start()
}

function pageFromUrl() {
  const candidate = Number(new URLSearchParams(window.location.search).get('page'))
  if (Number.isInteger(candidate) && candidate >= 1 && candidate <= PAGE_COUNT) return candidate - 1
  return window.innerWidth >= 840 ? 1 : 0
}

function calculateBookSize() {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const isMobile = viewportWidth < 840
  const horizontalAllowance = isMobile ? 40 : 220
  const verticalAllowance = isMobile ? 210 : 168
  const availableWidth = Math.max(280, viewportWidth - horizontalAllowance)
  const availableHeight = Math.max(350, viewportHeight - verticalAllowance)
  const width = Math.floor(Math.min(720, availableHeight * 0.8, isMobile ? availableWidth : availableWidth / 2))
  return { width, height: Math.round(width * 1.25), isMobile }
}

function useBookSize() {
  const [bookSize, setBookSize] = useState(calculateBookSize)

  useEffect(() => {
    let frameId
    const onResize = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => setBookSize(calculateBookSize()))
    }
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return bookSize
}

function pageLabel(currentPage, orientation) {
  if (currentPage === 0 || currentPage === PAGE_COUNT - 1 || orientation === 'portrait') {
    return `${String(currentPage + 1).padStart(2, '0')} / ${PAGE_COUNT}`
  }
  const nextPage = Math.min(currentPage + 2, PAGE_COUNT)
  return `${String(currentPage + 1).padStart(2, '0')} — ${String(nextPage).padStart(2, '0')} / ${PAGE_COUNT}`
}

function projectForPage(index) {
  return PROJECTS.find(({ start, end }) => index >= start && index <= end) ?? PROJECTS[0]
}

function ReaderButton({ children, className = '', icon: Icon, ...props }) {
  return (
    <button className={`reader-button ${className}`} type="button" {...props}>
      {Icon ? <Icon aria-hidden="true" strokeWidth={1.6} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  )
}

function App() {
  const bookRef = useRef(null)
  const readerFrameRef = useRef(null)
  const bookViewportRef = useRef(null)
  const readerOffsetElementRef = useRef(null)
  const readerZoomRef = useRef(MIN_ZOOM)
  const readerZoomAnchorRef = useRef(null)
  const readerOffsetRef = useRef({ x: 0, y: 0 })
  const readerPanRef = useRef(null)
  const pendingPanOffsetRef = useRef(null)
  const panAnimationFrameRef = useRef(null)
  const zoomAnimationFrameRef = useRef(null)
  const zoomAnimationTimerRef = useRef(null)
  const currentPageRef = useRef(pageFromUrl())
  const [currentPage, setCurrentPage] = useState(currentPageRef.current)
  const [orientation, setOrientation] = useState(() => (window.innerWidth < 840 ? 'portrait' : 'landscape'))
  const [indexOpen, setIndexOpen] = useState(false)
  const [readerZoomLevel, setReaderZoomLevel] = useState(MIN_ZOOM)
  const [isPanning, setIsPanning] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [isFlipping, setIsFlipping] = useState(false)
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const bookSize = useBookSize()
  const activeProject = projectForPage(currentPage)
  const coverFrameClass = currentPage === 0
    ? ' book-frame--cover book-frame--front-cover'
    : currentPage === PAGE_COUNT - 1
      ? ' book-frame--cover book-frame--back-cover'
      : ''
  const getPageFlip = useCallback(() => bookRef.current?.pageFlip(), [])

  const updateCurrentPage = useCallback((pageIndex) => {
    const nextPage = Math.max(0, Math.min(PAGE_COUNT - 1, Number(pageIndex) || 0))
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
    const url = new URL(window.location.href)
    if (nextPage === 0) url.searchParams.delete('page')
    else url.searchParams.set('page', String(nextPage + 1))
    window.history.replaceState({}, '', url)
  }, [])

  const goToPage = useCallback((pageIndex, animate = false) => {
    const pageFlip = getPageFlip()
    if (!pageFlip) return
    const nextPage = Math.max(0, Math.min(PAGE_COUNT - 1, pageIndex))
    if (animate && Math.abs(nextPage - currentPageRef.current) <= 2 && !reducedMotion) {
      pageFlip.flip(nextPage, 'bottom')
    } else {
      pageFlip.turnToPage(nextPage)
      updateCurrentPage(nextPage)
    }
  }, [getPageFlip, reducedMotion, updateCurrentPage])

  const flipPrevious = useCallback(() => {
    if (isFlipping || currentPageRef.current === 0) return
    if (reducedMotion) goToPage(Math.max(0, currentPageRef.current - (orientation === 'landscape' ? 2 : 1)))
    else getPageFlip()?.flipPrev('bottom')
  }, [getPageFlip, goToPage, isFlipping, orientation, reducedMotion])

  const flipNext = useCallback(() => {
    if (isFlipping || currentPageRef.current >= PAGE_COUNT - 1) return
    if (reducedMotion) goToPage(Math.min(PAGE_COUNT - 1, currentPageRef.current + (orientation === 'landscape' ? 2 : 1)))
    else getPageFlip()?.flipNext('bottom')
  }, [getPageFlip, goToPage, isFlipping, orientation, reducedMotion])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      setIsFullscreen(false)
    }
  }, [])

  const writeReaderOffset = useCallback((nextOffset) => {
    readerOffsetRef.current = nextOffset
    const offsetElement = readerOffsetElementRef.current
    if (!offsetElement) return
    offsetElement.style.setProperty('--reader-offset-x', `${nextOffset.x}px`)
    offsetElement.style.setProperty('--reader-offset-y', `${nextOffset.y}px`)
  }, [])

  const clampReaderOffset = useCallback((nextOffset, zoomLevel = readerZoomRef.current) => {
    const viewport = bookViewportRef.current
    if (!viewport) return nextOffset

    const viewportRect = viewport.getBoundingClientRect()
    const pageCount = bookSize.isMobile ? 1 : 2
    const scaledWidth = bookSize.width * pageCount * zoomLevel
    const scaledHeight = bookSize.height * zoomLevel
    const maxX = Math.max(0, (scaledWidth - viewportRect.width) / 2)
    const maxY = Math.max(0, (scaledHeight - viewportRect.height) / 2)

    return {
      x: Math.max(-maxX, Math.min(maxX, nextOffset.x)),
      y: Math.max(-maxY, Math.min(maxY, nextOffset.y)),
    }
  }, [bookSize.height, bookSize.isMobile, bookSize.width])

  const applyReaderZoom = useCallback((nextLevel, clientX, clientY) => {
    const currentLevel = readerZoomRef.current
    const clampedLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextLevel))
    if (Math.abs(clampedLevel - currentLevel) < 0.001) return

    const frame = readerFrameRef.current
    if (!frame) return

    const frameRect = frame.getBoundingClientRect()
    const anchorX = clientX ?? frameRect.left + frameRect.width / 2
    const anchorY = clientY ?? frameRect.top + frameRect.height / 2
    const zoomAnchor = {
      clientX: anchorX,
      clientY: anchorY,
      ratioX: Math.max(0, Math.min(1, (anchorX - frameRect.left) / frameRect.width)),
      ratioY: Math.max(0, Math.min(1, (anchorY - frameRect.top) / frameRect.height)),
    }
    readerZoomAnchorRef.current = zoomAnchor

    if (!reducedMotion) {
      window.clearTimeout(zoomAnimationTimerRef.current)
      window.cancelAnimationFrame(zoomAnimationFrameRef.current)
      frame.classList.add('is-zoom-transitioning')
      frame.style.setProperty('--reader-zoom-transition-scale', String(currentLevel / clampedLevel))
      frame.style.setProperty('--reader-zoom-origin-x', `${zoomAnchor.ratioX * 100}%`)
      frame.style.setProperty('--reader-zoom-origin-y', `${zoomAnchor.ratioY * 100}%`)
    }

    readerZoomRef.current = clampedLevel
    setReaderZoomLevel(clampedLevel)
  }, [reducedMotion])

  const resetReaderZoom = useCallback(() => {
    pendingPanOffsetRef.current = null
    window.cancelAnimationFrame(panAnimationFrameRef.current)
    setIsPanning(false)
    applyReaderZoom(MIN_ZOOM)
  }, [applyReaderZoom])

  const onReaderWheel = useCallback((event) => {
    if (indexOpen) return
    event.preventDefault()
    const deltaMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
    const pixelDelta = Math.max(-160, Math.min(160, event.deltaY * deltaMultiplier))
    applyReaderZoom(
      readerZoomRef.current * Math.exp(-pixelDelta * WHEEL_ZOOM_SENSITIVITY),
      event.clientX,
      event.clientY,
    )
  }, [applyReaderZoom, indexOpen])

  const onReaderPointerDown = useCallback((event) => {
    if (
      indexOpen
      || readerZoomRef.current <= MIN_ZOOM
      || !event.isPrimary
      || event.button !== 0
      || event.target.closest('button, a, input, select, textarea, .index-drawer, .drawer-backdrop')
    ) return

    readerPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: readerOffsetRef.current.x,
      originY: readerOffsetRef.current.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsPanning(true)
    event.preventDefault()
    event.stopPropagation()
  }, [indexOpen])

  const onReaderPointerMove = useCallback((event) => {
    const pan = readerPanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return

    pendingPanOffsetRef.current = clampReaderOffset({
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    })

    if (!panAnimationFrameRef.current) {
      panAnimationFrameRef.current = window.requestAnimationFrame(() => {
        if (pendingPanOffsetRef.current) writeReaderOffset(pendingPanOffsetRef.current)
        panAnimationFrameRef.current = null
      })
    }

    event.preventDefault()
    event.stopPropagation()
  }, [clampReaderOffset, writeReaderOffset])

  const endReaderPan = useCallback((event) => {
    const pan = readerPanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return

    if (pendingPanOffsetRef.current) writeReaderOffset(pendingPanOffsetRef.current)
    pendingPanOffsetRef.current = null
    readerPanRef.current = null
    window.cancelAnimationFrame(panAnimationFrameRef.current)
    panAnimationFrameRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsPanning(false)
    event.preventDefault()
    event.stopPropagation()
  }, [writeReaderOffset])

  const selectFromIndex = useCallback((pageIndex) => {
    goToPage(pageIndex)
    setIndexOpen(false)
  }, [goToPage])

  const onProgressPointerDown = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    goToPage(Math.round(ratio * (PAGE_COUNT - 1)))
  }, [goToPage])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && indexOpen) {
        setIndexOpen(false)
        return
      }
      if (indexOpen) return
      if (event.key === '+' || event.key === '=') applyReaderZoom(readerZoomRef.current + ZOOM_STEP)
      if (event.key === '-') applyReaderZoom(readerZoomRef.current - ZOOM_STEP)
      if (event.key === '0') resetReaderZoom()
      if (event.key === 'ArrowLeft') flipPrevious()
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault()
        flipNext()
      }
      if (event.key === 'Home') goToPage(0)
      if (event.key === 'End') goToPage(PAGE_COUNT - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [applyReaderZoom, flipNext, flipPrevious, goToPage, indexOpen, resetReaderZoom])

  useLayoutEffect(() => {
    const anchor = readerZoomAnchorRef.current
    const frame = readerFrameRef.current
    if (!anchor || !frame) return

    const frameRect = frame.getBoundingClientRect()
    const remainingX = frameRect.left + anchor.ratioX * frameRect.width - anchor.clientX
    const remainingY = frameRect.top + anchor.ratioY * frameRect.height - anchor.clientY
    const nextOffset = clampReaderOffset({
      x: readerOffsetRef.current.x - remainingX,
      y: readerOffsetRef.current.y - remainingY,
    }, readerZoomLevel)

    writeReaderOffset(nextOffset)
    readerZoomAnchorRef.current = null

    if (!reducedMotion) {
      zoomAnimationFrameRef.current = window.requestAnimationFrame(() => {
        frame.style.setProperty('--reader-zoom-transition-scale', '1')
        zoomAnimationTimerRef.current = window.setTimeout(() => {
          frame.classList.remove('is-zoom-transitioning')
          frame.style.removeProperty('--reader-zoom-transition-scale')
        }, ZOOM_ANIMATION_MS + 40)
      })
    }
  }, [clampReaderOffset, readerZoomLevel, reducedMotion, writeReaderOffset])

  useEffect(() => () => {
    window.cancelAnimationFrame(panAnimationFrameRef.current)
    window.cancelAnimationFrame(zoomAnimationFrameRef.current)
    window.clearTimeout(zoomAnimationTimerRef.current)
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  return (
    <main
      className={`portfolio-reader${readerZoomLevel > MIN_ZOOM ? ' is-reader-zoomed' : ''}${isPanning ? ' is-panning' : ''}`}
      onPointerDownCapture={onReaderPointerDown}
      onPointerMoveCapture={onReaderPointerMove}
      onPointerUpCapture={endReaderPan}
      onPointerCancelCapture={endReaderPan}
    >
      <header className="topbar">
        <button className="brand" type="button" onClick={() => goToPage(0)} aria-label="Volver a la portada">
          <strong>CÉSAR CALDERÓN</strong>
          <span>PORTFOLIO 2026</span>
        </button>

        <p className="discipline">ARQUITECTURA / BIM</p>

        <nav className="desktop-actions" aria-label="Controles del portfolio">
          <ReaderButton icon={Menu} onClick={() => setIndexOpen(true)}>ÍNDICE</ReaderButton>
          <span className="toolbar-divider" aria-hidden="true" />
          <ReaderButton icon={isFullscreen ? Minimize2 : Maximize2} onClick={toggleFullscreen}>
            {isFullscreen ? 'SALIR DE PANTALLA COMPLETA' : 'PANTALLA COMPLETA'}
          </ReaderButton>
        </nav>

        <ReaderButton
          className="mobile-menu"
          icon={Menu}
          aria-label="Abrir índice"
          onClick={() => setIndexOpen(true)}
        />
      </header>

      <section className="reader-stage" aria-label="Libro interactivo del portfolio" onWheel={onReaderWheel}>
        <button
          className="page-nav page-nav--previous"
          type="button"
          onClick={flipPrevious}
          disabled={currentPage === 0 || isFlipping}
          aria-label="Página anterior"
        >
          <ChevronLeft aria-hidden="true" strokeWidth={1.35} />
        </button>

        <div
          ref={bookViewportRef}
          className={`book-frame${coverFrameClass}${readerZoomLevel > MIN_ZOOM ? ' is-zoomed' : ''}`}
        >
          <div
            ref={readerOffsetElementRef}
            className={`book-zoom-anchor${readerZoomLevel > MIN_ZOOM ? ' is-zoomed' : ''}`}
          >
            <div
              ref={readerFrameRef}
              className={`book-zoom-layer${readerZoomLevel > MIN_ZOOM ? ' is-zoomed' : ''}`}
              style={{
                '--reader-zoom': readerZoomLevel,
                width: `${bookSize.width * (bookSize.isMobile ? 1 : 2)}px`,
                height: `${bookSize.height}px`,
              }}
            >
              <HTMLFlipBook
            key={`${bookSize.width}x${bookSize.height}`}
            ref={bookRef}
            className="flip-book"
            style={{}}
            width={bookSize.width}
            height={bookSize.height}
            size="fixed"
            minWidth={bookSize.width}
            maxWidth={bookSize.width}
            minHeight={bookSize.height}
            maxHeight={bookSize.height}
            startPage={currentPageRef.current}
            drawShadow
            flippingTime={reducedMotion ? 80 : 920}
            usePortrait={bookSize.isMobile}
            startZIndex={10}
            autoSize={false}
            maxShadowOpacity={0.48}
            showCover
            mobileScrollSupport
            clickEventForward
            useMouseEvents={readerZoomLevel === MIN_ZOOM}
            swipeDistance={28}
            showPageCorners={!reducedMotion}
            disableFlipByClick={readerZoomLevel > MIN_ZOOM}
            renderOnlyPageLengthChange
            onFlip={(event) => {
              updateCurrentPage(event.data)
              if (soundEnabled && !reducedMotion) playPageSound()
            }}
            onChangeOrientation={(event) => setOrientation(event.data)}
            onChangeState={(event) => setIsFlipping(event.data === 'flipping')}
            onInit={(event) => {
              setOrientation(event.data.mode)
              updateCurrentPage(event.data.page)
            }}
              >
                {PAGES.map((page) => <PortfolioPage key={page.number} page={page} />)}
              </HTMLFlipBook>
            </div>
          </div>
        </div>

        <button
          className="page-nav page-nav--next"
          type="button"
          onClick={flipNext}
          disabled={currentPage >= PAGE_COUNT - 1 || isFlipping}
          aria-label="Página siguiente"
        >
          <ChevronRight aria-hidden="true" strokeWidth={1.35} />
        </button>

        <button
          className={`reader-zoom-indicator${readerZoomLevel > MIN_ZOOM ? ' is-active' : ''}`}
          type="button"
          onClick={resetReaderZoom}
          disabled={readerZoomLevel === MIN_ZOOM}
          aria-label={`Zoom ${Math.round(readerZoomLevel * 100)}%. Restablecer al 100%`}
          title={readerZoomLevel > MIN_ZOOM ? 'Arrastra para desplazarte · clic para restablecer' : 'Zoom con la rueda del ratón'}
        >
          <ZoomIn aria-hidden="true" />
          <output aria-live="polite">{Math.round(readerZoomLevel * 100)}%</output>
        </button>
      </section>

      <footer className="reader-footer">
        <div className="page-context" aria-live="polite">
          <span className="project-short">{activeProject.short}</span>
          <span>{pageLabel(currentPage, orientation)}</span>
        </div>
        <button
          className="progress-track"
          type="button"
          onPointerDown={onProgressPointerDown}
          aria-label={`Ir a otra página. Página actual ${currentPage + 1} de ${PAGE_COUNT}`}
        >
          <span className="progress-value" style={{ width: `${(currentPage / (PAGE_COUNT - 1)) * 100}%` }} />
        </button>
        <nav className="mobile-actions" aria-label="Controles móviles">
          <ReaderButton icon={Menu} onClick={() => setIndexOpen(true)}>ÍNDICE</ReaderButton>
          <span className="toolbar-divider" aria-hidden="true" />
          <ReaderButton icon={isFullscreen ? Minimize2 : Maximize2} onClick={toggleFullscreen}>
            {isFullscreen ? 'SALIR' : 'PANTALLA COMPLETA'}
          </ReaderButton>
        </nav>
      </footer>

      <div className={`drawer-backdrop${indexOpen ? ' is-open' : ''}`} onClick={() => setIndexOpen(false)} aria-hidden="true" />
      <aside
        className={`index-drawer${indexOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="index-title"
        aria-hidden={!indexOpen}
        inert={indexOpen ? undefined : ''}
      >
        <header className="drawer-header">
          <div>
            <p id="index-title">ÍNDICE</p>
            <span>34 PÁGINAS · 4 PROYECTOS</span>
          </div>
          <ReaderButton className="drawer-close" icon={X} aria-label="Cerrar índice" onClick={() => setIndexOpen(false)} />
        </header>

        <div className="thumbnail-list">
          {PROJECTS.map((project) => (
            <section className="thumbnail-section" key={project.title}>
              <h2>{project.title}</h2>
              <div className="thumbnail-grid">
                {PAGES.slice(project.start, project.end + 1).map((page) => {
                  const selected = page.index === currentPage || (orientation === 'landscape' && page.index === currentPage + 1)
                  return (
                    <button
                      key={page.number}
                      className={`thumbnail-button${selected ? ' is-selected' : ''}`}
                      type="button"
                      onClick={() => selectFromIndex(page.index)}
                      aria-current={selected ? 'page' : undefined}
                    >
                      <img src={page.thumbnail} alt="" width="320" height="400" loading="lazy" />
                      <span>{String(page.number).padStart(2, '0')}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="drawer-footer">
          <button className="sound-toggle" type="button" onClick={() => setSoundEnabled((value) => !value)}>
            {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            <span>SONIDO DE PÁGINA</span>
            <strong>{soundEnabled ? 'ACTIVO' : 'INACTIVO'}</strong>
          </button>
          <a className="download-link" href={`${BASE_URL}Cesar-Calderon-Portfolio-2026.pdf`} download>
            <Download aria-hidden="true" />
            <span>DESCARGAR PDF</span>
          </a>
        </footer>
      </aside>
    </main>
  )
}

export default App
