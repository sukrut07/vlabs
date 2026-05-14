import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Edges, Environment, Html, Line, OrbitControls, Sparkles } from '@react-three/drei'
import {
  Atom,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Gauge,
  Home,
  Info,
  KeyRound,
  Layers,
  Lightbulb,
  RotateCcw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Waves,
  Zap,
} from 'lucide-react'
import React, { memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line as ChartLine,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import PlatformHome, { polarizationLabRoute } from './routes/PlatformRouter'

const degToRad = (deg) => (deg * Math.PI) / 180
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const fmt = (value, digits = 3) => Number(value).toFixed(digits)
const probTransmit = (thetaDeg) => Math.cos(degToRad(thetaDeg)) ** 2
const probAbsorb = (thetaDeg) => Math.sin(degToRad(thetaDeg)) ** 2
const zenoProb = (n) => Math.cos((Math.PI / 2) / n) ** (2 * n)
const normalizeAngle = (angle) => ((angle % 180) + 180) % 180
const relativeAngle = (to, from) => {
  const delta = normalizeAngle(to - from)
  return delta > 90 ? delta - 180 : delta
}

const POSITIONS = {
  source: -4.45,
  p1: -1.7,
  p2: 0.75,
  p3: 2.45,
  analyzer: 3.55,
  detector: 4.65,
}

const QuietSceneContext = React.createContext(false)
const WAVE_POINT_COUNT = 96
const FIELD_VECTOR_COUNT = 6
const tempColor = new THREE.Color()
const detectorDark = new THREE.Color('#030712')
const detectorBright = new THREE.Color('#f8fafc')

const DEFAULT_SOURCE = {
  intensity: 100,
  frequency: 5,
  wavelength: 540,
  photonRate: 360,
  amplitude: 1,
  coherence: 85,
  polarizationAngle: 0,
  waveMode: 'continuous',
}

const tooltipText = {
  theta:
    'θ is the angle between the transmission axes of two consecutive polarizers. When θ = 0°, polarizers are aligned and all light passes through. When θ = 90°, they are crossed and no light passes.',
  cosSq:
    'This is the core of Malus’s Law. The square of the cosine gives the fraction of light intensity transmitted. For a single photon, this equals the probability of transmission: the Born Rule.',
  cosSqClassical:
    'This is the deterministic projection factor for a classical electromagnetic wave. Squaring the field projection gives the transmitted intensity fraction.',
  intensity:
    'The ratio of output to input intensity. Equal to the product of cos²θ factors through the polarizer chain. A value of 1 is full transmission; 0 is complete absorption.',
  probTransmit:
    'In quantum mechanics, a single photon cannot be partially transmitted. It either passes or is absorbed. The probability of transmission is cos²θ, and many photons reproduce Malus’s Law.',
  probAbsorb:
    'The probability of absorption is 1 − cos²θ = sin²θ. Since transmission and absorption are mutually exclusive outcomes, their probabilities sum to 1.',
  polarizer:
    'The orientation of the polarizer transmission axis, measured from horizontal. 0° is horizontal, 90° is vertical, and ±45° are diagonal bases.',
  photonRate:
    'In quantum mode, this controls how many individual photons are sent per second. Low rates reveal individual events; high rates recover the classical intensity average.',
  basis:
    'A measurement basis is a pair of mutually exclusive states a polarizer can distinguish. Measuring in one basis destroys information about incompatible bases.',
  analyzer:
    'The analyzer performs the final polarization measurement. Physically it is just a polarizer used as the final measurement device.',
  analyzerTheta:
    'This is the angle between the incoming polarization state and the analyzer axis. It controls the measured intensity by Malus’s Law.',
  oscilloscope:
    'The oscilloscope shows the detector signal as a time-varying trace. Higher analyzer transmission produces a taller, brighter signal.',
}

const chartData = Array.from({ length: 181 }, (_, angle) => ({
  angle,
  field: Math.cos(degToRad(angle)),
  transmit: probTransmit(angle),
  absorb: probAbsorb(angle),
  zeno: angle === 0 ? 0 : null,
}))

const zenoData = Array.from({ length: 50 }, (_, i) => {
  const n = i + 1
  return { n, probability: zenoProb(n) }
})

function hash01(value) {
  return Math.abs(Math.sin(value * 12.9898) * 43758.5453) % 1
}

function basisName(angle) {
  const normalized = ((Math.round(angle) % 180) + 180) % 180
  if (normalized === 0 || normalized === 90) return 'HV Basis (0°/90°)'
  if (normalized === 45 || normalized === 135) return 'Diagonal Basis (45°/-45°)'
  return `Custom Basis (${normalized}°/${(normalized + 90) % 180}°)`
}

function getOpticalChain(polarizers, analyzer) {
  return [
    ...polarizers.map((p, i) => ({ ...p, kind: 'polarizer', label: `P${i + 1}`, x: POSITIONS[`p${i + 1}`] })),
    ...(analyzer.enabled ? [{ angle: analyzer.angle, enabled: true, kind: 'analyzer', label: 'A', x: POSITIONS.analyzer }] : []),
  ].filter((element) => element.enabled)
}

function getCalculations(polarizers, analyzer, source) {
  const enabled = getOpticalChain(polarizers, analyzer)
  const theta = enabled.length > 1 ? relativeAngle(enabled[1].angle, enabled[0].angle) : relativeAngle(enabled[0]?.angle ?? source.polarizationAngle, source.polarizationAngle)
  const cosSq = probTransmit(theta)
  const sourceIntensity = source.intensity / 100
  const stages = []
  const transitions = []
  let intensity = sourceIntensity
  let currentX = POSITIONS.source
  let currentAngle = source.polarizationAngle
  let preAnalyzerIntensity = sourceIntensity

  for (let i = 0; i < enabled.length; i += 1) {
    const delta = relativeAngle(enabled[i].angle, currentAngle)
    const transmission = probTransmit(delta)
    if (enabled[i].kind === 'analyzer') preAnalyzerIntensity = intensity
    transitions.push({
      label: enabled[i].kind === 'analyzer' ? 'ΔθA' : `Δθ${enabled[i].label}`,
      fromAngle: currentAngle,
      toAngle: enabled[i].angle,
      delta,
      transmission,
      x: (currentX + enabled[i].x) / 2,
    })
    stages.push({
      from: currentX,
      to: enabled[i].x,
      intensity,
      angle: currentAngle,
      nextAngle: enabled[i].angle,
      transmission,
      elementX: enabled[i].x,
    })
    intensity *= transmission
    currentX = enabled[i].x
    currentAngle = enabled[i].angle
  }

  stages.push({
    from: currentX,
    to: POSITIONS.detector,
    intensity,
    angle: currentAngle,
  })

  const incomingAngle = enabled.findLast((element) => element.kind !== 'analyzer')?.angle ?? source.polarizationAngle
  const analyzerTheta = analyzer.enabled ? relativeAngle(analyzer.angle, incomingAngle) : 0
  const analyzerTransmission = analyzer.enabled ? probTransmit(analyzerTheta) : 1
  if (!analyzer.enabled) preAnalyzerIntensity = intensity
  const finalIntensity = intensity
  const analyzerAngle = analyzer.enabled ? analyzer.angle : currentAngle

  const basisDelta = relativeAngle(incomingAngle, analyzerAngle)
  const basisH = Math.cos(degToRad(basisDelta))
  const basisV = Math.sin(degToRad(basisDelta))

  return {
    theta,
    cosSq,
    preAnalyzerIntensity,
    analyzerAngle,
    analyzerEnabled: analyzer.enabled,
    analyzerTheta,
    analyzerTransmission,
    incomingAngle,
    intensityRatio: finalIntensity,
    probTransmit: finalIntensity,
    probAbsorb: 1 - finalIntensity,
    stages,
    transitions,
    waveComponents: { h: basisH, v: basisV },
    superpositionStr: `${fmt(basisH)}|A⟩ + ${fmt(basisV)}|A⊥⟩`,
    outputStateStr: `|ψ_out⟩ = |${fmt(analyzerAngle, 1)}°⟩ after transmission`,
  }
}

function FloatingLabel({ children, position }) {
  return (
    <Html position={position} center distanceFactor={7} occlude={false}>
      <div className="scene-label">{children}</div>
    </Html>
  )
}

function LightSource({ source }) {
  const quiet = useContext(QuietSceneContext)
  const group = useRef()
  const core = useRef()
  const cone = useRef()
  const haloMesh = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    const pulseRate = source.waveMode === 'pulse' ? 5.2 : 2.2
    const pulse = 1 + Math.sin(clock.elapsedTime * pulseRate) * (source.waveMode === 'pulse' ? 0.1 : 0.04)
    if (core.current) core.current.scale.setScalar(pulse)
    if (cone.current) cone.current.material.opacity = 0.08 + (source.intensity / 100) * 0.18 + Math.sin(clock.elapsedTime * pulseRate) * 0.025
    group.current.rotation.x += 0.0015
    if (haloMesh.current) {
      haloMesh.current.rotation.y = clock.elapsedTime * 0.08
      haloMesh.current.rotation.z = clock.elapsedTime * 0.035
    }
  })

  const halo = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => {
        const a = i * 2.399
        const r = 0.55 + hash01(i) * 0.28
        return [Math.cos(a) * r, Math.sin(i * 1.7) * 0.36, Math.sin(a) * r]
      }),
    [],
  )

  return (
    <group ref={group} position={[POSITIONS.source, 0, 0]}>
      <pointLight color="#ffffff" intensity={2.5 + source.intensity / 28} distance={8} />
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.46, 0.56, 0.72, 64]} />
        <meshStandardMaterial color="#1f2937" metalness={0.82} roughness={0.22} emissive="#0f172a" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0.38, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.42, 0.035, 16, 72]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.16} emissive="#38bdf8" emissiveIntensity={0.22} />
      </mesh>
      {[0.21, 0.31, 0.41].map((radius, i) => (
        <mesh key={radius} position={[0.41 + i * 0.015, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[radius, 0.008, 10, 64]} />
          <meshBasicMaterial color={i === 0 ? '#f8fafc' : '#7dd3fc'} transparent opacity={0.55} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      <mesh position={[0.43, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.36, 72]} />
        <meshPhysicalMaterial color="#dbeafe" emissive="#bfdbfe" emissiveIntensity={1.6 + source.intensity / 45} transparent opacity={0.7} roughness={0.02} metalness={0} transmission={0.45} />
      </mesh>
      <mesh ref={core} position={[0.45, 0, 0]}>
        <sphereGeometry args={[0.16 + source.intensity / 900, 48, 48]} />
        <meshStandardMaterial color="#ffffff" emissive="#e0f2fe" emissiveIntensity={2.4 + source.intensity / 26} />
      </mesh>
      <mesh ref={cone} position={[0.78, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.48, 1.15, 64, 1, true]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.08, -0.56, 0]}>
        <boxGeometry args={[0.72, 0.08, 0.72]} />
        <meshStandardMaterial color="#111827" metalness={0.75} roughness={0.24} />
      </mesh>
      <instancedMesh ref={haloMesh} args={[undefined, undefined, halo.length]} onUpdate={(mesh) => {
        halo.forEach((p, i) => {
          dummy.position.set(p[0], p[1], p[2])
          dummy.scale.setScalar(1)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
      }}>
        <sphereGeometry args={[0.013, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} />
      </instancedMesh>
      {!quiet && <FloatingLabel position={[0, 0.82, 0]}>Light Source — {Math.round(source.intensity)}% · {fmt(source.polarizationAngle, 1)}°</FloatingLabel>}
    </group>
  )
}

function Polarizer({ x, angle, color, label, enabled = true }) {
  const quiet = useContext(QuietSceneContext)
  const group = useRef()
  const lines = useMemo(() => Array.from({ length: 12 }, (_, i) => (i - 5.5) * 0.17), [])
  useFrame(() => {
    if (group.current) group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, degToRad(angle), 0.1)
  })
  if (!enabled) return null

  return (
    <group ref={group} position={[x, 0, 0]}>
      <group rotation={[0, 0, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.11, 2.75, 2.25]} />
          <meshStandardMaterial color="#0f172a" metalness={0.72} roughness={0.2} emissive={color} emissiveIntensity={0.05} transparent opacity={0.38} />
        </mesh>
      </group>
      <mesh>
        <boxGeometry args={[0.07, 2.35, 1.85]} />
        <meshPhysicalMaterial
          transparent
          opacity={0.31}
          roughness={0.03}
          metalness={0.05}
          color={color}
          emissive={color}
          emissiveIntensity={0.2}
          transmission={0.55}
          thickness={0.35}
          ior={1.45}
        />
        <Edges color={color} linewidth={2} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.22, 0.025, 12, 80]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.88} roughness={0.18} emissive={color} emissiveIntensity={0.12} />
      </mesh>
      {lines.map((y) => (
        <Line key={y} points={[[0.04, y, -0.9], [0.04, y, 0.9]]} color="#e0f2fe" lineWidth={1.25} transparent opacity={0.72} />
      ))}
      <Line points={[[0.075, -1.05, 0], [0.075, 1.05, 0]]} color={color} lineWidth={4} transparent opacity={0.9} />
      <Line points={[[0.085, 0, -0.82], [0.085, 0, 0.82]]} color="#fb7185" lineWidth={1.5} dashed dashSize={0.08} gapSize={0.06} transparent opacity={0.42} />
      <mesh position={[0.06, 1.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.14, 0.012, 12, 42]} />
        <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, -1.55, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.78, 18]} />
        <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, -1.95, 0]}>
        <boxGeometry args={[0.55, 0.08, 0.5]} />
        <meshStandardMaterial color="#111827" metalness={0.78} roughness={0.22} />
      </mesh>
      {!quiet && <FloatingLabel position={[0, 1.62, 0]}>{label} — {fmt(angle, 1)}°</FloatingLabel>}
    </group>
  )
}

function Analyzer({ angle, incomingAngle, transmission }) {
  const quiet = useContext(QuietSceneContext)
  const group = useRef()
  const projection = useRef()
  const lines = useMemo(() => Array.from({ length: 10 }, (_, i) => (i - 4.5) * 0.18), [])
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, degToRad(angle), 0.1)
    if (projection.current) {
      projection.current.scale.y = THREE.MathUtils.lerp(projection.current.scale.y, Math.sqrt(transmission), 0.09)
      projection.current.material.opacity = 0.35 + transmission * 0.45 + Math.sin(clock.elapsedTime * 5) * 0.03
    }
  })
  const axisPoints = [[0.075, -1.08, 0], [0.075, 1.08, 0]]
  const incomingRad = degToRad(incomingAngle - angle)
  return (
    <group ref={group} position={[POSITIONS.analyzer, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.12, 2.58, 2.02]} />
        <meshStandardMaterial color="#1e1b4b" metalness={0.72} roughness={0.18} emissive="#7c3aed" emissiveIntensity={0.12} transparent opacity={0.42} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.075, 2.18, 1.62]} />
        <meshPhysicalMaterial color="#a78bfa" transparent opacity={0.3} roughness={0.02} metalness={0.08} emissive="#7c3aed" emissiveIntensity={0.26} transmission={0.5} thickness={0.4} ior={1.48} />
        <Edges color="#c4b5fd" linewidth={2} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.12, 0.026, 12, 80]} />
        <meshStandardMaterial color="#a78bfa" metalness={0.82} roughness={0.16} emissive="#7c3aed" emissiveIntensity={0.25} />
      </mesh>
      {lines.map((y) => (
        <Line key={y} points={[[0.07, y, -0.82], [0.07, y, 0.82]]} color="#ddd6fe" lineWidth={1.4} transparent opacity={0.8} />
      ))}
      <Line points={axisPoints} color="#f5d0fe" lineWidth={4} transparent opacity={0.96} />
      <group rotation={[-incomingRad, 0, 0]}>
        <Line points={[[0.095, 0, 0], [0.095, 0.85, 0]]} color="#38bdf8" lineWidth={3} transparent opacity={0.72} />
      </group>
      <mesh ref={projection} position={[0.09, 0.42, 0]}>
        <boxGeometry args={[0.025, 0.82, 0.045]} />
        <meshBasicMaterial color="#f0abfc" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0.12, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.62, 64]} />
        <meshBasicMaterial color="#c084fc" transparent opacity={0.08 + transmission * 0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, -1.47, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.72, 18]} />
        <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, -1.85, 0]}>
        <boxGeometry args={[0.58, 0.08, 0.48]} />
        <meshStandardMaterial color="#111827" metalness={0.78} roughness={0.22} />
      </mesh>
      {!quiet && <FloatingLabel position={[0, 1.52, 0]}>Final Analyzer (Measurement Polarizer) — Δθ={fmt(relativeAngle(angle, incomingAngle), 1)}°</FloatingLabel>}
    </group>
  )
}

