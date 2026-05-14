export const labCategories = [
  {
    id: 'optics',
    label: 'Optics',
    summary: 'Light, waves, polarization, interference, and measurement.',
    status: '1 active lab',
  },
  {
    id: 'mechanics',
    label: 'Mechanics',
    summary: 'Motion, forces, energy, oscillations, and nonlinear systems.',
    status: 'Coming soon',
  },
  {
    id: 'electromagnetism',
    label: 'Electromagnetism',
    summary: 'Fields, circuits, induction, radiation, and charge dynamics.',
    status: 'Coming soon',
  },
  {
    id: 'modern-physics',
    label: 'Modern Physics',
    summary: 'Quantum systems, relativity, atomic physics, and particles.',
    status: 'Coming soon',
  },
]

export const virtualLabs = [
  {
    id: 'polarization-malus-law',
    category: 'optics',
    badge: 'Optics',
    title: 'Polarization & Malus’s Law',
    description:
      'Explore polarization, analyzer projection, Malus’s Law, and quantum measurement through interactive visualization.',
    difficulty: 'University ready',
    route: '/virtual-labs/optics/polarization',
    metrics: ['3D optics bench', 'Classical + quantum modes', 'Live analyzer graphs'],
  },
]

export const platformRouteMap = {
  polarization: '/virtual-labs/optics/polarization',
}
