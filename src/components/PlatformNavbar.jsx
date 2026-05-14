import { Atom, ChevronRight, FlaskConical, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function PlatformNavbar({ onNavigate, onLaunch }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 18)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const navItems = [
    ['Home', 'home'],
    ['Vlabs', 'labs'],
    ['About', 'about'],
    ['Physics Domains', 'domains'],
    ['Contact', 'contact'],
  ]

  const jump = (target) => {
    setOpen(false)
    onNavigate(target)
  }

  return (
    <header className={`platform-navbar ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="platform-nav-inner">
        <button type="button" className="platform-brand" onClick={() => jump('home')} aria-label="Vlabs home">
          <span><Atom size={18} /></span>
          <strong>Vlabs</strong>
        </button>

        <nav className={`platform-nav-links ${open ? 'open' : ''}`} aria-label="Platform navigation">
          {navItems.map(([label, target]) => (
            <button key={target} type="button" onClick={() => jump(target)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="platform-nav-actions">
          <button type="button" className="platform-launch" onClick={onLaunch}>
            <FlaskConical size={16} /> Launch Lab <ChevronRight size={15} />
          </button>
          <button type="button" className="platform-menu" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation">
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
    </header>
  )
}