function intensityColor(intensity) {
  if (intensity > 0.75) return '#ffffff'
  if (intensity > 0.45) return '#facc15'
  if (intensity > 0.15) return '#fb923c'
  return '#ef4444'
}

function ClassicalBeam({ from, to, targetIntensity }) {
  const mesh = useRef()
  const halo = useRef()
  const volume = useRef()
  const current = useRef(targetIntensity)
  const length = Math.abs(to - from)
  useFrame(() => {
    current.current += (targetIntensity - current.current) * 0.08
    if (!mesh.current) return
    const material = mesh.current.material
    material.opacity = clamp(0.08 + current.current * 0.62, 0.02, 0.82)
    material.emissiveIntensity = 0.2 + current.current * 1.8
    const color = intensityColor(current.current)
    material.color.set(color)
    material.emissive.set(color)
    if (halo.current) {
      halo.current.material.opacity = clamp(0.05 + current.current * 0.18, 0.02, 0.26)
      halo.current.material.color.set(color)
    }
    if (volume.current) volume.current.material.opacity = clamp(0.03 + current.current * 0.12, 0.01, 0.18)
  })
  return (
    <group position={[(from + to) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <mesh ref={volume}>
        <cylinderGeometry args={[0.3, 0.24, length, 64]} />
        <meshBasicMaterial transparent opacity={0.12} color="#7dd3fc" blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={halo}>
        <cylinderGeometry args={[0.17, 0.17, length, 64]} />
        <meshBasicMaterial transparent opacity={0.18} color="#e0f2fe" blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={mesh}>
        <cylinderGeometry args={[0.075, 0.075, length, 48]} />
        <meshStandardMaterial transparent opacity={0.7} color="#ffffff" emissive="#ffffff" emissiveIntensity={1.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function AnimatedLine({ color, opacity = 1, update, dashed = false }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WAVE_POINT_COUNT * 3), 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 20)
    return g
  }, [])
  const lineRef = useRef()
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((state, delta) => {
    const liveGeometry = lineRef.current?.geometry
    if (!liveGeometry) return
    update(liveGeometry.attributes.position.array, state, delta)
    liveGeometry.attributes.position.needsUpdate = true
    if (dashed && lineRef.current?.computeLineDistances) lineRef.current.computeLineDistances()
  })
  return (
    <line ref={lineRef} geometry={geometry}>
      {dashed ? (
        <lineDashedMaterial attach="material" color={color} transparent opacity={opacity} dashSize={0.1} gapSize={0.08} depthWrite={false} />
      ) : (
        <lineBasicMaterial attach="material" color={color} transparent opacity={opacity} depthWrite={false} />
      )}
    </line>
  )
}

function WaveLine({ from, to, angle, intensity, source, sourceSegment = false }) {
  const quiet = useContext(QuietSceneContext)
  const phase = useRef(0)
  const amp = useRef(Math.sqrt(intensity))
  const rot = useRef(angle)
  const updateBase = (array, _, delta) => {
    phase.current += delta * source.frequency
    amp.current += (Math.sqrt(intensity) * source.amplitude - amp.current) * 0.1
    rot.current += relativeAngle(angle, rot.current) * 0.1
    writeWavePoints(array, from, to, rot.current, amp.current, phase.current, source)
  }
  const updateB = (array) => {
    writeWavePoints(array, from, to, sourceSegment ? rot.current + 64 : rot.current, amp.current * (sourceSegment ? 0.32 : 0.18), phase.current + Math.PI / 2, source)
  }
  const updateC = (array) => {
    writeWavePoints(array, from, to, sourceSegment ? rot.current - 38 : rot.current, amp.current * (sourceSegment ? 0.26 : 0.11), phase.current + Math.PI * 0.72, source)
  }

  return (
    <>
      <AnimatedLine color={sourceSegment ? '#f97316' : '#38bdf8'} opacity={sourceSegment ? 0.42 : 0.22} update={updateC} />
      <AnimatedLine color={sourceSegment ? '#22c55e' : '#a5f3fc'} opacity={sourceSegment ? 0.32 : 0.18} update={updateB} dashed />
      <AnimatedLine color="#67e8f9" opacity={0.78} update={updateBase} />
      <FieldVectors from={from} to={to} angle={angle} intensity={intensity} source={source} sourceSegment={sourceSegment} />
      {!quiet && (
        <FloatingLabel position={[(from + to) / 2, -1.12, 0.3]}>
          Electric field amplitude: deterministic projection
        </FloatingLabel>
      )}
    </>
  )
}

function FieldVectors({ from, to, angle, intensity, source, sourceSegment = false }) {
  const electricRefs = useRef([])
  const magneticRefs = useRef([])
  const phase = useRef(0)
  const amp = useRef(Math.sqrt(intensity) * source.amplitude)
  const rot = useRef(angle)
  useFrame((_, delta) => {
    phase.current += delta * source.frequency
    amp.current += (Math.sqrt(intensity) * source.amplitude - amp.current) * 0.1
    rot.current += relativeAngle(angle, rot.current) * 0.1
    const rad = degToRad(rot.current)
    for (let i = 0; i < FIELD_VECTOR_COUNT; i += 1) {
      const t = (i + 1) / (FIELD_VECTOR_COUNT + 1)
      const x = from + (to - from) * t
      const size = Math.sin(t * Math.PI * 8 - phase.current) * 0.32 * amp.current
      const drift = sourceSegment ? Math.sin(phase.current * 0.22 + i * 1.7) * degToRad(22) : 0
      const localRad = rad + drift
      updateTwoPointGeometry(electricRefs.current[i], [x, 0, 0], [x, Math.cos(localRad) * size, Math.sin(localRad) * size])
      updateTwoPointGeometry(magneticRefs.current[i], [x, 0, 0], [x, -Math.sin(localRad) * size * 0.45, Math.cos(localRad) * size * 0.45])
      if (electricRefs.current[i]?.material) electricRefs.current[i].material.color.set(size >= 0 ? '#f87171' : '#fb923c')
    }
  })
  return (
    <>
      {Array.from({ length: FIELD_VECTOR_COUNT }, (_, i) => (
        <group key={i}>
          <StaticTwoPointLine lineRef={(node) => { electricRefs.current[i] = node }} color="#f87171" opacity={0.65} />
          <StaticTwoPointLine lineRef={(node) => { magneticRefs.current[i] = node }} color="#a78bfa" opacity={0.42} />
        </group>
      ))}
    </>
  )
}

const StaticTwoPointLine = memo(function StaticTwoPointLine({ color, opacity, lineRef }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial attach="material" color={color} transparent opacity={opacity} depthWrite={false} />
    </line>
  )
})

function updateTwoPointGeometry(line, start, end) {
  if (!line) return
  const array = line.geometry.attributes.position.array
  array[0] = start[0]
  array[1] = start[1]
  array[2] = start[2]
  array[3] = end[0]
  array[4] = end[1]
  array[5] = end[2]
  line.geometry.attributes.position.needsUpdate = true
}

function ProjectionFilterVisual({ stage }) {
  if (stage.nextAngle === undefined || stage.elementX === undefined) return null
  const incoming = degToRad(stage.angle)
  const outgoing = degToRad(stage.nextAngle)
  const rejected = outgoing + Math.PI / 2
  const incomingAmp = Math.sqrt(stage.intensity)
  const survive = Math.sqrt(stage.transmission)
  const reject = Math.sqrt(1 - stage.transmission)
  return (
    <group position={[stage.elementX - 0.09, 0, 0.92]}>
      <Line points={[[0, 0, 0], [0, Math.cos(incoming) * 0.46 * incomingAmp, Math.sin(incoming) * 0.46 * incomingAmp]]} color="#67e8f9" lineWidth={2.2} transparent opacity={0.72} />
      <Line points={[[0, 0, 0], [0, Math.cos(outgoing) * 0.5 * incomingAmp * survive, Math.sin(outgoing) * 0.5 * incomingAmp * survive]]} color="#22c55e" lineWidth={3} transparent opacity={0.85} />
      <Line points={[[0, 0, 0], [0, Math.cos(rejected) * 0.42 * incomingAmp * reject, Math.sin(rejected) * 0.42 * incomingAmp * reject]]} color="#fb7185" lineWidth={1.8} dashed dashSize={0.055} gapSize={0.045} transparent opacity={0.48} />
    </group>
  )
}

function writeWavePoints(array, from, to, angle, amplitude, phase, source = DEFAULT_SOURCE) {
  const rad = degToRad(angle)
  for (let i = 0; i < WAVE_POINT_COUNT; i += 1) {
    const t = i / (WAVE_POINT_COUNT - 1)
    const x = from + (to - from) * t
    const wavelengthScale = clamp(620 / source.wavelength, 0.7, 1.7)
    const coherenceNoise = (1 - source.coherence / 100) * Math.sin(t * Math.PI * 37 + phase * 0.35) * 0.12
    const pulseEnvelope = source.waveMode === 'pulse' ? 0.35 + 0.65 * Math.max(0, Math.sin(t * Math.PI * 2 - phase * 0.35)) : 1
    const absoluteDistance = Math.abs(x - POSITIONS.source)
    const wave = 0.36 * amplitude * pulseEnvelope * Math.sin(absoluteDistance * Math.PI * 2.6 * wavelengthScale - phase + coherenceNoise)
    const offset = i * 3
    array[offset] = x
    array[offset + 1] = Math.cos(rad) * wave
    array[offset + 2] = Math.sin(rad) * wave
  }
}

function Detector({ intensity, mode, photonRate }) {
  const quiet = useContext(QuietSceneContext)
  const mesh = useRef()
  const glow = useRef(intensity)
  const impacts = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ x: (hash01(i) - 0.5) * 1.45, y: (hash01(i + 99) - 0.5) * 1.45, s: hash01(i + 4) })), [])
  useFrame(({ clock }) => {
    glow.current += (intensity - glow.current) * 0.08
    if (!mesh.current) return
    tempColor.lerpColors(detectorDark, detectorBright, glow.current)
    mesh.current.material.color.copy(tempColor)
    if (mesh.current.material.emissive) {
      mesh.current.material.emissive.copy(tempColor)
      mesh.current.material.emissiveIntensity = 0.15 + glow.current * 1.2 + Math.sin(clock.elapsedTime * 8) * 0.02
    }
  })
  return (
    <group position={[POSITIONS.detector, 0, 0]}>
      <mesh ref={mesh} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.86, 96]} />
        <meshBasicMaterial color="#111827" side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-0.02, 0, 0]}>
        <torusGeometry args={[0.94, 0.025, 12, 72]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.2} emissive="#38bdf8" emissiveIntensity={0.15} />
      </mesh>
      {[0.32, 0.58, 0.82].map((r) => (
        <mesh key={r} rotation={[0, Math.PI / 2, 0]} position={[-0.03, 0, 0]}>
          <torusGeometry args={[r, 0.004, 8, 64]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.16} />
        </mesh>
      ))}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-0.012, 0, 0]}>
        <circleGeometry args={[0.18 + intensity * 0.65, 48]} />
        <meshBasicMaterial color="#e0f2fe" transparent opacity={0.05 + intensity * 0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {mode === 'quantum' &&
        impacts.map((dot, i) => (
          <mesh key={i} position={[-0.02, dot.x, dot.y]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.018 + dot.s * 0.02, 12]} />
            <meshBasicMaterial color="#fef3c7" transparent opacity={clamp(intensity * (0.25 + dot.s), 0.05, 0.8)} />
          </mesh>
        ))}
      <mesh position={[0, -1.4, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.78, 18]} />
        <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, -1.83, 0]}>
        <boxGeometry args={[0.72, 0.08, 0.62]} />
        <meshStandardMaterial color="#111827" metalness={0.78} roughness={0.22} />
      </mesh>
      {!quiet && (
        <FloatingLabel position={[0, 1.38, 0]}>
          {mode === 'quantum'
            ? `Transmission Probability — ${Math.round(intensity * 100)}% · ${Math.round(intensity * photonRate)}/s`
            : `Continuous Intensity — ${Math.round(intensity * 100)}%`}
        </FloatingLabel>
      )}
    </group>
  )
}

function RelativeAngleLabels({ transitions }) {
  const quiet = useContext(QuietSceneContext)
  if (quiet) return null
  return (
    <>
      {transitions.map((transition) => (
        <group key={`${transition.label}-${transition.x}`} position={[transition.x, 1.18, 0]}>
          <Line
            points={makeArcPoints(0.28, transition.fromAngle, transition.toAngle)}
            color="#facc15"
            lineWidth={2}
            transparent
            opacity={0.85}
          />
          <FloatingLabel position={[0, 0.22, 0]}>
            {transition.label}: {fmt(transition.delta, 1)}° · cos²={fmt(transition.transmission)}
          </FloatingLabel>
        </group>
      ))}
    </>
  )
}

function makeArcPoints(radius, fromAngle, toAngle) {
  const delta = relativeAngle(toAngle, fromAngle)
  const points = []
  for (let i = 0; i <= 24; i += 1) {
    const a = degToRad(fromAngle + (delta * i) / 24)
    points.push([0, Math.cos(a) * radius, Math.sin(a) * radius])
  }
  return points
}

function QuantumCollapseOverlay({ calculations }) {
  const quiet = useContext(QuietSceneContext)
  const incoming = degToRad(calculations.incomingAngle)
  const analyzer = degToRad(calculations.analyzerAngle)
  const amp = Math.sqrt(calculations.analyzerTransmission)
  const orth = Math.sqrt(1 - calculations.analyzerTransmission)
  return (
    <group position={[POSITIONS.analyzer - 0.35, -0.62, 0.75]}>
      <Line points={[[0, 0, 0], [0, Math.cos(incoming) * 0.55, Math.sin(incoming) * 0.55]]} color="#38bdf8" lineWidth={3} transparent opacity={0.85} />
      <Line points={[[0, 0, 0], [0, Math.cos(analyzer) * 0.55 * amp, Math.sin(analyzer) * 0.55 * amp]]} color="#22c55e" lineWidth={4} transparent opacity={0.9} />
      <Line points={[[0, 0, 0], [0, -Math.sin(analyzer) * 0.48 * orth, Math.cos(analyzer) * 0.48 * orth]]} color="#fb7185" lineWidth={2} dashed dashSize={0.06} gapSize={0.05} transparent opacity={0.5} />
      {!quiet && <FloatingLabel position={[0.05, -0.28, 0]}>Collapse: transmit → |{fmt(calculations.analyzerAngle, 1)}°⟩, absorb → terminated</FloatingLabel>}
    </group>
  )
}

