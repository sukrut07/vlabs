import { useEffect, useRef } from 'react'

const POINTER_RADIUS = 170
const MAX_PULL = 18

export default function InteractiveBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return undefined

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: -9999, y: -9999, active: false }
    let animationFrame = 0
    let dots = []
    let width = 0
    let height = 0
    let deviceScale = 1

    const buildDots = () => {
      deviceScale = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * deviceScale)
      canvas.height = Math.floor(height * deviceScale)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0)

      const spacing = width < 680 ? 46 : 38
      dots = []
      for (let y = -spacing; y < height + spacing; y += spacing) {
        for (let x = -spacing; x < width + spacing; x += spacing) {
          const seed = Math.sin((x + 11) * 12.9898 + (y + 23) * 78.233) * 43758.5453
          const drift = seed - Math.floor(seed)
          dots.push({
            x: x + (drift - 0.5) * spacing * 0.7,
            y: y + (0.5 - drift) * spacing * 0.45,
            size: 0.8 + drift * 1.55,
            phase: drift * Math.PI * 2,
          })
        }
      }
    }

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height)

      for (const dot of dots) {
        const dx = pointer.x - dot.x
        const dy = pointer.y - dot.y
        const distance = Math.hypot(dx, dy)
        const influence = pointer.active ? Math.max(0, 1 - distance / POINTER_RADIUS) : 0
        const wobble = prefersReducedMotion ? 0 : Math.sin(time * 0.0012 + dot.phase) * 2.2
        const pull = influence * MAX_PULL
        const angle = Math.atan2(dy, dx)
        const x = dot.x + Math.cos(angle) * pull + wobble
        const y = dot.y + Math.sin(angle) * pull + wobble * 0.45
        const alpha = 0.16 + influence * 0.5

        context.beginPath()
        context.arc(x, y, dot.size + influence * 1.15, 0, Math.PI * 2)
        context.fillStyle = `rgba(125, 211, 252, ${alpha})`
        context.shadowColor = `rgba(103, 232, 249, ${influence * 0.45})`
        context.shadowBlur = influence * 18
        context.fill()
      }

      context.shadowBlur = 0
      animationFrame = window.requestAnimationFrame(draw)
    }

    const handlePointerMove = (event) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.active = true
    }

    const handlePointerLeave = () => {
      pointer.active = false
    }

    const handleResize = () => {
      buildDots()
    }

    buildDots()
    draw()
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerleave', handlePointerLeave)
    window.addEventListener('resize', handleResize)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return <canvas ref={canvasRef} className="platform-interactive-bg" aria-hidden="true" />
}
