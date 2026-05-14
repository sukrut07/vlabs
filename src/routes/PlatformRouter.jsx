import { useCallback, useEffect } from 'react'
import InteractiveBackground from '../components/InteractiveBackground'
import PlatformNavbar from '../components/PlatformNavbar'
import AboutPlatformSection from '../sections/AboutPlatformSection'
import HeroSection from '../sections/HeroSection'
import LabExplorerSection from '../sections/LabExplorerSection'
import '../styles/platform.css'

export const polarizationLabRoute = '/virtual-labs/optics/polarization'

export default function PlatformHome({ onOpenLab }) {
  useEffect(() => {
    let animationFrame = 0

    const updateParallax = () => {
      const scrollProgress = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1.5)
      document.documentElement.style.setProperty('--platform-scroll', scrollProgress.toFixed(4))
      animationFrame = 0
    }

    const requestUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateParallax)
    }

    updateParallax()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      document.documentElement.style.removeProperty('--platform-scroll')
    }
  }, [])

  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const openLab = useCallback((route = polarizationLabRoute) => {
    onOpenLab(route)
  }, [onOpenLab])

  return (
    <div className="platform-page">
      <InteractiveBackground />
      <PlatformNavbar
        onNavigate={(target) => scrollTo(target)}
        onLaunch={() => openLab(polarizationLabRoute)}
      />
      <main>
        <HeroSection onExplore={() => scrollTo('labs')} onLearn={() => scrollTo('about')} />
        <LabExplorerSection onEnterLab={openLab} />
        <AboutPlatformSection />
        <section id="domains" className="platform-section domain-strip">
          <span>Physics Domains</span>
          <h2>Optics is live. Mechanics, electromagnetism, and modern physics are staged for future labs.</h2>
        </section>
        <section id="contact" className="platform-section contact-band">
          <h2>Ready to run the first experiment?</h2>
          <button type="button" className="hero-primary" onClick={() => openLab(polarizationLabRoute)}>
            Launch Polarization Lab
          </button>
        </section>
      </main>
    </div>
  )
}