function PhotonStream({ polarizers, analyzer, source }) {
  const quiet = useContext(QuietSceneContext)
  const coreMesh = useRef()
  const trailMesh = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const photons = useMemo(() => {
    const count = source.intensity <= 0 ? 0 : Math.round(clamp((source.photonRate * source.intensity) / 300, 12, 260))
    const enabled = getOpticalChain(polarizers, analyzer)
    return Array.from({ length: count }, (_, i) => {
      let stopX = POSITIONS.detector
      let tint = '#dbeafe'
      let currentAngle = source.polarizationAngle
      for (let j = 0; j < enabled.length; j += 1) {
        const chance = probTransmit(relativeAngle(enabled[j].angle, currentAngle))
        if (hash01(i * 31 + j * 11) > chance) {
          stopX = enabled[j].x
          tint = enabled[j].kind === 'analyzer' ? '#c084fc' : '#fb7185'
          break
        }
        tint = enabled[j].kind === 'analyzer' ? '#f5d0fe' : j === 0 ? '#fbbf24' : '#86efac'
        currentAngle = enabled[j].angle
      }
      return {
        laneY: (hash01(i + 10) - 0.5) * 0.18,
        laneZ: (hash01(i + 20) - 0.5) * 0.18,
        phase: hash01(i + 30),
        stopX,
        color: new THREE.Color(tint),
      }
    })
  }, [source, polarizers, analyzer])

  useEffect(() => {
    if (!coreMesh.current || !trailMesh.current) return
    photons.forEach((photon, i) => {
      coreMesh.current.setColorAt(i, photon.color)
      trailMesh.current.setColorAt(i, photon.color)
    })
    if (coreMesh.current.instanceColor) coreMesh.current.instanceColor.needsUpdate = true
    if (trailMesh.current.instanceColor) trailMesh.current.instanceColor.needsUpdate = true
  }, [photons])

  useFrame(({ clock }) => {
    if (!coreMesh.current || !trailMesh.current) return
    const speed = 0.75 + source.photonRate / 850
    photons.forEach((photon, i) => {
      const t = (clock.elapsedTime * speed + photon.phase) % 1
      const x = POSITIONS.source + (POSITIONS.detector - POSITIONS.source) * t
      const visible = x <= photon.stopX + 0.03
      const pulse = 0.9 + 0.1 * Math.sin(clock.elapsedTime * 11 + i * 1.73)
      const flicker = 0.92 + 0.08 * hash01(i * 17 + Math.floor(clock.elapsedTime * 5))
      const fade = visible ? pulse * flicker : 0

      dummy.position.set(visible ? x : photon.stopX, photon.laneY, photon.laneZ)
      dummy.scale.set(0.075 * fade, 0.038 * fade, 0.038 * fade)
      dummy.updateMatrix()
      coreMesh.current.setMatrixAt(i, dummy.matrix)

      dummy.position.set(visible ? x - 0.075 : photon.stopX, photon.laneY, photon.laneZ)
      dummy.scale.set(0.145 * fade, 0.018 * fade, 0.018 * fade)
      dummy.updateMatrix()
      trailMesh.current.setMatrixAt(i, dummy.matrix)
    })
    coreMesh.current.instanceMatrix.needsUpdate = true
    trailMesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={trailMesh} args={[undefined, undefined, photons.length]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.26} blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={coreMesh} args={[undefined, undefined, photons.length]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
      {!quiet && <FloatingLabel position={[0.15, 0.72, 0.52]}>Individual Photons: probabilistic transmission events</FloatingLabel>}
    </>
  )
}

function ZenoPlanes({ active, n }) {
  if (!active) return null
  const count = Math.min(n, 26)
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1)
    const x = -3.1 + t * 6.2
    return (
      <mesh key={i} position={[x, -0.05, -1.1]} rotation={[0, 0, degToRad(t * 90)]}>
        <boxGeometry args={[0.025, 0.7, 0.55]} />
        <meshPhysicalMaterial color="#a78bfa" transparent opacity={0.22} emissive="#a78bfa" emissiveIntensity={0.1} />
      </mesh>
    )
  })
}

function LabScene({ labState, calculations, setLabState, resetLab }) {
  const cameraControls = useRef()
  const activePolarizers = labState.polarizers.filter((p) => p.enabled)
  const finalAngle = activePolarizers.at(-1)?.angle ?? 0
  const isQuantum = labState.mode === 'quantum'

  return (
    <div className="scene-shell">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 2, 8], fov: 45 }} gl={{ antialias: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.15
      }}>
        <color attach="background" args={['#07111f']} />
        <fog attach="fog" args={['#07111f', 8, 16]} />
        <ambientLight intensity={0.32} />
        <Environment preset="night" />
        <directionalLight position={[2.5, 5, 4]} intensity={1.7} color="#dbeafe" />
        <pointLight position={[0, 2.6, 2.6]} intensity={8} color="#7dd3fc" />
        <pointLight position={[3.8, 1.8, -2.4]} intensity={4} color="#c084fc" />
        <Sparkles count={42} scale={[10, 3.5, 3.5]} size={1} speed={0.12} color="#7dd3fc" opacity={0.24} />
        <mesh position={[0, -1.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[11, 5]} />
          <meshStandardMaterial color="#07111f" metalness={0.38} roughness={0.34} emissive="#0f172a" emissiveIntensity={0.18} />
        </mesh>
        <gridHelper args={[20, 20, '#1e3a5f', '#0f172a']} position={[0, -1.25, 0]} />
        <ContactShadows position={[0, -1.235, 0]} opacity={0.34} scale={9} blur={2.2} far={4} frames={1} resolution={256} />
        <axesHelper args={[0.8]} position={[-4.55, -0.86, 1.2]} />
        <LightSource source={labState.source} />
        <Polarizer x={POSITIONS.p1} angle={labState.polarizers[0].angle} color="#38bdf8" label="Polarizer 1" enabled={labState.polarizers[0].enabled} />
        <Polarizer x={POSITIONS.p2} angle={labState.polarizers[1].angle} color="#f59e0b" label="Polarizer 2" enabled={labState.polarizers[1].enabled} />
        <Polarizer x={POSITIONS.p3} angle={labState.polarizers[2].angle} color="#22c55e" label="Polarizer 3" enabled={labState.polarizers[2].enabled} />
        {labState.analyzer.enabled && <Analyzer angle={labState.analyzer.angle} incomingAngle={calculations.incomingAngle} transmission={calculations.analyzerTransmission} />}
        <Detector intensity={calculations.intensityRatio} mode={labState.mode} photonRate={labState.source.photonRate} />
        {!isQuantum && calculations.stages.map((stage) => <ClassicalBeam key={`${stage.from}-${stage.to}`} from={stage.from} to={stage.to} targetIntensity={stage.intensity} />)}
        {isQuantum && <PhotonStream polarizers={labState.polarizers} analyzer={labState.analyzer} source={labState.source} />}
        {!isQuantum && calculations.stages.map((stage) => (
          <WaveLine key={`wave-${stage.from}-${stage.to}`} from={stage.from} to={stage.to} angle={stage.angle} intensity={stage.intensity} source={labState.source} sourceSegment={stage.from === POSITIONS.source} />
        ))}
        {!isQuantum && calculations.stages.map((stage) => (
          <ProjectionFilterVisual key={`projection-${stage.elementX ?? stage.to}`} stage={stage} />
        ))}
        <RelativeAngleLabels transitions={calculations.transitions} />
        {isQuantum && calculations.analyzerEnabled && <QuantumCollapseOverlay calculations={calculations} />}
        <ZenoPlanes active={labState.activeDemo === 'zenoEffect'} n={labState.zenoN} />
        <OrbitControls ref={cameraControls} enableDamping dampingFactor={0.05} minDistance={4} maxDistance={12} target={[0, 0, 0]} />
      </Canvas>
      <div className="absolute left-3 top-3 flex gap-2">
        <button
          type="button"
          className="icon-button"
          aria-label="Reset camera and lab"
          onClick={() => {
            cameraControls.current?.reset()
            resetLab()
          }}
        >
          <RotateCcw size={17} />
        </button>
        <button type="button" className="secondary-button" onClick={() => setLabState((s) => ({ ...s, mode: isQuantum ? 'classical' : 'quantum' }))}>
          {isQuantum ? <Waves size={15} /> : <Atom size={15} />} {isQuantum ? 'Classical View' : 'Quantum View'}
        </button>
      </div>
      <div className="absolute bottom-3 left-3 rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 backdrop-blur">
        {isQuantum
          ? `Quantum mode: photons are measured in the active basis; expected count ${Math.round(calculations.intensityRatio * labState.source.photonRate)}/s.`
          : `Classical mode: continuous field projection; incoming wave angle ${fmt(finalAngle, 1)}°.`}
      </div>
    </div>
  )
}

function InfoTip({ id }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, bottom: 'auto', left: 0, width: 320, placement: 'top' })
  const buttonRef = useRef(null)
  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) {
      setOpen(true)
      return
    }
    const width = Math.min(320, window.innerWidth - 24)
    const left = clamp(rect.left + rect.width / 2 - width / 2, 12, window.innerWidth - width - 12)
    const placeBelow = rect.top < 180
    const top = placeBelow ? rect.bottom + 10 : 'auto'
    const bottom = placeBelow ? 'auto' : window.innerHeight - rect.top + 10
    setPosition({ top, bottom, left, width, placement: placeBelow ? 'bottom' : 'top' })
    setOpen(true)
  }
  return (
    <span className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        className="info-tip"
        aria-label={`Explain ${id}`}
        onClick={() => {
          if (open) setOpen(false)
          else show()
        }}
        onFocus={show}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
      >
        <Info size={13} />
      </button>
      {open && createPortal(
        <span
          className={`tooltip-card floating ${position.placement}`}
          style={{
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            width: position.width,
          }}
        >
          {tooltipText[id]}
        </span>,
        document.body,
      )}
    </span>
  )
}

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="panel">
      <button type="button" onClick={() => setOpen(!open)} className="section-trigger" aria-expanded={open}>
        <span><Icon size={16} /> {title}</span>
        <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
      </button>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}

function Slider({ label, value, onChange, min = 0, max = 180, step = 1, unit = '°', tip = 'polarizer' }) {
  const digits = step < 1 || unit === '°' ? 1 : 0
  const [draft, setDraft] = useState(value)
  const frameRef = useRef(null)
  const pendingRef = useRef(value)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDraft(value))
    pendingRef.current = value
    return () => cancelAnimationFrame(frame)
  }, [value])
  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
  }, [])
  const commitValue = (next) => {
    if (Number.isNaN(next)) return
    const clamped = clamp(next, min, max)
    setDraft(clamped)
    pendingRef.current = clamped
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      onChange(pendingRef.current)
    })
  }
  return (
    <label className="slider-field">
      <span className="slider-label">
        <span>{label} <InfoTip id={tip} /></span>
        <span className="slider-value-edit">
          <input
            aria-label={`${label} exact value`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number(draft).toFixed(digits)}
            onChange={(event) => commitValue(Number(event.target.value))}
          />
          <strong>{unit}</strong>
        </span>
      </span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={draft} onChange={(event) => commitValue(Number(event.target.value))} />
    </label>
  )
}

function FormulaPanel({ mode, calculations, photonRate }) {
  return (
    <div className="formula-grid">
      {mode === 'classical' ? (
        <>
          <CalcRow label="Malus's Law" value="I_out = I_in · cos²θ" mono tip="cosSqClassical" />
          <CalcRow label="Field projection Δθ" value={`${fmt(calculations.analyzerTheta, 1)}°`} tip="analyzerTheta" />
          <CalcRow label="Projection factor cos²Δθ" value={fmt(calculations.analyzerTransmission)} tip="cosSqClassical" />
          <CalcRow label="Intensity after analyzer" value={fmt(calculations.intensityRatio)} tone="green" tip="intensity" />
          <CalcRow label="Wave amplitude" value={fmt(Math.sqrt(calculations.intensityRatio))} tone="green" />
        </>
      ) : (
        <>
          <CalcRow label="Born Rule" value="P = |⟨ψ|φ⟩|² = cos²θ" mono tip="cosSq" />
          <CalcRow label="Measurement basis" value={basisName(calculations.analyzerAngle)} mono tip="basis" />
          <CalcRow label="Transmission Probability" value={`${Math.round(calculations.probTransmit * 100)}%`} tone="green" tip="probTransmit" />
          <CalcRow label="Absorption Probability" value={`${Math.round(calculations.probAbsorb * 100)}%`} tone="red" tip="probAbsorb" />
          <CalcRow label="Expected Detection Rate" value={`${Math.round(calculations.probTransmit * photonRate)} photons/s`} tone="green" />
          <CalcRow label="Before measurement" value={`|ψ⟩ = ${calculations.superpositionStr}`} mono tip="basis" />
          <CalcRow label="After transmission" value={calculations.analyzerEnabled ? calculations.outputStateStr : 'No final analyzer: state continues'} mono tip="analyzer" />
        </>
      )}
    </div>
  )
}

function CalcRow({ label, value, tone, mono, tip }) {
  return (
    <div className="calc-row">
      <dt>{label} {tip && <InfoTip id={tip} />}</dt>
      <dd className={`${tone === 'green' ? 'green' : tone === 'red' ? 'red' : ''} ${mono ? 'formula-text' : ''}`}>{value}</dd>
    </div>
  )
}

function getExtremaTargets(labState, type) {
  const base = normalizeAngle(labState.source.polarizationAngle)
  const enabledOptics = [
    ...labState.polarizers.map((p, index) => ({ ...p, index, kind: 'polarizer' })),
    { ...labState.analyzer, index: 'analyzer', kind: 'analyzer' },
  ].filter((item) => item.enabled)
  if (!enabledOptics.length) return null

  const targetPolarizers = labState.polarizers.map((p) => ({ ...p }))
  const targetAnalyzer = { ...labState.analyzer }
  if (type === 'max') {
    targetPolarizers.forEach((p) => {
      if (p.enabled) p.angle = base
    })
    if (targetAnalyzer.enabled) targetAnalyzer.angle = base
  } else {
    targetPolarizers.forEach((p) => {
      if (p.enabled) p.angle = base
    })
    const lastEnabledPolarizer = [...targetPolarizers].map((p, index) => ({ ...p, index })).filter((p) => p.enabled).at(-1)
    if (targetAnalyzer.enabled) targetAnalyzer.angle = normalizeAngle(base + 90)
    else if (lastEnabledPolarizer) targetPolarizers[lastEnabledPolarizer.index].angle = normalizeAngle(base + 90)
  }

  return { polarizers: targetPolarizers, analyzer: targetAnalyzer }
}

function runExtremaOptimization(labState, setLabState, type, source = 'optimizer') {
  const targets = getExtremaTargets(labState, type)
  if (!targets) return
  animateOptics(setLabState, targets)
  const notebookText =
    labState.mode === 'quantum'
      ? type === 'max'
        ? 'Quantum bases aligned -> transmission probability and expected photon count are maximized.'
        : 'Orthogonal measurement basis selected -> photon transmission probability is minimized.'
      : type === 'max'
        ? 'Projection loss minimized because the analyzer is aligned with the polarization axis.'
        : 'Analyzer crossed with the incoming field -> extinction is demonstrated.'
  setLabState((state) => ({
    ...state,
    optimizationNote: {
      mode: state.mode,
      type,
      text: getOptimizationText(state.mode, type, targets.polarizers, targets.analyzer, state.source.photonRate),
    },
    ...(source === 'notebook'
      ? {
          notebookNote: {
            text: notebookText,
            tone: type,
            at: Date.now(),
          },
        }
      : {}),
  }))
}

function ExtremaPanel({ labState, setLabState, calculations }) {
  const isQuantum = labState.mode === 'quantum'
  const maxLabel = isQuantum ? 'Max Probability' : 'Max Intensity'
  const minLabel = isQuantum ? 'Min Probability' : 'Min Intensity'
  const applyOptimization = (type) => runExtremaOptimization(labState, setLabState, type)

  return (
    <Section title={isQuantum ? 'Probability Optimizer' : 'Intensity Optimizer'} icon={Zap} defaultOpen={false}>
      <div className="optimizer-buttons">
        <button type="button" className="secondary-button" onClick={() => applyOptimization('max')}>{maxLabel}</button>
        <button type="button" className="secondary-button" onClick={() => applyOptimization('min')}>{minLabel}</button>
      </div>
      {labState.optimizationNote && (
        <div className={`optimizer-note ${labState.optimizationNote.type}`}>
          <strong>{labState.optimizationNote.type === 'max' ? 'Aligned bases' : 'Crossed bases'}</strong>
          <p>{labState.optimizationNote.text}</p>
          <span>
            {isQuantum
              ? `P(transmit) = ${Math.round(calculations.probTransmit * 100)}%, expected ${Math.round(calculations.probTransmit * labState.source.photonRate)} photons/s`
              : `Iout/Iin = ${fmt(calculations.intensityRatio)}, transmission ${Math.round(calculations.intensityRatio * 100)}%`}
          </span>
        </div>
      )}
    </Section>
  )
}

function animateOptics(setLabState, target, duration = 850) {
  const startTime = performance.now()
  let startState
  const step = (now) => {
    const t = clamp((now - startTime) / duration, 0, 1)
    const eased = 1 - (1 - t) ** 3
    setLabState((state) => {
      if (!startState) startState = state
      return {
        ...state,
        polarizers: state.polarizers.map((p, i) => ({
          ...p,
          enabled: target.polarizers[i]?.enabled ?? p.enabled,
          angle: interpolateAngle(startState.polarizers[i].angle, target.polarizers[i].angle, eased),
        })),
        analyzer: {
          ...state.analyzer,
          enabled: target.analyzer.enabled,
          angle: interpolateAngle(startState.analyzer.angle, target.analyzer.angle, eased),
        },
      }
    })
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function interpolateAngle(from, to, t) {
  const delta = relativeAngle(to, from)
  return normalizeAngle(from + delta * t)
}

function getOptimizationText(mode, type, polarizers, analyzer, photonRate) {
  const enabledAngles = [
    ...polarizers.filter((p) => p.enabled).map((p, i) => `P${i + 1}=${fmt(p.angle, 1)}°`),
    ...(analyzer.enabled ? [`A=${fmt(analyzer.angle, 1)}°`] : []),
  ].join(', ')
  if (mode === 'quantum') {
    return type === 'max'
      ? `Maximum transmission occurs because the measurement bases are aligned (${enabledAngles}). The state has full overlap with each next basis, maximizing expected photon count up to ${photonRate}/s.`
      : `Minimum transmission occurs because the final active basis is orthogonal to the incoming state (${enabledAngles}). The probability amplitude overlap goes to zero, so photons are absorbed.`
  }
  return type === 'max'
    ? `Maximum intensity occurs because all active axes are aligned (${enabledAngles}), so each projection has cos²(0°)=1 and projection loss is minimized.`
    : `Minimum intensity occurs because the final active optic is crossed with the incoming field (${enabledAngles}), so the orthogonal field component is removed.`
}

function ControlPanel({ labState, setLabState, calculations, runThreeDemo, runQkdDemo }) {
  const setPolarizer = (index, patch) =>
    setLabState((state) => ({
      ...state,
      polarizers: state.polarizers.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }))
  const setSource = (patch) => setLabState((state) => ({ ...state, source: { ...state.source, ...patch } }))

  return (
    <aside className="control-rail">
      <Section title="Polarizer Controls" icon={SlidersHorizontal}>
        <label className="toggle-row">
          <span>Enable Polarizer 1 <InfoTip id="polarizer" /></span>
          <input aria-label="Enable Polarizer 1" type="checkbox" checked={labState.polarizers[0].enabled} onChange={(event) => setPolarizer(0, { enabled: event.target.checked })} />
        </label>
        <Slider label="Polarizer 1 angle" value={labState.polarizers[0].angle} onChange={(angle) => setPolarizer(0, { angle })} />
        <label className="toggle-row">
          <span>Enable Polarizer 2 <InfoTip id="polarizer" /></span>
          <input aria-label="Enable Polarizer 2" type="checkbox" checked={labState.polarizers[1].enabled} onChange={(event) => setPolarizer(1, { enabled: event.target.checked })} />
        </label>
        <Slider label="Polarizer 2 angle" value={labState.polarizers[1].angle} onChange={(angle) => setPolarizer(1, { angle })} />
        <label className="toggle-row">
          <span>Enable Polarizer 3 <InfoTip id="polarizer" /></span>
          <input aria-label="Enable Polarizer 3" type="checkbox" checked={labState.polarizers[2].enabled} onChange={(event) => setPolarizer(2, { enabled: event.target.checked })} />
        </label>
        {labState.polarizers[2].enabled && <Slider label="Polarizer 3 angle" value={labState.polarizers[2].angle} onChange={(angle) => setPolarizer(2, { angle })} />}
        <button type="button" className="secondary-button w-full" onClick={runThreeDemo}>
          <Zap size={15} /> Three-Polarizer Demo
        </button>
      </Section>

      <Section title="Light Source Controls" icon={Lightbulb}>
        <Slider label="Source intensity" value={labState.source.intensity} min={0} max={100} unit="%" tip="intensity" onChange={(intensity) => setSource({ intensity })} />
        <Slider label="Wave amplitude" value={labState.source.amplitude} min={0.1} max={2} step={0.1} unit="×" tip="intensity" onChange={(amplitude) => setSource({ amplitude })} />
        <Slider label="Wave frequency" value={labState.source.frequency} min={1} max={14} step={0.5} unit="Hz" tip="oscilloscope" onChange={(frequency) => setSource({ frequency })} />
        <Slider label="Wavelength" value={labState.source.wavelength} min={380} max={700} unit="nm" tip="oscilloscope" onChange={(wavelength) => setSource({ wavelength })} />
        <Slider label="Photon emission rate" value={labState.source.photonRate} min={10} max={1000} unit="/s" tip="photonRate" onChange={(photonRate) => setSource({ photonRate })} />
        <Slider label="Beam coherence" value={labState.source.coherence} min={0} max={100} unit="%" tip="oscilloscope" onChange={(coherence) => setSource({ coherence })} />
        <Slider label="Source polarization angle" value={labState.source.polarizationAngle} min={0} max={180} unit="°" tip="polarizer" onChange={(polarizationAngle) => setSource({ polarizationAngle })} />
        <div className="segmented">
          {['continuous', 'pulse'].map((waveMode) => (
            <button key={waveMode} type="button" className={labState.source.waveMode === waveMode ? 'active' : ''} onClick={() => setSource({ waveMode })}>
              {waveMode === 'continuous' ? <Waves size={16} /> : <Zap size={16} />} {waveMode}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Live Calculations" icon={Gauge}>
        <FormulaPanel mode={labState.mode} calculations={calculations} photonRate={labState.source.photonRate} />
      </Section>

      <ExtremaPanel labState={labState} setLabState={setLabState} calculations={calculations} />

      <AnalyzerPanel labState={labState} setLabState={setLabState} calculations={calculations} />

      <Section title="Mode Toggle" icon={Atom}>
        <div className="segmented">
          {[
            ['classical', Waves, 'Classical'],
            ['quantum', Atom, 'Quantum'],
          ].map(([key, Icon, label]) => (
            <button key={key} type="button" onClick={() => setLabState((s) => ({ ...s, mode: key }))} className={labState.mode === key ? 'active' : ''}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
        <button type="button" className="secondary-button w-full" onClick={runQkdDemo}>
          <KeyRound size={15} /> QKD Demo
        </button>
      </Section>

      <Section title="Measurement Basis" icon={Layers}>
        <div className="basis-box">{basisName(labState.polarizers[1].angle)} <InfoTip id="basis" /></div>
      </Section>

      <VectorPanel
        mode={labState.mode}
        stateAngle={calculations.incomingAngle}
        basisAngle={calculations.analyzerAngle}
        calculations={calculations}
      />
    </aside>
  )
}

function AnalyzerPanel({ labState, setLabState, calculations }) {
  return (
    <Section title="Final Analyzer (Measurement Polarizer)" icon={Gauge}>
      <label className="toggle-row">
        <span>Enable Final Analyzer <InfoTip id="analyzer" /></span>
        <input
          aria-label="Enable Final Analyzer"
          type="checkbox"
          checked={labState.analyzer.enabled}
          onChange={(event) => setLabState((s) => ({ ...s, analyzer: { ...s.analyzer, enabled: event.target.checked } }))}
        />
      </label>
      <Slider
        label="Final analyzer angle"
        value={labState.analyzer.angle}
        onChange={(angle) => setLabState((s) => ({ ...s, analyzer: { ...s.analyzer, angle } }))}
        tip="analyzer"
      />
      <div className="analyzer-meter" style={{ '--meter': calculations.analyzerTransmission }}>
        <div>
          <span>{labState.mode === 'quantum' ? 'Measurement Δθ' : 'Field projection Δθ'} <InfoTip id="analyzerTheta" /></span>
          <strong>{fmt(calculations.analyzerTheta, 1)}°</strong>
        </div>
        <div>
          <span>cos²θ</span>
          <strong>{fmt(calculations.analyzerTransmission)}</strong>
        </div>
        <div>
          <span>{labState.mode === 'quantum' ? 'Expected photon count' : 'Measured intensity'}</span>
          <strong>{labState.mode === 'quantum' ? `${Math.round(calculations.intensityRatio * labState.source.photonRate)}/s` : `${Math.round(calculations.intensityRatio * 100)}%`}</strong>
        </div>
        <div className="meter-track"><span /></div>
      </div>
      <Oscilloscope calculations={calculations} source={labState.source} mode={labState.mode} />
      <PolarPlot angle={labState.analyzer.angle} transmission={calculations.analyzerTransmission} />
    </Section>
  )
}

function Oscilloscope({ calculations, source, mode }) {
  const [phase, setPhase] = useState(0)
  const [paused, setPaused] = useState(false)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    if (paused) return undefined
    let raf = 0
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      setPhase((p) => (p + dt * source.frequency) % (Math.PI * 2))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, source.frequency])
  const points = Array.from({ length: 96 }, (_, i) => {
    const x = (i / 95) * 100
    const spike = mode === 'quantum' && hash01(i + Math.floor(phase * 20)) < calculations.intensityRatio ? -28 * hash01(i + 17) : 0
    const carrier = mode === 'quantum' ? spike : Math.sin(i * 0.42 * zoom + phase) * 14 * source.amplitude * Math.sqrt(calculations.intensityRatio)
    const noise = (hash01(i + calculations.analyzerAngle + Math.floor(phase * 3)) - 0.5) * (mode === 'quantum' ? 8 : 3)
    return `${x},${50 - carrier - noise}`
  }).join(' ')
  return (
    <div className="scope-box">
      <div className="scope-head">
        {mode === 'quantum' ? 'Photon arrival scope' : 'Live field oscilloscope'} <InfoTip id="oscilloscope" />
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Oscilloscope detector signal">
        <defs>
          <linearGradient id="scopeGlow" x1="0" x2="1">
            <stop stopColor="#22d3ee" />
            <stop offset="1" stopColor="#f0abfc" />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, i) => <line key={`h-${i}`} x1="0" x2="100" y1={i * 25} y2={i * 25} />)}
        {Array.from({ length: 5 }, (_, i) => <line key={`v-${i}`} y1="0" y2="100" x1={i * 25} x2={i * 25} />)}
        <polyline points={points} />
      </svg>
      <div className="scope-controls">
        <button type="button" onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button>
        <button type="button" onClick={() => setZoom((z) => clamp(z + 0.25, 0.5, 2.5))}>Zoom +</button>
        <button type="button" onClick={() => setZoom((z) => clamp(z - 0.25, 0.5, 2.5))}>Zoom -</button>
        <button type="button" onClick={() => navigator.clipboard?.writeText(points)}>Export</button>
      </div>
    </div>
  )
}

function PolarPlot({ angle, transmission }) {
  const rad = degToRad(angle)
  const x = 50 + Math.cos(rad) * 36
  const y = 50 - Math.sin(rad) * 36
  return (
    <div className="polar-plot">
      <svg viewBox="0 0 100 100" role="img" aria-label="Analyzer polar transmission plot">
        <circle cx="50" cy="50" r="38" />
        <circle cx="50" cy="50" r={8 + transmission * 28} className="fill" />
        <line x1="50" y1="50" x2={x} y2={y} />
        <text x="8" y="16">Analyzer polar plot</text>
      </svg>
    </div>
  )
}

function VectorPanel({ mode, stateAngle, basisAngle, calculations }) {
  const delta = relativeAngle(stateAngle, basisAngle)
  const h = Math.cos(degToRad(delta))
  const v = Math.sin(degToRad(delta))
  const stateRad = degToRad(stateAngle)
  const basisRad = degToRad(basisAngle)
  const orthRad = basisRad + Math.PI / 2
  const basis = basisName(basisAngle)
  return (
    <section className="panel">
      <div className="panel-title">{mode === 'quantum' ? 'Basis-Dependent State' : 'Field Projection Geometry'}</div>
      <div className="panel-body">
        <svg viewBox="-1.25 -1.25 2.5 2.5" className="vector-svg" role="img" aria-label="Basis-dependent polarization decomposition">
          <circle cx="0" cy="0" r="1" fill="none" stroke="#334155" strokeWidth="0.025" />
          <line x1={-Math.cos(basisRad)} y1={Math.sin(basisRad)} x2={Math.cos(basisRad)} y2={-Math.sin(basisRad)} stroke="#a78bfa" strokeWidth="0.026" />
          <line x1={-Math.cos(orthRad)} y1={Math.sin(orthRad)} x2={Math.cos(orthRad)} y2={-Math.sin(orthRad)} stroke="#64748b" strokeWidth="0.018" />
          <line x1="0" y1="0" x2={Math.cos(stateRad)} y2={-Math.sin(stateRad)} stroke="#38bdf8" strokeWidth="0.055" />
          <line x1="0" y1="0" x2={Math.cos(basisRad) * h} y2={-Math.sin(basisRad) * h} stroke="#22c55e" strokeDasharray="0.05 0.04" strokeWidth="0.04" />
          <line x1={Math.cos(basisRad) * h} y1={-Math.sin(basisRad) * h} x2={Math.cos(stateRad)} y2={-Math.sin(stateRad)} stroke="#fb7185" strokeDasharray="0.05 0.04" strokeWidth="0.035" />
          <circle cx={Math.cos(stateRad)} cy={-Math.sin(stateRad)} r="0.055" fill="#e0f2fe" />
          <text x={Math.cos(basisRad) * 0.82} y={-Math.sin(basisRad) * 0.82 - 0.05} fill="#ddd6fe" fontSize="0.12">|A⟩</text>
          <text x={Math.cos(orthRad) * 0.72} y={-Math.sin(orthRad) * 0.72 - 0.05} fill="#cbd5e1" fontSize="0.12">|A⊥⟩</text>
        </svg>
        <div className="formula-box">
          <span className="text-sky-200">Active basis: {basis}</span>
          <span className="text-emerald-300">parallel amplitude = cos(Δθ) = {fmt(h)}</span>
          <span className="text-rose-300">orthogonal amplitude = sin(Δθ) = {fmt(v)}</span>
          <strong>{mode === 'quantum' ? `|ψ⟩ = ${calculations.superpositionStr}` : `E = ${fmt(h)}E∥ + ${fmt(v)}E⊥`}</strong>
          {mode === 'quantum' && <span>|45°⟩ = 1/√2 (|H⟩ + |V⟩)</span>}
        </div>
      </div>
    </section>
  )
}

function DemoPanel({ labState, calculations, setLabState }) {
  if (labState.activeDemo === 'threePolarizer') {
    const steps = [
      'Step 1: Prepare the incoming state at +45°.',
      'Step 2: Measure in the HV basis at V = 90°. Transmission probability is cos²(45°)=50%, and successful photons collapse to |V⟩.',
      'Step 3: The vertical state is a superposition in the ±45° basis, so the -45° polarizer transmits 50% of the survivors.',
      'Step 4: The final analyzer confirms the -45° state. Surviving intensity is 25% of the original.',
    ]
    return (
      <section className="panel demo-panel">
        <div className="panel-title">Three-Polarizer Experiment</div>
        <div className="panel-body">
          {steps.map((step, i) => <p key={step} className={i === labState.demoStep ? 'active-step' : ''}>{i + 1}. {step}</p>)}
          <div className="formula-box">
            <span>|+45°⟩ → measure HV → |V⟩ → measure ±45° → |-45°⟩</span>
            <span>I_final = I₀ × cos²(45°) × cos²(45°) = I₀/4 = {fmt(calculations.intensityRatio)}</span>
          </div>
          <button type="button" className="secondary-button" onClick={() => setLabState((s) => ({ ...s, demoStep: (s.demoStep + 1) % 4 }))}>Next step</button>
        </div>
      </section>
    )
  }
  if (labState.activeDemo === 'qkd') return <QkdPanel eveEnabled={labState.eveEnabled} setLabState={setLabState} />
  return null
}

function QkdPanel({ eveEnabled, setLabState }) {
  const rows = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const bit = hash01(i) > 0.5 ? 1 : 0
        const aliceBasis = hash01(i + 20) > 0.5 ? 'HV' : 'Diagonal'
        const eveBasis = hash01(i + 40) > 0.5 ? 'HV' : 'Diagonal'
        const bobBasis = hash01(i + 60) > 0.5 ? 'HV' : 'Diagonal'
        const disturbed = eveEnabled && eveBasis !== aliceBasis && bobBasis === aliceBasis && hash01(i + 80) < 0.5
        const bobResult = disturbed ? 1 - bit : bit
        return { bit, aliceBasis, eveBasis, bobBasis, bobResult, match: bit === bobResult && bobBasis === aliceBasis }
      }),
    [eveEnabled],
  )
  const sifted = rows.filter((r) => r.bobBasis === r.aliceBasis)
  const errors = sifted.filter((r) => r.bit !== r.bobResult).length
  const errorRate = sifted.length ? Math.round((errors / sifted.length) * 100) : 0
  return (
    <section className="panel demo-panel">
      <div className="panel-title">Quantum Key Distribution Demo</div>
      <div className="panel-body">
        <label className="toggle-row">
          <span><ShieldAlert size={15} /> Eve intercepts photons</span>
          <input type="checkbox" checked={eveEnabled} onChange={(event) => setLabState((s) => ({ ...s, eveEnabled: event.target.checked }))} />
        </label>
        <div className="overflow-x-auto">
          <table className="qkd-table">
            <thead><tr><th>Alice bit</th><th>Alice basis</th><th>Eve basis</th><th>Bob basis</th><th>Bob result</th><th>Match?</th></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}><td>{row.bit}</td><td>{row.aliceBasis}</td><td>{eveEnabled ? row.eveBasis : '—'}</td><td>{row.bobBasis}</td><td>{row.bobResult}</td><td>{row.match ? 'Yes' : 'No'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Error rate in matched bases: <strong>{errorRate}%</strong>. If Eve measures in the wrong basis, she collapses the photon and introduces detectable errors.</p>
      </div>
    </section>
  )
}

function GraphPanel({ mode, calculations }) {
  const angle = Math.abs(calculations.theta)
  const markers = [{ angle, transmit: probTransmit(angle), absorb: probAbsorb(angle), current: calculations.intensityRatio }]
  const analyzerAngle = normalizeAngle(calculations.analyzerAngle - calculations.incomingAngle)
  const analyzerField = Math.cos(degToRad(analyzerAngle))
  const analyzerMarker = [{ angle: analyzerAngle, transmit: calculations.analyzerTransmission, field: analyzerField }]
  const photonStats = [
    { name: 'Transmitted', count: Math.round(calculations.probTransmit * 100), fill: '#22c55e' },
    { name: 'Absorbed', count: Math.round(calculations.probAbsorb * 100), fill: '#fb7185' },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {mode === 'classical' ? (
        <>
          <ChartCard
            title="Classical Intensity Transmission"
            subtitle="Malus’s Law: Transmitted intensity vs relative analyzer angle"
            equation="I_out = I_in · cos²(Δθ)"
            help="Light intensity depends on the square of the electric field projection."
            note="Intensity is proportional to the square of the electric field amplitude."
            metrics={`Current Δθ: ${fmt(analyzerAngle, 1)}° · Transmission: ${Math.round(calculations.analyzerTransmission * 100)}%`}
          >
            <ComposedChart data={chartData} margin={{ top: 12, right: 24, bottom: 28, left: 8 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis
                dataKey="angle"
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                label={{ value: 'Relative Angle Δθ (degrees)', position: 'insideBottom', offset: -16, fill: '#94a3b8', fontSize: 12 }}
              />
              <YAxis
                domain={[0, 1]}
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                label={{ value: 'Normalized Intensity', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
              />
              <ChartTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
              <ReferenceLine x={analyzerAngle} stroke="#facc15" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="transmit" stroke="#38bdf8" fill="#38bdf833" name="Intensity ratio cos²Δθ" />
              <Scatter data={analyzerMarker} dataKey="transmit" fill="#facc15" name="Current operating point" />
            </ComposedChart>
          </ChartCard>
          <ChartCard
            title="Electric Field Projection onto Analyzer Axis"
            subtitle="Field amplitude component parallel to analyzer direction"
            equation="E_out = E_in · cos(Δθ)"
            help="This graph shows signed electric field amplitude, not intensity. Negative values mean the projected field is phase-reversed relative to the analyzer axis."
            note="The analyzer transmits only the component of the electric field aligned with its axis."
            metrics={`Current Δθ: ${fmt(analyzerAngle, 1)}° · Field amplitude: ${fmt(analyzerField)}`}
            accent="projection"
            afterChart={<ProjectionLegend angle={analyzerAngle} field={analyzerField} />}
          >
            <ComposedChart data={chartData} margin={{ top: 18, right: 28, bottom: 42, left: 14 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis
                dataKey="angle"
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                label={{ value: 'Relative Angle Δθ (degrees)', position: 'insideBottom', offset: -28, fill: '#94a3b8', fontSize: 12 }}
              />
              <YAxis
                domain={[-1, 1]}
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                label={{ value: 'Normalized Field Amplitude', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
              />
              <ChartTooltip
                allowEscapeViewBox={{ x: false, y: false }}
                wrapperStyle={{ zIndex: 8, maxWidth: 260, pointerEvents: 'none' }}
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 10, boxShadow: '0 18px 42px rgba(0,0,0,0.38)' }}
              />
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
              <ReferenceLine x={analyzerAngle} stroke="#f0abfc" strokeDasharray="4 4" />
              <ChartLine type="monotone" dataKey="field" stroke="#c084fc" strokeWidth={3} dot={false} name="Field amplitude cosΔθ" />
              <Scatter data={analyzerMarker} dataKey="field" fill="#f0abfc" name="Live projection vector" />
            </ComposedChart>
          </ChartCard>
        </>
      ) : (
        <>
          <ChartCard title="Quantum Measurement Probability: Born Rule">
            <ComposedChart data={chartData} margin={{ top: 10, right: 18, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="angle" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <ChartTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
              <Legend />
              <ChartLine type="monotone" dataKey="transmit" stroke="#22c55e" dot={false} name="P(transmit)=cos²Δθ" />
              <ChartLine type="monotone" dataKey="absorb" stroke="#fb7185" dot={false} name="P(absorb)=sin²Δθ" />
              <Scatter data={markers} dataKey="transmit" fill="#22c55e" name="Current transmit" />
              <Scatter data={markers} dataKey="absorb" fill="#fb7185" name="Current absorb" />
            </ComposedChart>
          </ChartCard>
          <ChartCard title="Photon Statistics Histogram">
            <ComposedChart data={photonStats} margin={{ top: 10, right: 18, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <ChartTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
              <Bar dataKey="count" fill="#a78bfa" name="Expected count per 100 photons" radius={[6, 6, 0, 0]} />
            </ComposedChart>
          </ChartCard>
          <ChartCard title="Quantum Zeno Repeated-Measurement Limit">
            <ComposedChart data={zenoData} margin={{ top: 10, right: 18, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="n" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <ChartTooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
              <ChartLine type="monotone" dataKey="probability" stroke="#a78bfa" dot={false} name="Survival probability" />
            </ComposedChart>
          </ChartCard>
          <QuantumReferenceCard />
        </>
      )}
    </div>
  )
}

function QuantumReferenceCard() {
  return (
    <aside className="panel quantum-reference-card">
      <span className="eyebrow">Reference</span>
      <h3>The Two Golden Rules of Quantum Mechanics with Light Polarization</h3>
      <p>Answer key and activity guide for investigating superposition and measurement using the polarization of light.</p>
      <div className="quantum-reference-concepts">
        <strong>Concepts from the PDF</strong>
        <span>Quantum measurement is probabilistic.</span>
        <span>Superposition is relative to the measurement context.</span>
        <span>Measuring an unknown quantum state can change it.</span>
      </div>
      <a href="/media/01-2gr-activity-answers.pdf" target="_blank" rel="noreferrer">Open PDF reference</a>
    </aside>
  )
}

function ProjectionLegend({ angle, field }) {
  const rad = degToRad(angle)
  const x = 50 + Math.cos(rad) * 34
  const y = 50 - Math.sin(rad) * 34
  const px = 50 + field * 34
  return (
    <div className="projection-legend">
      <svg viewBox="0 0 100 100" aria-label="Live analyzer projection vector">
        <circle cx="50" cy="50" r="36" />
        <line x1="14" y1="50" x2="86" y2="50" className="axis" />
        <line x1="50" y1="50" x2={x} y2={y} className="incoming" />
        <line x1="50" y1="50" x2={px} y2="50" className="projected" />
        <line x1={x} y1={y} x2={px} y2="50" className="drop" />
        <text x="8" y="14">Analyzer axis projection</text>
      </svg>
      <span>Signed projection: {fmt(field)}. Squaring this value gives intensity {fmt(field ** 2)}.</span>
    </div>
  )
}

function ChartCard({ title, subtitle, equation, help, note, metrics, accent, children, afterChart }) {
  return (
    <section className={`panel chart-card ${accent === 'projection' ? 'projection-card' : ''}`}>
      <div className="chart-heading">
        <div>
          <div className="panel-title">{title}</div>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {equation && <code>{equation}</code>}
      </div>
      {help && <div className="chart-help"><Info size={14} /> {help}</div>}
      {metrics && <div className="chart-metrics">{metrics}</div>}
      <div className="chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
      {afterChart}
      {note && <p className="chart-note">{note}</p>}
    </section>
  )
}

function LabTab({ labState, setLabState, calculations, resetLab, runThreeDemo, runQkdDemo }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
      <main className="grid gap-5">
        {labState.showOnboarding && <OnboardingPanel setLabState={setLabState} runThreeDemo={runThreeDemo} />}
        <LabScene labState={labState} calculations={calculations} setLabState={setLabState} resetLab={resetLab} />
        <ExperimentStrip labState={labState} calculations={calculations} setLabState={setLabState} />
        {labState.mode === 'quantum' && <ZenoInsightPanel zenoN={labState.zenoN} />}
        <DemoPanel labState={labState} calculations={calculations} setLabState={setLabState} />
        <GraphPanel mode={labState.mode} calculations={calculations} />
      </main>
      <ControlPanel labState={labState} setLabState={setLabState} calculations={calculations} runThreeDemo={runThreeDemo} runQkdDemo={runQkdDemo} />
    </div>
  )
}

function ZenoInsightPanel({ zenoN }) {
  const step = 90 / zenoN
  const p = zenoProb(zenoN)
  return (
    <section className="zeno-insight">
      <div>
        <span className="eyebrow">Quantum Zeno Insight</span>
        <h3>Repeated measurements interrupt one large rotation into many tiny projections.</h3>
        <p>Each successful measurement prepares the photon in the next nearby basis. Smaller steps have larger survival probability, so continuous observation can keep the photon on the measured path.</p>
      </div>
      <div className="zeno-mini-path">
        {Array.from({ length: Math.min(zenoN, 14) }, (_, i) => (
          <span key={i} style={{ transform: `rotate(${i * step}deg)` }} />
        ))}
      </div>
      <div className="formula-box">Δθ = {fmt(step, 2)}° · survival ≈ {Math.round(p * 100)}%</div>
    </section>
  )
}

function OnboardingPanel({ setLabState, runThreeDemo }) {
  return (
    <section className="onboarding-panel">
      <div>
        <span className="eyebrow">Guided start</span>
        <h2>Measure polarization like a real optics bench.</h2>
        <p>Rotate polarizers, switch into photon mode, then use the analyzer to project the outgoing state onto a measurement basis.</p>
      </div>
      <div className="onboarding-actions">
        <button type="button" className="secondary-button" onClick={runThreeDemo}><Zap size={15} /> Start three-polarizer demo</button>
        <button type="button" className="secondary-button" onClick={() => setLabState((s) => ({ ...s, mode: 'quantum', showOnboarding: false }))}><Atom size={15} /> Try quantum photons</button>
        <button type="button" className="icon-button" aria-label="Dismiss guided start" onClick={() => setLabState((s) => ({ ...s, showOnboarding: false }))}>×</button>
      </div>
    </section>
  )
}

function ExperimentStrip({ labState, calculations, setLabState }) {
  const finalAxis = normalizeAngle(labState.polarizers.filter((p) => p.enabled).at(-1)?.angle ?? labState.source.polarizationAngle)
  const goals = [
    { label: 'Aligned analyzer', done: Math.abs(calculations.analyzerTheta) < 4 },
    { label: 'Crossed analyzer', done: Math.abs(Math.abs(calculations.analyzerTheta) - 90) < 4 },
    { label: 'Quantum mode', done: labState.mode === 'quantum' },
    { label: 'P3 enabled', done: labState.polarizers[2].enabled },
  ]
  const completed = goals.filter((g) => g.done).length
  const setNotebookNote = (text, tone = 'max') => {
    setLabState((s) => ({ ...s, notebookNote: { text, tone, at: Date.now() } }))
  }
  const alignAnalyzer = () => {
    const targetPolarizers = labState.polarizers.map((p) => ({ ...p }))
    const targetAnalyzer = { ...labState.analyzer, enabled: true, angle: finalAxis }
    animateOptics(setLabState, { polarizers: targetPolarizers, analyzer: targetAnalyzer }, 720)
    setNotebookNote(
      labState.mode === 'quantum'
        ? 'Analyzer aligned with the incoming measurement basis -> transmission probability maximized.'
        : 'Analyzer aligned with the incoming field -> projection loss minimized.',
      'max',
    )
  }
  const crossAnalyzer = () => {
    const targetPolarizers = labState.polarizers.map((p) => ({ ...p }))
    const targetAnalyzer = { ...labState.analyzer, enabled: true, angle: normalizeAngle(finalAxis + 90) }
    animateOptics(setLabState, { polarizers: targetPolarizers, analyzer: targetAnalyzer }, 720)
    setNotebookNote(
      labState.mode === 'quantum'
        ? 'Analyzer rotated to an orthogonal basis -> probability amplitude overlap minimized.'
        : 'Analyzer rotated to the orthogonal axis -> transmission minimized.',
      'min',
    )
  }
  const toggleQuantum = () => {
    setLabState((s) => {
      const nextMode = s.mode === 'quantum' ? 'classical' : 'quantum'
      return {
        ...s,
        mode: nextMode,
        notebookNote: {
          text: nextMode === 'quantum'
            ? 'Quantum mode enabled -> photons are now shown as discrete probabilistic detections.'
            : 'Classical mode enabled -> the continuous electric field wave is restored.',
          tone: nextMode === 'quantum' ? 'quantum' : 'max',
          at: Date.now(),
        },
      }
    })
  }
  const toggleP3 = () => {
    setLabState((s) => {
      const enabled = !s.polarizers[2].enabled
      return {
        ...s,
        polarizers: s.polarizers.map((p, i) => (i === 2 ? { ...p, enabled } : p)),
        notebookNote: {
          text: enabled
            ? 'Polarizer 3 enabled -> the chain now includes an intermediate projection basis.'
            : 'Polarizer 3 disabled -> calculations now skip the third polarizer.',
          tone: enabled ? 'max' : 'min',
          at: Date.now(),
        },
      }
    })
  }
  const actions = [
    { ...goals[0], onClick: alignAnalyzer },
    { ...goals[1], onClick: crossAnalyzer },
    { ...goals[2], onClick: toggleQuantum },
    { ...goals[3], onClick: toggleP3 },
  ]
  const isQuantum = labState.mode === 'quantum'
  const optimizerActions = [
    { label: isQuantum ? 'Max Probability' : 'Max Intensity', type: 'max' },
    { label: isQuantum ? 'Min Probability' : 'Min Intensity', type: 'min' },
  ]
  return (
    <section className="experiment-strip">
      <div className="notebook-summary">
        <span className="eyebrow">Lab notebook</span>
        <strong>{completed}/{goals.length} observations completed</strong>
      </div>
      <div className="notebook-controls">
        <div className="notebook-optimizer" aria-label={isQuantum ? 'Quantum probability optimizer' : 'Classical intensity optimizer'}>
          {optimizerActions.map((action) => (
            <button type="button" key={action.type} className={`optimizer-chip ${action.type}`} onClick={() => runExtremaOptimization(labState, setLabState, action.type, 'notebook')}>
              {action.label}
            </button>
          ))}
        </div>
        <div className="badge-row">
          {actions.map((goal) => (
            <button type="button" key={goal.label} className={goal.done ? 'done' : ''} onClick={goal.onClick}>
              {goal.done ? '✓' : '○'} {goal.label}
            </button>
          ))}
        </div>
      </div>
      {labState.notebookNote && (
        <p key={labState.notebookNote.at} className={`notebook-note ${labState.notebookNote.tone}`}>
          {labState.notebookNote.text}
          {isQuantum
            ? ` Current probability: ${Math.round(calculations.probTransmit * 100)}%; expected count: ${Math.round(calculations.probTransmit * labState.source.photonRate)} photons/s.`
            : ` Current intensity: ${Math.round(calculations.intensityRatio * 100)}%.`}
        </p>
      )}
    </section>
  )
}

function ZenoTab({ labState, setLabState }) {
  const p = zenoProb(labState.zenoN)
  const step = 90 / labState.zenoN
  const zenoTooltipFormatter = (value) => {
    const numeric = Number(value)
    return [numeric < 0.001 ? numeric.toExponential(3) : fmt(numeric, 6), 'Survival probability']
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <section className="panel">
        <div className="panel-title">Quantum Zeno Effect</div>
        <div className="panel-body">
          <p className="theory-copy">Horizontal to vertical rotation is divided into N small measurement bases. Each successful measurement collapses the photon into the next slightly rotated basis instead of letting one large 90° jump fail.</p>
          <div className="zeno-steps">
            {Array.from({ length: Math.min(labState.zenoN, 18) }, (_, i) => (
              <span key={i} style={{ transform: `rotate(${i * step}deg)` }} />
            ))}
          </div>
          <ChartCard title="Probability vs N">
            <ComposedChart data={zenoData} margin={{ top: 10, right: 18, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="n" stroke="#94a3b8" />
              <YAxis domain={[0, 1]} stroke="#94a3b8" />
              <ChartTooltip
                formatter={zenoTooltipFormatter}
                labelFormatter={(label) => `N = ${label}`}
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
              />
              <Area type="monotone" dataKey="probability" stroke="#a78bfa" fill="#a78bfa33" name="Survival probability" />
              <ReferenceLine x={labState.zenoN} stroke="#facc15" strokeDasharray="4 4" />
              <ReferenceDot x={labState.zenoN} y={p} r={6} fill="#facc15" stroke="#fef3c7" strokeWidth={2} />
            </ComposedChart>
          </ChartCard>
        </div>
      </section>
      <aside className="panel">
        <div className="panel-title">Controls</div>
        <div className="panel-body">
          <Slider label="N intermediate polarizers" value={labState.zenoN} min={1} max={50} unit="" onChange={(zenoN) => setLabState((s) => ({ ...s, zenoN, activeDemo: 'zenoEffect' }))} tip="basis" />
          <div className="formula-box">P = (cos(90°/{labState.zenoN}))^(2×{labState.zenoN}) = {fmt(p)}</div>
          <p className="theory-copy">Each plate represents a small measurement and collapse event. As N grows, Δθ = {fmt(step, 2)}° becomes tiny, so cos²(Δθ) is near 1 at every step.</p>
          <p className="theory-copy">At N = ∞, continuous observation suppresses the unwanted transition: the Quantum Zeno Effect.</p>
        </div>
      </aside>
    </div>
  )
}

function TheoryTab() {
  const topics = useMemo(() => [
    theoryTopic('Polarization', 'axis', 'Polarization describes the direction in which the electric field of light oscillates.', 'In the lab, each polarizer has a visible axis. The incoming field is split into aligned and rejected components at that plane.', 'Polarization lets physicists control light with geometry instead of only brightness.', 'Sunglasses, LCD screens, camera filters, fiber links.', 'E_parallel = E cos(Δθ)'),
    theoryTopic('Malus Law', 'formula', 'Malus’s Law says transmitted intensity falls as the square of the relative angle projection.', 'Watch the classical intensity graph and detector dim as Δθ changes between the wave and the analyzer.', 'It connects a simple field projection to measurable optical power.', 'Optical sensors, photography filters, stress analysis.', 'I_out = I_in cos²(Δθ)'),
    theoryTopic('Superposition', 'vector', 'A quantum state can be written as a combination of outcomes in the chosen measurement basis.', 'The state panel decomposes the incoming photon into the final analyzer basis.', 'It explains why the same photon can be definite in one basis and uncertain in another.', 'Qubits, quantum communication, interference experiments.', '|ψ⟩ = a|A⟩ + b|A⊥⟩'),
    theoryTopic('Measurement Basis', 'basis', 'A basis is the pair of answers a measurement can return, such as horizontal/vertical.', 'The final analyzer chooses the basis. Rotate it and the decomposition changes.', 'Basis choice is the heart of quantum measurement and quantum cryptography.', 'QKD, polarization microscopes, quantum gates.', '|H⟩, |V⟩  or  |+45°⟩, |-45°⟩'),
    theoryTopic('Born Rule', 'photon', 'The Born Rule turns a probability amplitude into an observed probability.', 'In Quantum Mode, photon counts approach P(transmit)=cos²(Δθ).', 'It is the bridge between wave-like state descriptions and detector clicks.', 'Single-photon detectors, quantum random number generation.', 'P(transmit)=|⟨A|ψ⟩|²'),
    theoryTopic('Quantum Collapse', 'photon', 'After a successful measurement, the outgoing photon is aligned with the analyzer basis.', 'The collapse overlay shows the transmitted branch re-aligning and the absorbed branch ending.', 'It clarifies why a measurement changes the state, not just reveals it.', 'Quantum measurement, QKD eavesdropper detection.', '|ψ_out⟩ = |A⟩'),
    theoryTopic('Three Polarizers', 'stack', 'A middle polarizer can restore light between crossed polarizers by preparing an intermediate state.', 'Use the Three-Polarizer Demo to see +45° → V → -45° as two 50% projections.', 'It is a compact demonstration that measurement can change what happens next.', 'Quantum outreach labs, polarization demonstrations.', 'I = I0 cos²45° cos²45°'),
    theoryTopic('Quantum Zeno Effect', 'analyzer', 'Many gentle measurements can keep a photon following a path with high survival probability.', 'The Zeno panel divides a 90° change into many small projection steps.', 'It shows how repeated observation can alter evolution.', 'Precision measurement, quantum control.', 'P = (cos(90°/N))^(2N)'),
    theoryTopic('QKD', 'photon', 'Quantum key distribution uses basis mismatch and disturbance to detect eavesdropping.', 'The QKD demo shows how wrong-basis measurement changes later results.', 'It turns quantum measurement disturbance into communication security.', 'Secure communication, BB84 demonstrations.', 'wrong basis → detectable errors'),
    theoryTopic('Bloch Circle', 'vector', 'Linear polarization can be visualized as a point and rotating basis axes on a circle.', 'The state vector panel shows projection onto the active analyzer basis.', 'It gives a geometric mental model for qubits.', 'Quantum computing education, polarization qubits.', '|45°⟩ = 1/√2(|H⟩+|V⟩)'),
    theoryTopic('Probability Amplitudes', 'formula', 'Amplitudes are signed components; probabilities come from squaring their size.', 'The field projection graph shows the signed cosine before it becomes intensity.', 'It prevents confusing amplitude with probability.', 'Interference, spin measurements, photon polarization.', 'probability = |amplitude|²'),
    theoryTopic('Wave-Particle Duality', 'wave', 'Light propagates like a field in classical mode and arrives as photon events in quantum mode.', 'Switch modes to compare continuous waves with individual photon packets.', 'It shows why one experiment can need two complementary descriptions.', 'Lasers, detectors, quantum optics.', 'many photons → classical intensity'),
  ], [])
  const [active, setActive] = useState('Polarization')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [superpositionMode, setSuperpositionMode] = useState('constructive')
  const topic = topics.find((item) => item.title === active) ?? topics[0]
  return (
    <div className={`theory-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="theory-nav">
        <div className="theory-nav-header">
          <span>{sidebarCollapsed ? 'Th' : 'Theory Topics'}</span>
          <button type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label="Collapse theory sidebar">
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>
        {topics.map((item) => (
          <button key={item.title} type="button" className={active === item.title ? 'active' : ''} onClick={() => setActive(item.title)}>
            <span className="theory-nav-initial">{getTopicInitials(item.title)}</span>
            <span className="theory-nav-label">{item.title}</span>
          </button>
        ))}
      </aside>
      <article className="theory-detail">
        <div className="theory-hero-copy">
          <span className="eyebrow">Interactive lesson</span>
          <h2>{topic.title}</h2>
        </div>
        <TheoryBlock title="Simple definition" body={topic.definition} />
        <TheoryVisualPanel topic={topic} superpositionMode={superpositionMode} onSuperpositionModeChange={setSuperpositionMode} />
        <div className="formula-box mt-4">
          <span>{topic.formula}</span>
          <small>Terms: Δθ is the relative angle between the incoming state and the measurement axis. Squaring appears when field amplitude becomes intensity or probability.</small>
        </div>
        <TheoryBlock title="Why this concept matters" body={topic.significance} />
        <TheoryBlock title="Daily life examples" body={topic.applications} />
        <TheorySteps steps={topic.steps} />
        <TheoryBlock title="How this appears in the experiment" body={topic.lab} />
        <details className="derivation-box">
          <summary>Teaching Note</summary>
          <p>{topic.note}</p>
        </details>
        <div className="lab-connection">Where to see it: {topic.connection}</div>
      </article>
    </div>
  )
}

function getTopicInitials(title) {
  if (title === 'Quantum Zeno Effect') return 'QZ'
  if (title === 'Quantum Collapse') return 'QC'
  if (title === 'Measurement Basis') return 'MB'
  if (title === 'Three Polarizers') return '3P'
  if (title === 'Wave-Particle Duality') return 'WD'
  if (title === 'Probability Amplitudes') return 'PA'
  if (title === 'Bloch Circle') return 'BC'
  return title.split(' ').map((part) => part[0]).join('').slice(0, 2)
}

function theoryTopic(title, visual, definition, lab, significance, applications, formula) {
  return {
    title,
    visual,
    definition,
    lab,
    significance,
    applications,
    formula,
    note: 'Think of the analyzer as asking one clear question: how much of the incoming state points along my axis? The lab shows that answer as a vector projection first, then as intensity or photon counts.',
    connection: title === 'Malus Law' ? 'Classical graphs below the 3D viewport.' : title === 'Quantum Zeno Effect' ? 'Zeno tab and Quantum Mode insight panel.' : '3D lab viewport and final analyzer controls.',
    steps: getTheorySteps(title),
    references: getTheoryReferences(title),
  }
}

function getTheorySteps(title) {
  const map = {
    Polarization: ['Start with light whose electric field points in many transverse directions.', 'Pass it through a polarizer that selects one allowed axis.', 'Only the aligned component continues as linearly polarized light.'],
    'Malus Law': ['Prepare linearly polarized light.', 'Rotate the analyzer by an angle theta relative to the incoming axis.', 'The transmitted field is projected by cos(theta), so intensity becomes cos²(theta).'],
    Superposition: ['Represent each wave or state as a component.', 'Add matching components point by point.', 'The resultant amplitude determines the observable effect.'],
    'Measurement Basis': ['Choose the pair of outcomes the apparatus can distinguish.', 'Project the incoming state onto those basis axes.', 'A measurement returns one outcome and prepares that state.'],
    'Born Rule': ['Read the complex or geometric amplitude.', 'Square its magnitude.', 'Interpret that square as the probability of the measurement outcome.'],
    'Quantum Collapse': ['Before measurement, multiple outcomes can coexist as amplitudes.', 'The detector interacts with the system.', 'One outcome is selected and the outgoing state is updated.'],
    'Three Polarizers': ['Crossed polarizers block light.', 'Insert an intermediate polarizer to prepare a new basis.', 'Transmission returns because the path is split into smaller projections.'],
    'Quantum Zeno Effect': ['Replace one large rotation with many small measurements.', 'Each successful measurement prepares the next nearby state.', 'As steps get smaller, survival probability increases.'],
    QKD: ['Alice encodes photons in polarization bases.', 'Bob measures with a chosen basis.', 'Wrong-basis interception creates detectable disturbance.'],
    'Bloch Circle': ['Place the state as a vector on the sphere.', 'Rotate the vector to model evolution.', 'Project onto basis axes to predict measurement outcomes.'],
    'Probability Amplitudes': ['Track signed amplitudes instead of direct probabilities.', 'Combine amplitudes before measuring.', 'Square the final amplitude to obtain probability.'],
    'Wave-Particle Duality': ['Show light as a continuous wave during propagation.', 'Detect it as discrete photon events.', 'Many events recover the classical wave intensity pattern.'],
  }
  return map[title] ?? ['Watch the visual pattern evolve.', 'Relate the geometry to the formula.', 'Use the lab tab to test the concept interactively.']
}

function getTheoryReferences(title) {
  const common = [{ label: 'MIT OCW polarization lecture', url: 'https://opencw.aprende.org/courses/physics/8-02-electricity-and-magnetism-spring-2002/video-lectures/lecture-30-polarizers-and-maluss-law/' }]
  const map = {
    Polarization: [
      { label: 'HyperPhysics polarization', url: 'https://hyperphysics.phy-astr.gsu.edu/hbase/phyopt/polclas.html' },
      { label: 'Physics Classroom polarization', url: 'https://www.physicsclassroom.com/class/light/Lesson-1/Polarization' },
    ],
    'Malus Law': [
      { label: 'HyperPhysics Malus law', url: 'https://hyperphysics.phy-astr.gsu.edu/hbase/phyopt/polcross.html' },
      { label: 'MIT OCW Malus law lecture', url: 'https://opencw.aprende.org/courses/physics/8-02-electricity-and-magnetism-spring-2002/video-lectures/lecture-30-polarizers-and-maluss-law/' },
      { label: 'Cowen Physics Malus law video', url: 'https://www.youtube.com/watch?v=utY72MD-Ii4' },
    ],
    Superposition: [
      { label: 'Feynman Lectures probability amplitudes', url: 'https://www.feynmanlectures.caltech.edu/III_03.html' },
      { label: 'IBM Quantum superposition basics', url: 'https://quantum.cloud.ibm.com/learning/courses/basics-of-quantum-information/single-systems/quantum-information' },
    ],
    'Born Rule': [
      { label: 'Born rule overview', url: 'https://en.wikipedia.org/wiki/Born_rule' },
      { label: 'IBM Quantum Born rule', url: 'https://quantum.cloud.ibm.com/learning/courses/basics-of-quantum-information/single-systems/quantum-information' },
      { label: 'IBM measurement guide', url: 'https://docs.quantum.ibm.com/guides/measure-qubits' },
    ],
    'Quantum Collapse': [
      { label: 'Wave function collapse overview', url: 'https://en.wikipedia.org/wiki/Wave_function_collapse' },
      { label: 'IBM quantum measurement', url: 'https://quantum.cloud.ibm.com/learning/courses/general-formulation-of-quantum-information/general-measurements/introduction' },
      { label: 'Britannica quantum mechanics', url: 'https://www.britannica.com/science/quantum-mechanics-physics' },
    ],
    'Three Polarizers': [
      { label: 'Three polarizers discussion', url: 'https://physics.stackexchange.com/questions/61918/three-polarizers-45-apart' },
      { label: 'MIT OCW polarization lecture', url: 'https://opencw.aprende.org/courses/physics/8-02-electricity-and-magnetism-spring-2002/video-lectures/lecture-30-polarizers-and-maluss-law/' },
    ],
    QKD: [
      { label: 'ISRO quantum key distribution', url: 'https://www.isro.gov.in/Quantum%20Key%20Distribution%20(QKD).html' },
      { label: 'Quantum key distribution overview', url: 'https://en.wikipedia.org/wiki/Quantum_key_distribution' },
      { label: 'IBM quantum information', url: 'https://quantum.cloud.ibm.com/learning/courses/basics-of-quantum-information/single-systems/quantum-information' },
      { label: 'Wikipedia BB84 overview', url: 'https://en.wikipedia.org/wiki/BB84' },
    ],
    'Quantum Zeno Effect': [
      { label: 'Quantum Zeno overview', url: 'https://en.wikipedia.org/wiki/Quantum_Zeno_effect' },
      { label: 'IBM measurement concepts', url: 'https://docs.quantum.ibm.com/guides/measure-qubits' },
    ],
    'Probability Amplitudes': [
      { label: 'Feynman Lectures probability amplitudes', url: 'https://www.feynmanlectures.caltech.edu/III_03.html' },
      { label: 'IBM Quantum information basics', url: 'https://quantum.cloud.ibm.com/learning/courses/basics-of-quantum-information/single-systems/quantum-information' },
    ],
    'Bloch Circle': [
      { label: 'Bloch sphere overview', url: 'https://en.wikipedia.org/wiki/Bloch_sphere' },
      { label: 'IBM Quantum information basics', url: 'https://quantum.cloud.ibm.com/learning/courses/basics-of-quantum-information/single-systems/quantum-information' },
    ],
    'Wave-Particle Duality': [
      { label: 'Wave-particle duality overview', url: 'https://en.wikipedia.org/wiki/Wave%E2%80%93particle_duality' },
      { label: 'Wave overview', url: 'https://en.wikipedia.org/wiki/Wave' },
      { label: 'Feynman Lectures probability amplitudes', url: 'https://www.feynmanlectures.caltech.edu/III_03.html' },
    ],
  }
  return map[title] ?? common
}

function TheoryBlock({ title, body }) {
  return (
    <section className="theory-block">
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  )
}

function TheorySteps({ steps }) {
  return (
    <section className="theory-block theory-steps">
      <h3>Step-by-step explanation</h3>
      <ol>
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </section>
  )
}

function TheorySceneRenderer({ topic, superpositionMode = 'constructive' }) {
  const [active, setActive] = useState(!document.hidden)
  const controls = useRef()

  useEffect(() => {
    const update = () => setActive(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return (
    <div className="theory-scene-shell">
      <Canvas
        key={topic.title}
        dpr={[1, 1.35]}
        frameloop={active ? 'always' : 'demand'}
        camera={{ position: [0, 2.25, 8.2], fov: 43 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#050b18']} />
        <fog attach="fog" args={['#050b18', 8, 18]} />
        <ambientLight intensity={0.36} />
        <Environment preset="night" />
        <directionalLight position={[2.5, 5, 4]} intensity={1.35} color="#dbeafe" />
        <pointLight position={[-3, 3, 4]} intensity={7.5} color="#38bdf8" />
        <pointLight position={[3, 2, 3]} intensity={5.8} color="#c084fc" />
        <Sparkles count={active ? 52 : 18} scale={[9, 3, 3]} size={1} speed={0.12} color="#7dd3fc" opacity={0.2} />
        <QuietSceneContext.Provider value>
          <OrbitControls
            ref={controls}
            enableDamping
            dampingFactor={0.06}
            enablePan={false}
            minDistance={4.8}
            maxDistance={11}
            minPolarAngle={Math.PI * 0.18}
            maxPolarAngle={Math.PI * 0.82}
            target={[0, 0, 0]}
          />
          <TheoryBenchFloor />
          <TheoryParticles active={active} />
          <TopicScene title={topic.title} active={active} superpositionMode={superpositionMode} />
        </QuietSceneContext.Provider>
      </Canvas>
      <div className="theory-scene-overlay">
        <span>{topic.title}</span>
        <code>{topic.formula}</code>
      </div>
      <button type="button" className="theory-scene-reset" onClick={() => controls.current?.reset()} aria-label="Reset theory render view">
        <RotateCcw size={14} />
      </button>
      <div className="theory-scene-status">Drag to rotate</div>
      <TheoryCaption>{getTheorySceneCaption(topic.title, superpositionMode)}</TheoryCaption>
    </div>
  )
}

function getTheorySceneCaption(title, superpositionMode) {
  if (title === 'Superposition') return superpositionMode === 'constructive' ? 'In phase: amplitudes add before probability' : 'Opposite phase: equal amplitudes cancel'
  if (title === 'Malus Law') return 'Intensity ∝ cos²(theta)'
  if (title === 'Polarization') return 'Filtering one oscillation axis'
  if (title === 'Quantum Collapse') return 'One branch survives'
  if (title === 'QKD') return 'Basis mismatch reveals disturbance'
  return 'Conceptual motion only'
}

function TheoryBenchFloor() {
  return (
    <>
      <mesh position={[0, -1.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11, 5.2]} />
        <meshStandardMaterial color="#07111f" metalness={0.36} roughness={0.34} emissive="#0f172a" emissiveIntensity={0.18} />
      </mesh>
      <gridHelper args={[20, 20, '#1e3a5f', '#0f172a']} position={[0, -1.285, 0]} />
      <ContactShadows position={[0, -1.27, 0]} opacity={0.28} scale={8.5} blur={2.1} far={4} frames={1} resolution={192} />
    </>
  )
}

function TheoryParticles({ active }) {
  const points = useMemo(() => {
    const count = active ? 90 : 28
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (hash01(i + 3) - 0.5) * 9
      positions[i * 3 + 1] = (hash01(i + 44) - 0.5) * 4.8
      positions[i * 3 + 2] = (hash01(i + 91) - 0.5) * 5
    }
    return positions
  }, [active])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#7dd3fc" size={0.025} transparent opacity={0.38} depthWrite={false} />
    </points>
  )
}

function AnimatedWave({ color = '#38bdf8', phase = 0, amplitude = 0.45, z = 0, y = 0, xStart = -3, xEnd = 3, frequency = 5, speed = 1, opacity = 1 }) {
  const geometry = useRef()
  const points = useMemo(() => Array.from({ length: 96 }, () => new THREE.Vector3()), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + phase
    for (let i = 0; i < points.length; i += 1) {
      const u = i / (points.length - 1)
      const x = xStart + (xEnd - xStart) * u
      points[i].set(x, y + Math.sin(u * frequency * Math.PI * 2 - t) * amplitude, z)
    }
    geometry.current?.setFromPoints(points)
  })

  return (
    <line>
      <bufferGeometry ref={geometry} />
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </line>
  )
}

function FieldVectorRibbon({ y = 0, z = 0, color = '#38bdf8', phase = 0, amp = 0.32, xStart = -3, xEnd = 3 }) {
  const refs = useRef([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2.2 + phase
    for (let i = 0; i < refs.current.length; i += 1) {
      const u = (i + 1) / (refs.current.length + 1)
      const x = xStart + (xEnd - xStart) * u
      const size = Math.sin(u * Math.PI * 10 - t) * amp
      updateTwoPointGeometry(refs.current[i], [x, y, z], [x, y + size, z + size * 0.28])
    }
  })
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <StaticTwoPointLine key={i} lineRef={(node) => { refs.current[i] = node }} color={color} opacity={0.58} />
      ))}
    </>
  )
}

function ProbabilityCloud() {
  const mesh = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const dots = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    r: 0.12 + hash01(i) * 0.72,
    a: hash01(i + 11) * Math.PI * 2,
    b: hash01(i + 22) * Math.PI,
    p: hash01(i + 33) * Math.PI * 2,
  })), [])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    dots.forEach((dot, i) => {
      const pulse = 0.75 + Math.sin(clock.elapsedTime * 1.6 + dot.p) * 0.2
      dummy.position.set(
        0.9 + Math.cos(dot.a + clock.elapsedTime * 0.12) * Math.sin(dot.b) * dot.r,
        Math.cos(dot.b) * dot.r,
        Math.sin(dot.a + clock.elapsedTime * 0.12) * Math.sin(dot.b) * dot.r,
      )
      dummy.scale.setScalar(0.025 * pulse)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, dots.length]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#f8fafc" transparent opacity={0.58} depthWrite={false} />
    </instancedMesh>
  )
}

function TheoryArrow({ from = [-1, 0, 0], to = [1, 0, 0], color = '#7dd3fc', opacity = 0.72 }) {
  const pulse = useRef()
  const end = new THREE.Vector3(...to)
  const start = new THREE.Vector3(...from)
  const mid = start.clone().lerp(end, 0.55)
  const direction = end.clone().sub(start)
  const length = direction.length()
  const angle = Math.atan2(direction.y, direction.x)
  useFrame(({ clock }) => {
    if (pulse.current) pulse.current.position.x = -length / 2 + ((clock.elapsedTime * 0.7) % 1) * length
  })
  return (
    <group position={mid.toArray()} rotation={[0, 0, angle]}>
      <Line points={[[-length / 2, 0, 0], [length / 2, 0, 0]]} color={color} lineWidth={1.4} transparent opacity={opacity} />
      <mesh position={[length / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.055, 0.18, 20]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh ref={pulse}>
        <sphereGeometry args={[0.035, 12, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.78} />
      </mesh>
    </group>
  )
}

function TheoryCaption({ children }) {
  return <div className="theory-scene-caption">{children}</div>
}

function PolarizerSheet({ position = [0, 0, 0], rotation = [0, 0, 0], color = '#7dd3fc' }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[0.08, 2.6, 1.7]} />
        <meshPhysicalMaterial color={color} transparent opacity={0.24} roughness={0.2} transmission={0.25} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[0.052, -1 + i * 0.25, 0]}>
          <boxGeometry args={[0.035, 0.018, 1.62]} />
          <meshBasicMaterial color="#dbeafe" transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function TopicScene({ title, active, superpositionMode }) {
  if (title === 'Malus Law') return <MalusTheoryScene active={active} />
  if (title === 'Superposition') return <SuperpositionTheoryScene mode={superpositionMode} />
  if (title === 'Measurement Basis') return <MeasurementBasisTheoryScene />
  if (title === 'Born Rule') return <BornRuleTheoryScene />
  if (title === 'Quantum Collapse') return <CollapseTheoryScene />
  if (title === 'Three Polarizers') return <ThreePolarizerTheoryScene />
  if (title === 'Quantum Zeno Effect') return <ZenoTheoryScene />
  if (title === 'QKD') return <QkdTheoryScene />
  if (title === 'Bloch Circle') return <BlochTheoryScene />
  if (title === 'Probability Amplitudes') return <ProbabilityAmplitudeTheoryScene />
  if (title === 'Wave-Particle Duality') return <DualityTheoryScene />
  return <PolarizationTheoryScene />
}

function TheoryOpticsBench({ polarizers, analyzer, source = DEFAULT_SOURCE, mode = 'classical', photon = false }) {
  const calculations = useMemo(() => getCalculations(polarizers, analyzer, source), [polarizers, analyzer, source])
  const isQuantum = photon || mode === 'quantum'
  return (
    <group scale={0.82} position={[0, 0.05, 0]}>
      <LightSource source={source} />
      <Polarizer x={POSITIONS.p1} angle={polarizers[0]?.angle ?? 0} color="#38bdf8" label="Polarizer 1" enabled={polarizers[0]?.enabled ?? false} />
      <Polarizer x={POSITIONS.p2} angle={polarizers[1]?.angle ?? 0} color="#f59e0b" label="Polarizer 2" enabled={polarizers[1]?.enabled ?? false} />
      <Polarizer x={POSITIONS.p3} angle={polarizers[2]?.angle ?? 0} color="#22c55e" label="Polarizer 3" enabled={polarizers[2]?.enabled ?? false} />
      {analyzer.enabled && <Analyzer angle={analyzer.angle} incomingAngle={calculations.incomingAngle} transmission={calculations.analyzerTransmission} />}
      <Detector intensity={calculations.intensityRatio} mode={isQuantum ? 'quantum' : 'classical'} photonRate={source.photonRate} />
      {!isQuantum && calculations.stages.map((stage) => <ClassicalBeam key={`${stage.from}-${stage.to}`} from={stage.from} to={stage.to} targetIntensity={stage.intensity} />)}
      {!isQuantum && calculations.stages.map((stage) => (
        <WaveLine key={`theory-wave-${stage.from}-${stage.to}`} from={stage.from} to={stage.to} angle={stage.angle} intensity={stage.intensity} source={source} sourceSegment={stage.from === POSITIONS.source} />
      ))}
      {!isQuantum && calculations.stages.map((stage) => (
        <ProjectionFilterVisual key={`theory-projection-${stage.elementX ?? stage.to}`} stage={stage} />
      ))}
      {isQuantum && <PhotonStream polarizers={polarizers} analyzer={analyzer} source={source} />}
      {isQuantum && analyzer.enabled && <QuantumCollapseOverlay calculations={calculations} />}
    </group>
  )
}

function PolarizationTheoryScene() {
  const source = useMemo(() => ({ ...DEFAULT_SOURCE, intensity: 100, frequency: 4.3, coherence: 42, polarizationAngle: 34 }), [])
  const polarizers = useMemo(() => [{ angle: 0, enabled: true }, { angle: 0, enabled: false }, { angle: 0, enabled: false }], [])
  const analyzer = useMemo(() => ({ angle: 0, enabled: false }), [])
  return (
    <>
      <TheoryOpticsBench source={source} polarizers={polarizers} analyzer={analyzer} />
      <TheoryArrow from={[-2.8, 1.15, 0.95]} to={[-1.55, 0.45, 0.35]} color="#67e8f9" />
      <TheoryArrow from={[-0.9, -0.8, 0.8]} to={[-1.58, -0.12, 0.24]} color="#fb7185" opacity={0.46} />
    </>
  )
}

function MalusTheoryScene({ active }) {
  const [angle, setAngle] = useState(0)
  const last = useRef(0)
  useFrame(({ clock }) => {
    const next = (Math.sin(clock.elapsedTime * 0.45) * 0.5 + 0.5) * 90
    if (active && Math.abs(next - last.current) > 0.7) {
      last.current = next
      setAngle(next)
    }
  })
  const source = useMemo(() => ({ ...DEFAULT_SOURCE, intensity: 100, frequency: 4.5, coherence: 92, polarizationAngle: 0 }), [])
  const polarizers = useMemo(() => [{ angle: 0, enabled: true }, { angle: 0, enabled: false }, { angle: 0, enabled: false }], [])
  const analyzer = useMemo(() => ({ angle, enabled: true }), [angle])
  return (
    <>
      <TheoryOpticsBench source={source} polarizers={polarizers} analyzer={analyzer} />
      <TheoryArrow from={[0.9, 1.25, 1.05]} to={[1.85, 1.25, 1.05]} color="#c084fc" />
      <TheoryArrow from={[2.4, 0.55, 0.65]} to={[3.4, 0.25, 0.25]} color="#facc15" opacity={0.68} />
    </>
  )
}

function SuperpositionTheoryScene({ mode = 'constructive' }) {
  const isConstructive = mode === 'constructive'
  const phaseB = isConstructive ? 0 : Math.PI
  const componentAmp = 0.28
  const resultantAmp = isConstructive ? componentAmp * 2 : 0
  const resultantColor = isConstructive ? '#22c55e' : '#94a3b8'
  return (
    <group scale={1.02}>
      <mesh position={[0.05, 0.22, -0.22]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.8, 2.95]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.28} />
      </mesh>

      <AnimatedWave color="#38bdf8" phase={0} y={0.86} amplitude={componentAmp} z={0.18} speed={1.2} xStart={-3.25} xEnd={-0.25} />
      <FieldVectorRibbon y={0.86} z={0.18} color="#38bdf8" phase={0} amp={componentAmp} xStart={-3.2} xEnd={-0.25} />
      <AnimatedWave color="#f97316" phase={phaseB} y={0.26} amplitude={componentAmp} z={-0.18} speed={1.2} xStart={-3.25} xEnd={-0.25} />
      <FieldVectorRibbon y={0.26} z={-0.18} color="#f97316" phase={phaseB} amp={componentAmp} xStart={-3.2} xEnd={-0.25} />

      <mesh position={[-0.05, 0.56, 0]} rotation={[0, 0, Math.PI / 5]}>
        <boxGeometry args={[0.1, 1.72, 1.14]} />
        <meshPhysicalMaterial color="#bae6fd" transparent opacity={0.22} roughness={0.16} transmission={0.32} emissive="#38bdf8" emissiveIntensity={0.12} />
      </mesh>
      <Line points={[[-1.05, 0.86, 0.18], [-0.05, 0.56, 0]]} color="#38bdf8" lineWidth={1.5} transparent opacity={0.58} />
      <Line points={[[-1.05, 0.26, -0.18], [-0.05, 0.56, 0]]} color="#f97316" lineWidth={1.5} transparent opacity={0.58} />

      <AnimatedWave color={resultantColor} phase={0} y={-0.56} amplitude={resultantAmp} z={0} speed={1.2} xStart={0.22} xEnd={3.25} opacity={0.96} />
      {resultantAmp > 0 ? (
        <FieldVectorRibbon y={-0.56} z={0} color={resultantColor} phase={0} amp={resultantAmp} xStart={0.3} xEnd={3.2} />
      ) : (
        <Line points={[[0.22, -0.56, 0], [3.25, -0.56, 0]]} color={resultantColor} lineWidth={2} transparent opacity={0.74} />
      )}

      <mesh position={[3.45, -0.56, 0]}>
        <boxGeometry args={[0.08, 1.35, 1.05]} />
        <meshBasicMaterial color={isConstructive ? '#22c55e' : '#64748b'} transparent opacity={isConstructive ? 0.38 : 0.2} />
      </mesh>
      <mesh position={[3.54, -0.56, 0]}>
        <sphereGeometry args={[isConstructive ? 0.18 : 0.055, 24, 12]} />
        <meshBasicMaterial color={isConstructive ? '#bbf7d0' : '#94a3b8'} transparent opacity={isConstructive ? 0.86 : 0.48} />
      </mesh>

      <TheoryArrow from={[-2.1, 1.26, 0.45]} to={[-1.2, 0.92, 0.22]} color="#38bdf8" opacity={0.52} />
      <TheoryArrow from={[-2.1, -0.1, 0.36]} to={[-1.2, 0.18, -0.1]} color="#f97316" opacity={0.52} />
      <TheoryArrow from={[1.05, -0.12, 0.2]} to={[2.05, -0.48, 0.03]} color={resultantColor} opacity={0.64} />

      <Html position={[-2.9, 1.42, 0.24]} center distanceFactor={8} occlude={false}>
        <div className="scene-label">amplitude a</div>
      </Html>
      <Html position={[-2.9, -0.16, -0.1]} center distanceFactor={8} occlude={false}>
        <div className="scene-label">{isConstructive ? 'amplitude b' : 'amplitude -b'}</div>
      </Html>
      <Html position={[2.15, -1.12, 0]} center distanceFactor={8} occlude={false}>
        <div className="scene-label">{isConstructive ? 'a + b' : 'a - b = 0'}</div>
      </Html>
    </group>
  )
}

function MeasurementBasisTheoryScene() {
  return <BlochLikeScene collapse label="Measurement basis projects the state onto allowed axes." />
}

function BornRuleTheoryScene() {
  return (
    <group>
      <AnimatedWave color="#c084fc" amplitude={0.5} xStart={-3.1} xEnd={0.25} opacity={0.86} />
      <FieldVectorRibbon y={0} color="#c084fc" amp={0.5} />
      <mesh position={[0.9, 0, 0]}>
        <sphereGeometry args={[0.85, 32, 16]} />
        <meshPhysicalMaterial color="#7dd3fc" transparent opacity={0.18} emissive="#38bdf8" emissiveIntensity={0.16} roughness={0.08} transmission={0.2} wireframe />
      </mesh>
      {[0.25, 0.52, 0.82].map((h, i) => (
        <mesh key={h} position={[1.9 + i * 0.32, -0.9 + h, 0]}>
          <boxGeometry args={[0.18, h * 1.8, 0.18]} />
          <meshBasicMaterial color={['#38bdf8', '#c084fc', '#facc15'][i]} transparent opacity={0.8} />
        </mesh>
      ))}
      <ProbabilityCloud />
      <TheoryArrow from={[0.95, 1.05, 0.4]} to={[1.95, 0.35, 0.1]} color="#facc15" opacity={0.58} />
    </group>
  )
}

function CollapseTheoryScene() {
  const flash = useRef()
  useFrame(({ clock }) => {
    if (flash.current) flash.current.material.opacity = Math.max(0, Math.sin(clock.elapsedTime * 2.4) ** 8)
  })
  return (
    <group>
      <AnimatedWave color="#38bdf8" y={0.35} amplitude={0.35} xEnd={0.2} />
      <AnimatedWave color="#c084fc" y={-0.35} phase={1.4} amplitude={0.35} xEnd={0.2} />
      <PolarizerSheet position={[0.45, 0, 0]} color="#facc15" />
      <AnimatedWave color="#22c55e" xStart={0.75} xEnd={3} amplitude={0.25} />
      <AnimatedWave color="#fb7185" xStart={0.75} xEnd={2.35} y={-0.55} amplitude={0.14} opacity={0.32} phase={1.8} />
      <mesh ref={flash} position={[0.45, 0, 0]}>
        <sphereGeometry args={[0.8, 24, 12]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.4} />
      </mesh>
      <TheoryArrow from={[0.45, 0.9, 0.6]} to={[1.35, 0.2, 0.2]} color="#22c55e" opacity={0.58} />
    </group>
  )
}

function ThreePolarizerTheoryScene() {
  const source = useMemo(() => ({ ...DEFAULT_SOURCE, intensity: 100, frequency: 4.6, coherence: 94, polarizationAngle: 45 }), [])
  const polarizers = useMemo(() => [{ angle: 45, enabled: true }, { angle: 90, enabled: true }, { angle: 135, enabled: true }], [])
  const analyzer = useMemo(() => ({ angle: 135, enabled: false }), [])
  return (
    <>
      <TheoryOpticsBench source={source} polarizers={polarizers} analyzer={analyzer} />
      <TheoryArrow from={[-0.55, 1.15, 0.9]} to={[0.12, 0.42, 0.25]} color="#facc15" opacity={0.6} />
    </>
  )
}

function ZenoTheoryScene() {
  return (
    <group scale={0.95}>
      {Array.from({ length: 12 }, (_, i) => (
        <PolarizerSheet key={i} position={[-2.65 + i * 0.48, 0, 0]} rotation={[0, 0, i * 0.09]} color={i % 2 ? '#c084fc' : '#38bdf8'} />
      ))}
      <AnimatedWave color="#22c55e" xStart={-3.2} xEnd={3.2} amplitude={0.18} speed={1.4} />
      <FieldVectorRibbon y={0} amp={0.18} color="#22c55e" />
      <TheoryArrow from={[-2.8, 1.1, 0.7]} to={[2.4, 1.1, 0.7]} color="#67e8f9" opacity={0.42} />
    </group>
  )
}

function QkdTheoryScene() {
  const photon = useRef()
  useFrame(({ clock }) => {
    if (photon.current) photon.current.position.x = -2.8 + ((clock.elapsedTime * 1.2) % 5.6)
  })
  return (
    <group>
      <mesh position={[-3, 0, 0]}><sphereGeometry args={[0.35, 32, 16]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.7} /></mesh>
      <mesh position={[3, 0, 0]}><sphereGeometry args={[0.35, 32, 16]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.7} /></mesh>
      <mesh position={[0, 0.55, 0]}><sphereGeometry args={[0.26, 32, 16]} /><meshStandardMaterial color="#fb7185" emissive="#fb7185" emissiveIntensity={0.55} transparent opacity={0.58} /></mesh>
      <AnimatedWave color="#facc15" xStart={-2.55} xEnd={2.55} amplitude={0.18} />
      <mesh ref={photon}><sphereGeometry args={[0.12, 16, 8]} /><meshBasicMaterial color="#f8fafc" /></mesh>
      <TheoryArrow from={[-2.45, 0.25, 0.35]} to={[2.45, 0.25, 0.35]} color="#facc15" opacity={0.56} />
      <TheoryArrow from={[0, 0.95, 0.25]} to={[0, 0.58, 0.05]} color="#fb7185" opacity={0.48} />
    </group>
  )
}

function BlochTheoryScene() {
  return <BlochLikeScene />
}

function ProbabilityAmplitudeTheoryScene() {
  return (
    <group>
      <AnimatedWave color="#c084fc" y={0.45} amplitude={0.45} />
      <AnimatedWave color="#22c55e" y={-0.55} amplitude={0.2} phase={1.2} />
      <mesh position={[2, -0.2, 0]}><boxGeometry args={[0.24, 1.4, 0.24]} /><meshBasicMaterial color="#c084fc" transparent opacity={0.75} /></mesh>
      <mesh position={[2.4, -0.62, 0]}><boxGeometry args={[0.24, 0.55, 0.24]} /><meshBasicMaterial color="#22c55e" transparent opacity={0.75} /></mesh>
    </group>
  )
}

function DualityTheoryScene() {
  const photon = useRef()
  useFrame(({ clock }) => {
    if (photon.current) photon.current.position.x = -2.8 + ((clock.elapsedTime * 1.45) % 5.6)
  })
  return (
    <group>
      <AnimatedWave color="#38bdf8" amplitude={0.32} opacity={0.75} />
      <mesh ref={photon}><sphereGeometry args={[0.14, 18, 10]} /><meshBasicMaterial color="#facc15" /></mesh>
      <mesh position={[2.9, 0, 0]}><boxGeometry args={[0.08, 1.9, 1.3]} /><meshBasicMaterial color="#dbeafe" transparent opacity={0.24} /></mesh>
    </group>
  )
}

function BlochLikeScene({ collapse = false }) {
  const vector = useRef()
  useFrame(({ clock }) => {
    if (vector.current) {
      vector.current.rotation.z = Math.sin(clock.elapsedTime * 0.7) * 0.8
      vector.current.rotation.y = clock.elapsedTime * 0.18
    }
  })
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1.35, 48, 24]} />
        <meshPhysicalMaterial color="#7dd3fc" transparent opacity={0.1} emissive="#38bdf8" emissiveIntensity={0.08} roughness={0.06} transmission={0.25} wireframe />
      </mesh>
      <mesh>
        <torusGeometry args={[1.35, 0.008, 8, 96]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.35, 0.008, 8, 96]} />
        <meshBasicMaterial color="#c084fc" transparent opacity={0.45} />
      </mesh>
      <Line points={[[-1.7, 0, 0], [1.7, 0, 0]]} color="#38bdf8" lineWidth={2} />
      <Line points={[[0, -1.7, 0], [0, 1.7, 0]]} color="#c084fc" lineWidth={2} />
      <Line points={[[0, 0, -1.7], [0, 0, 1.7]]} color="#facc15" lineWidth={2} />
      <group ref={vector}>
        <Line points={[[0, 0, 0], [1.05, 0.82, 0.35]]} color="#facc15" lineWidth={3} />
        <mesh position={[1.05, 0.82, 0.35]}><sphereGeometry args={[0.1, 16, 8]} /><meshBasicMaterial color="#facc15" /></mesh>
      </group>
      {collapse && <Line points={[[1.05, 0.82, 0.35], [1.05, 0, 0]]} color="#22c55e" lineWidth={2} dashed />}
      <TheoryArrow from={[0.2, 1.5, 0.55]} to={[0.9, 0.78, 0.28]} color="#facc15" opacity={0.5} />
    </group>
  )
}

function TheoryVisualPanel({ topic, superpositionMode, onSuperpositionModeChange }) {
  return (
    <div className="theory-visual-panel theory-live-panel">
      {topic.title === 'Superposition' && (
        <div className="superposition-mode-tabs" aria-label="Superposition visualization mode">
          <button type="button" className={superpositionMode === 'constructive' ? 'active' : ''} onClick={() => onSuperpositionModeChange('constructive')}>
            Constructive
          </button>
          <button type="button" className={superpositionMode === 'destructive' ? 'active' : ''} onClick={() => onSuperpositionModeChange('destructive')}>
            Destructive
          </button>
        </div>
      )}
      <TheorySceneRenderer topic={topic} superpositionMode={superpositionMode} />
      <TheoryReferenceStrip references={topic.references} />
    </div>
  )
}

function TheoryReferenceStrip({ references }) {
  return (
    <div className="reference-strip">
      <span>Learn More / References</span>
      <div>
        {references.map((ref) => (
          <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer">{ref.label}</a>
        ))}
      </div>
    </div>
  )
}

function Header({ labState, setLabState, saveState, onBackHome }) {
  const tabs = [
    ['lab', Home, 'Lab'],
    ['theory', BookOpen, 'Theory'],
    ['zeno', Zap, 'Zeno'],
  ]
  return (
    <header className="app-header">
      <div className="header-dots" />
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button type="button" className="lab-back-button" onClick={onBackHome}>
            <ArrowLeft size={17} /> Home
          </button>
          <div>
            <h1>Vlabs Quantum Polarization Lab — Malus's Law</h1>
            <p>Explore Superposition & Measurement through Light Polarization</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Primary navigation">
          {tabs.map(([key, Icon, label]) => (
            <button key={key} type="button" onClick={() => setLabState((s) => ({ ...s, activeTab: key }))} className={`nav-tab ${labState.activeTab === key ? 'active' : ''}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
          <button type="button" onClick={saveState} className="icon-button" aria-label="Save lab state to URL"><Save size={17} /></button>
        </nav>
      </div>
    </header>
  )
}

function initialState() {
  const params = new URLSearchParams(window.location.search)
  return {
    mode: params.get('mode') || 'classical',
    polarizers: [
      { angle: Number(params.get('p1')) || 0, enabled: params.get('p1on') !== '0' },
      { angle: Number(params.get('p2')) || 45, enabled: params.get('p2on') !== '0' },
      { angle: Number(params.get('p3')) || 90, enabled: params.get('p3on') === '1' },
    ],
    analyzer: { angle: Number(params.get('analyzer')) || 45, enabled: params.get('aon') !== '0' },
    source: {
      ...DEFAULT_SOURCE,
      intensity: Number(params.get('intensity')) || DEFAULT_SOURCE.intensity,
      photonRate: Number(params.get('rate')) || DEFAULT_SOURCE.photonRate,
      polarizationAngle: Number(params.get('sourceAngle')) || DEFAULT_SOURCE.polarizationAngle,
    },
    activeDemo: null,
    activeTab: 'lab',
    showOnboarding: params.get('intro') !== '0',
    demoStep: 0,
    zenoN: 8,
    eveEnabled: false,
  }
}

function PolarizationLabApp({ onBackHome }) {
  const [labState, setLabState] = useState(initialState)
  const calculations = useMemo(() => getCalculations(labState.polarizers, labState.analyzer, labState.source), [labState.polarizers, labState.analyzer, labState.source])
  const currentTab = ['lab', 'theory', 'zeno'].includes(labState.activeTab) ? labState.activeTab : 'lab'

  function resetLab() {
    setLabState((s) => ({
      ...s,
      activeDemo: null,
      analyzer: { angle: 45, enabled: true },
      source: DEFAULT_SOURCE,
      polarizers: [{ angle: 0, enabled: true }, { angle: 45, enabled: true }, { angle: 90, enabled: false }],
    }))
  }

  function runThreeDemo() {
    setLabState((s) => ({
      ...s,
      activeTab: 'lab',
      activeDemo: 'threePolarizer',
      demoStep: 0,
      analyzer: { angle: 135, enabled: true },
      polarizers: [{ angle: 45, enabled: true }, { angle: 90, enabled: true }, { angle: 135, enabled: true }],
    }))
  }

  function runQkdDemo() {
    setLabState((s) => ({ ...s, activeTab: 'lab', activeDemo: 'qkd', mode: 'quantum' }))
  }

  function saveState() {
    const next = new URLSearchParams({
      p1: labState.polarizers[0].angle,
      p2: labState.polarizers[1].angle,
      p3: labState.polarizers[2].angle,
      p1on: labState.polarizers[0].enabled ? '1' : '0',
      p2on: labState.polarizers[1].enabled ? '1' : '0',
      p3on: labState.polarizers[2].enabled ? '1' : '0',
      analyzer: labState.analyzer.angle,
      aon: labState.analyzer.enabled ? '1' : '0',
      mode: labState.mode,
      rate: labState.source.photonRate,
      intensity: labState.source.intensity,
      sourceAngle: labState.source.polarizationAngle,
    })
    window.history.replaceState(null, '', `?${next.toString()}`)
  }

  return (
    <div className={`min-h-screen ${labState.mode === 'quantum' ? 'theme-quantum' : 'theme-classical'}`}>
      <Header labState={{ ...labState, activeTab: currentTab }} setLabState={setLabState} saveState={saveState} onBackHome={onBackHome} />
      <main className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
        {currentTab === 'lab' && <LabTab labState={labState} setLabState={setLabState} calculations={calculations} resetLab={resetLab} runThreeDemo={runThreeDemo} runQkdDemo={runQkdDemo} />}
        {currentTab === 'theory' && <TheoryTab />}
        {currentTab === 'zeno' && <ZenoTab labState={labState} setLabState={setLabState} />}
      </main>
    </div>
  )
}

function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openRoute = (route) => {
    window.history.pushState(null, '', route)
    setPath(route)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goHome = () => openRoute('/')

  if (path === polarizationLabRoute) return <PolarizationLabApp onBackHome={goHome} />
  return <PlatformHome onOpenLab={openRoute} />
}

export default App
